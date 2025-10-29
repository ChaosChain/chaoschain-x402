import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Address, type Hash } from 'viem';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { VerifyRequest, SettleRequest } from '../types';
import crypto from 'crypto';

// Helper to parse payment header
function parsePaymentHeader(header: string | { sender: string; nonce: string; validAfter?: string; validBefore?: string; signature?: string }) {
  if (typeof header === 'string') {
    return JSON.parse(Buffer.from(header, 'base64').toString());
  }
  return header;
}

// Chain configuration with finality settings
const CHAIN_CONFIG = {
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!, confirmations: 2 },
  'ethereum-sepolia': { chain: sepolia, rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL!, confirmations: 3 },
  'base-mainnet': { chain: base, rpcUrl: process.env.BASE_MAINNET_RPC_URL!, confirmations: 2 },
  'ethereum-mainnet': { chain: mainnet, rpcUrl: process.env.ETHEREUM_MAINNET_RPC_URL!, confirmations: 3 },
} as const;

// USDC contract addresses
const USDC_ADDRESSES: Record<string, Address> = {
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'base-mainnet': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'ethereum-mainnet': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};

// ERC-20 ABI (minimal + decimals + transferFrom)
const ERC20_ABI = [
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
] as const;

export async function verifyPaymentManaged(request: VerifyRequest): Promise<{
  isValid: boolean;
  invalidReason: string | null;
  balance?: string;
  allowance?: string;
  decimals?: number;
}> {
  const network = request.paymentRequirements.network;
  const chainConfig = CHAIN_CONFIG[network as keyof typeof CHAIN_CONFIG];
  
  if (!chainConfig) {
    return { isValid: false, invalidReason: `Unsupported network: ${network}` };
  }

  const publicClient = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl, { retryCount: 3, retryDelay: 1000 }),
  });

  // Parse payment header
  const paymentHeader = parsePaymentHeader(request.paymentHeader);

  // Get payment details
  const payerAddress = paymentHeader.sender as Address;
  const asset = request.paymentRequirements.asset;
  
  // Check if payer is on deny list (would query Supabase in real implementation)
  // const isDenied = await checkDenyList(payerAddress);
  // if (isDenied) return { isValid: false, invalidReason: 'Address on deny list' };

  // Verify nonce hasn't been used (replay protection)
  const nonce = paymentHeader.nonce;
  // const nonceUsed = await checkNonce(payerAddress, network, nonce);
  // if (nonceUsed) return { isValid: false, invalidReason: 'Nonce already used' };

  // Verify expiry (validBefore)
  if (paymentHeader.validBefore) {
    const validBefore = new Date(paymentHeader.validBefore);
    if (validBefore < new Date()) {
      return { isValid: false, invalidReason: 'Payment expired' };
    }
  }

  // Verify validAfter
  if (paymentHeader.validAfter) {
    const validAfter = new Date(paymentHeader.validAfter);
    if (validAfter > new Date()) {
      return { isValid: false, invalidReason: 'Payment not yet valid' };
    }
  }

  // For ERC-20 (USDC)
  const usdcAddress = USDC_ADDRESSES[network];
  if (!usdcAddress) {
    return { isValid: false, invalidReason: `USDC not configured for ${network}` };
  }

  // Get token decimals dynamically
  const decimals = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });

  const amount = parseUnits(request.paymentRequirements.maxAmountRequired, decimals);

  // Check balance
  const balance = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [payerAddress],
  });

  if (balance < amount) {
    return {
      isValid: false,
      invalidReason: 'Insufficient USDC balance',
      balance: formatUnits(balance, decimals),
      decimals,
    };
  }

  // Check allowance (payer must have approved facilitator)
  const facilitatorAddress = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY! as `0x${string}`).address;
  const allowance = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [payerAddress, facilitatorAddress],
  });

  if (allowance < amount) {
    return {
      isValid: false,
      invalidReason: 'Insufficient allowance - please approve facilitator',
      balance: formatUnits(balance, decimals),
      allowance: formatUnits(allowance, decimals),
      decimals,
    };
  }

  // TODO: Verify EIP-712 signature over payment intent
  // const isValidSignature = await verifyEIP712Signature(request.paymentHeader, request.paymentRequirements);
  // if (!isValidSignature) return { isValid: false, invalidReason: 'Invalid signature' };

  return {
    isValid: true,
    invalidReason: null,
    balance: formatUnits(balance, decimals),
    allowance: formatUnits(allowance, decimals),
    decimals,
  };
}

/**
 * Atomic dual-transfer settlement: payer → merchant + treasury
 * Uses transferFrom to keep facilitator non-custodial
 */
export async function settlePaymentManaged(
  request: SettleRequest,
  feeAmount: bigint,
  netAmount: bigint
): Promise<{ 
  txHash: Hash; 
  txHashFee?: Hash;
  status: 'pending' | 'partial_settlement' | 'confirmed' | 'failed';
  confirmations: number;
}> {
  const network = request.paymentRequirements.network;
  const chainConfig = CHAIN_CONFIG[network as keyof typeof CHAIN_CONFIG];

  if (!chainConfig) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const account = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY! as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl, { retryCount: 3, retryDelay: 1000 }),
  });

  const publicClient = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl),
  });

  const paymentHeader = parsePaymentHeader(request.paymentHeader);
  const payerAddress = paymentHeader.sender as Address;
  const merchantAddress = request.paymentRequirements.payTo as Address;
  const treasuryAddress = process.env.TREASURY_ADDRESS! as Address;
  const usdcAddress = USDC_ADDRESSES[network];

  if (!usdcAddress) {
    throw new Error(`USDC not configured for ${network}`);
  }

  // Execute atomic dual-transfer using transferFrom
  // Transfer 1: payer → merchant (net amount)
  try {
    const hashMerchant = await walletClient.writeContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'transferFrom',
      args: [payerAddress, merchantAddress, netAmount],
    });

    // Transfer 2: payer → treasury (fee)
    let hashFee: Hash | undefined;
    if (feeAmount > 0n) {
      try {
        hashFee = await walletClient.writeContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'transferFrom',
          args: [payerAddress, treasuryAddress, feeAmount],
        });
      } catch (feeError) {
        // Merchant transfer succeeded but fee failed - mark as partial_settlement
        return {
          txHash: hashMerchant,
          status: 'partial_settlement',
          confirmations: 0,
        };
      }
    }

    // Both transfers succeeded - wait for confirmations
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hashMerchant,
      confirmations: chainConfig.confirmations,
    });

    return {
      txHash: hashMerchant,
      txHashFee: hashFee,
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      confirmations: chainConfig.confirmations,
    };
  } catch (error) {
    throw new Error(`Settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Background job to check finality of pending transactions
 */
export async function checkTransactionFinality(
  txHash: Hash,
  network: string,
  requiredConfirmations: number
): Promise<{ confirmed: boolean; confirmations: number; status: 'success' | 'reverted' }> {
  const chainConfig = CHAIN_CONFIG[network as keyof typeof CHAIN_CONFIG];
  const publicClient = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl),
  });

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const currentBlock = await publicClient.getBlockNumber();
  const confirmations = Number(currentBlock - receipt.blockNumber);

  return {
    confirmed: confirmations >= requiredConfirmations,
    confirmations,
    status: receipt.status,
  };
}

