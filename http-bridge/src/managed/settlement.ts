import { parseUnits, formatUnits, type Address, type Hash, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { VerifyRequest, SettleRequest } from '../types';
import {
  getTokenAddress,
  getTokenConfig,
  getPublicClient,
  getWalletClient,
  getConfirmations
} from '../config/chains';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse payment header - supports multiple formats:
 * 1. ChaosChain SDK format: { payload: { authorization: {...} }, signature: "0x..." }
 * 2. PayAI format: { from, to, value, validAfter, validBefore, nonce, v, r, s }
 * 3. Simple format: { sender, nonce, validAfter, validBefore, signature }
 */
function parsePaymentHeader(header: string | any) {
  let parsed = header;

  if (typeof header === 'string') {
    parsed = JSON.parse(Buffer.from(header, 'base64').toString());
  }

  // Normalize to consistent format
  if (parsed.payload?.authorization) {
    // ChaosChain SDK format (nested authorization)
    return {
      from: parsed.payload.authorization.from,
      to: parsed.payload.authorization.to,
      value: parsed.payload.authorization.value,
      validAfter: parsed.payload.authorization.validAfter,
      validBefore: parsed.payload.authorization.validBefore,
      nonce: parsed.payload.authorization.nonce,
      signature: parsed.signature,
      v: parsed.v,
      r: parsed.r,
      s: parsed.s,
    };
  } else if (parsed.from && parsed.nonce) {
    // PayAI / x402 standard format (EIP-3009)
    return {
      from: parsed.from,
      to: parsed.to,
      value: parsed.value,
      validAfter: parsed.validAfter,
      validBefore: parsed.validBefore,
      nonce: parsed.nonce,
      v: parsed.v,
      r: parsed.r,
      s: parsed.s,
      // Note: signature field is optional (for combined sig fallback)
      signature: parsed.signature,
    };
  } else if (parsed.sender && parsed.nonce) {
    // Simple format
    return {
      from: parsed.sender,
      to: parsed.to,
      value: parsed.value,
      validAfter: parsed.validAfter,
      validBefore: parsed.validBefore,
      nonce: parsed.nonce,
      signature: parsed.signature,
      v: parsed.v,
      r: parsed.r,
      s: parsed.s,
    };
  }

  throw new Error('Invalid payment header format');
}

/**
 * Split signature into v, r, s components
 * Handles both combined signature and pre-split components
 */
function splitSignature(sig: string | { v?: number; r?: string; s?: string }) {
  // If already split, return as-is
  if (typeof sig === 'object' && sig.v && sig.r && sig.s) {
    return { v: sig.v, r: sig.r, s: sig.s };
  }

  // Parse combined signature (0x + 65 bytes)
  const signature = typeof sig === 'string' ? sig : (sig as any).signature;
  if (!signature) {
    throw new Error('Missing signature');
  }

  const cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature;
  const r = '0x' + cleanSig.slice(0, 64);
  const s = '0x' + cleanSig.slice(64, 128);
  const v = parseInt(cleanSig.slice(128, 130), 16);

  return { v, r, s };
}

// ============================================================================
// TOKEN ABI (EIP-3009 + Standard ERC-20)
// ============================================================================

const TOKEN_ABI = [
  // ERC-20 Standard
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // EIP-3009: transferWithAuthorization
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    name: 'transferWithAuthorization',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // EIP-3009: Check if authorization is used
  {
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
    ],
    name: 'authorizationState',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============================================================================
// VERIFY PAYMENT (EIP-3009)
// ============================================================================

/**
 * Verify payment using EIP-3009
 * ✅ NO approval check needed - signature IS the authorization
 * ✅ Checks: balance, nonce, time validity
 */
export async function verifyPaymentManaged(
  request: VerifyRequest
): Promise<{
  isValid: boolean;
  invalidReason: string | null;
  decimals?: number;
}> {
  try {
    const { network, asset } = request.paymentRequirements;

    // Get configuration from central config using helpers
    const publicClient = getPublicClient(network);
    const tokenAddress = getTokenAddress(network, asset);
    const tokenConfig = getTokenConfig(asset);

    // Parse payment header (supports multiple formats)
    const auth = parsePaymentHeader(request.paymentHeader);
    const payerAddress = auth.from as Address;

    // 1. Get token decimals from config (faster than RPC)
    const decimals = tokenConfig.decimals;

    // 2. maxAmountRequired is already in base units (wei), no need to parse
    const amount = BigInt(request.paymentRequirements.maxAmountRequired);

    // 3. Check time validity (validAfter / validBefore)
    const now = Math.floor(Date.now() / 1000);

    if (auth.validAfter) {
      const validAfter = typeof auth.validAfter === 'string' ? parseInt(auth.validAfter) : auth.validAfter;
      if (now < validAfter) {
        return {
          isValid: false,
          invalidReason: `Authorization not yet valid (validAfter: ${validAfter}, now: ${now})`,
          decimals,
        };
      }
    }

    if (auth.validBefore) {
      const validBefore = typeof auth.validBefore === 'string' ? parseInt(auth.validBefore) : auth.validBefore;
      if (now > validBefore) {
        return {
          isValid: false,
          invalidReason: `Authorization expired (validBefore: ${validBefore}, now: ${now})`,
          decimals,
        };
      }
    }

    // 4. Check payer has enough token balance
    const balance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [payerAddress],
    }) as bigint;

    if (balance < amount) {
      return {
        isValid: false,
        invalidReason: `Insufficient ${asset} balance. Required: ${formatUnits(amount, decimals)} ${asset}, Available: ${formatUnits(balance, decimals)} ${asset}`,
        decimals,
      };
    }

    // 5. Check authorization based on token type
    if (tokenConfig.supportsEIP3009) {
      // EIP-3009: Check if nonce has been used (replay protection)
      const nonceBytes32 = auth.nonce.startsWith('0x') ? auth.nonce : `0x${auth.nonce}`;

      const authUsed = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: TOKEN_ABI,
        functionName: 'authorizationState',
        args: [payerAddress, nonceBytes32],
      }) as boolean;

      if (authUsed) {
        return {
          isValid: false,
          invalidReason: `Authorization already used (nonce: ${auth.nonce})`,
          decimals,
        };
      }

      // ✅ NO ALLOWANCE CHECK NEEDED with EIP-3009!
      // The signature IS the authorization
    } else {
      // Standard ERC-20: Check allowance (relayer pattern)
      if (!process.env.FACILITATOR_PRIVATE_KEY) {
        throw new Error('FACILITATOR_PRIVATE_KEY not configured for relayer check');
      }
      const facilitatorAddress = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`).address;

      const allowance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: TOKEN_ABI,
        functionName: 'allowance',
        args: [payerAddress, facilitatorAddress],
      }) as bigint;

      if (allowance < amount) {
        return {
          isValid: false,
          invalidReason: `Insufficient allowance. User must approve facilitator (${facilitatorAddress}) for ${formatUnits(amount, decimals)} ${asset}. Current allowance: ${formatUnits(allowance, decimals)} ${asset}`,
          decimals,
        };
      }
    }

    return {
      isValid: true,
      invalidReason: null,
      decimals,
    };
  } catch (error) {
    return {
      isValid: false,
      invalidReason: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

// ============================================================================
// SETTLE PAYMENT (DUAL-MODE: EIP-3009 + RELAYER)
// ============================================================================

/**
 * Settle payment using appropriate method based on token support
 * - EIP-3009: For USDC (gasless, no approval needed)
 * - Relayer: For W0G and other ERC-20 tokens (requires approval)
 */
export async function settlePaymentManaged(
  request: SettleRequest,
  feeAmount: bigint,
  netAmount: bigint
): Promise<{
  txHash: Hash;
  txHashFee?: Hash;
  status: 'pending' | 'confirmed' | 'partial_settlement' | 'failed';
  confirmations: number;
}> {
  const { network, asset } = request.paymentRequirements;

  // Use config to decide settlement method
  const tokenConfig = getTokenConfig(asset);

  // Route to appropriate settlement method
  if (tokenConfig.supportsEIP3009) {
    return settleWithEIP3009(request, feeAmount, netAmount);
  } else {
    return settleWithRelayer(request, feeAmount, netAmount);
  }
}

/**
 * Settle payment using EIP-3009 transferWithAuthorization (USDC)
 * ✅ Gasless for payer (facilitator pays gas)
 * ✅ No prior approval needed
 * ✅ Single signature authorizes transfer
 */
async function settleWithEIP3009(
  request: SettleRequest,
  feeAmount: bigint,
  netAmount: bigint
): Promise<{
  txHash: Hash;
  txHashFee?: Hash;
  status: 'pending' | 'confirmed' | 'partial_settlement' | 'failed';
  confirmations: number;
}> {
  const { network, asset } = request.paymentRequirements;

  // Get clients and config from central registry
  const walletClient = getWalletClient(network);
  const publicClient = getPublicClient(network);
  const tokenAddress = getTokenAddress(network, asset);
  const requiredConfirmations = getConfirmations(network);

  try {
    // Parse payment header (supports multiple formats)
    const auth = parsePaymentHeader(request.paymentHeader);
    const payerAddress = auth.from as Address;
    const merchantAddress = request.paymentRequirements.payTo as Address;

    // Extract or parse signature components
    const { v, r, s } = auth.v && auth.r && auth.s
      ? { v: auth.v, r: auth.r, s: auth.s }
      : splitSignature(auth.signature || auth);

    // Prepare EIP-3009 parameters
    const validAfter = auth.validAfter ? BigInt(auth.validAfter) : 0n;
    const validBefore = auth.validBefore
      ? BigInt(auth.validBefore)
      : BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour default
    // Use nonce as-is (already bytes32 hex string)
    const nonceBytes32 = auth.nonce.startsWith('0x') ? auth.nonce : `0x${auth.nonce}`;

    // ⚠️ CRITICAL: EIP-3009 signature is for the EXACT amount in auth.value
    // We CANNOT change the amount (even for fees) without invalidating the signature
    // For MVP: Send full amount to merchant, track fees off-chain
    const signedAmount = BigInt(auth.value);

    // Transfer using EIP-3009 transferWithAuthorization
    const hashMerchant = await walletClient.writeContract({
      address: tokenAddress as Address,
      abi: TOKEN_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        payerAddress,           // from (payer)
        merchantAddress,        // to (merchant)
        signedAmount,           // ✅ MUST use the exact signed amount
        validAfter,             // validAfter
        validBefore,            // validBefore
        nonceBytes32,           // nonce
        v,                      // v (signature)
        r as `0x${string}`,     // r (signature)
        s as `0x${string}`,     // s (signature)
      ],
    });

    // Fee collection: For MVP, fees are tracked off-chain only
    // Merchant receives full signed amount
    // Production TODO: Implement dual-signature for on-chain fee collection
    let hashFee: Hash | undefined;

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hashMerchant,
      confirmations: requiredConfirmations,
    });

    return {
      txHash: hashMerchant,
      txHashFee: hashFee,
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      confirmations: requiredConfirmations,
    };
  } catch (error) {
    throw new Error(`EIP-3009 settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Settle payment using relayer pattern with ERC-20 transferFrom (W0G)
 * ⚠️ Requires prior approval (user must approve facilitator once)
 * ⚠️ User paid gas for approval, facilitator pays gas for transfer
 * ✅ Works with all standard ERC-20 tokens
 */
async function settleWithRelayer(
  request: SettleRequest,
  feeAmount: bigint,
  netAmount: bigint
): Promise<{
  txHash: Hash;
  txHashFee?: Hash;
  status: 'pending' | 'confirmed' | 'partial_settlement' | 'failed';
  confirmations: number;
}> {
  const { network, asset } = request.paymentRequirements;

  // Get clients and config from central registry
  const walletClient = getWalletClient(network);
  const publicClient = getPublicClient(network);
  const tokenAddress = getTokenAddress(network, asset);
  const requiredConfirmations = getConfirmations(network);

  try {
    // Parse payment header
    const auth = parsePaymentHeader(request.paymentHeader);
    const payerAddress = auth.from as Address;
    const merchantAddress = request.paymentRequirements.payTo as Address;
    const treasuryAddress = process.env.TREASURY_ADDRESS! as Address;

    // Execute transfer to merchant using transferFrom
    const hashMerchant = await walletClient.writeContract({
      address: tokenAddress as Address,
      abi: TOKEN_ABI,
      functionName: 'transferFrom',
      args: [payerAddress, merchantAddress, netAmount],
    });

    // Execute fee transfer to treasury
    const hashFee = await walletClient.writeContract({
      address: tokenAddress as Address,
      abi: TOKEN_ABI,
      functionName: 'transferFrom',
      args: [payerAddress, treasuryAddress, feeAmount],
    });

    // Wait for BOTH transactions to confirm
    const [receiptMerchant, receiptFee] = await Promise.all([
      publicClient.waitForTransactionReceipt({
        hash: hashMerchant,
        confirmations: requiredConfirmations,
      }),
      publicClient.waitForTransactionReceipt({
        hash: hashFee,
        confirmations: requiredConfirmations,
      }),
    ]);

    // Check both transactions succeeded
    if (receiptMerchant.status !== 'success' || receiptFee.status !== 'success') {
      return {
        txHash: hashMerchant,
        txHashFee: hashFee,
        status: 'partial_settlement',
        confirmations: requiredConfirmations,
      };
    }

    return {
      txHash: hashMerchant,
      txHashFee: hashFee,
      status: 'confirmed',
      confirmations: requiredConfirmations,
    };
  } catch (error) {
    throw new Error(`Relayer settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// TRANSACTION FINALITY CHECK
// ============================================================================

/**
 * Background job to check finality of pending transactions
 */
export async function checkTransactionFinality(
  txHash: Hash,
  network: string,
  requiredConfirmations: number
): Promise<{ confirmed: boolean; confirmations: number; status: 'success' | 'reverted' }> {
  // Use public client from factory
  const publicClient = getPublicClient(network);

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const currentBlock = await publicClient.getBlockNumber();
  const confirmations = Number(currentBlock - receipt.blockNumber);

  return {
    confirmed: confirmations >= requiredConfirmations,
    confirmations,
    status: receipt.status,
  };
}
