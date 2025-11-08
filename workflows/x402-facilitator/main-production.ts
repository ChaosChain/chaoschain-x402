import { cre, Runner, type Runtime } from "@chainlink/cre-sdk";
import type { Address, Hex } from "viem";
import { USDC_ABI, getUSDCAddress } from "./contracts/bindings/USDC";
import { 
  VALIDATION_REGISTRY_ABI, 
  getValidationRegistryAddress,
  isValidationRegistryDeployed 
} from "./contracts/bindings/ValidationRegistry";

/**
 * ChaosChain-x402 Decentralized Facilitator Workflow - PRODUCTION MODE
 * 
 * This CRE workflow provides decentralized verification and settlement
 * for x402 payments with REAL blockchain interactions.
 * 
 * Architecture:
 * - Multiple independent nodes execute this workflow
 * - Each node verifies payment signatures and settlement conditions
 * - BFT consensus aggregates results into a single verified output
 * - Cryptographic proofs are generated for transparency
 * 
 * Features:
 * - ✅ Real EVM blockchain reads (nonces, balances, allowances)
 * - ✅ EIP-3009 cryptographic signature verification
 * - ✅ On-chain settlement via transferWithAuthorization
 * - ✅ Proof-of-Agency emission (ERC-8004)
 * - ✅ HTTP triggers for REST API endpoints
 * - ✅ BFT consensus for all operations
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Workflow configuration loaded from config.json
 */
type Config = {
  mode: "simulate" | "production";
  supportedNetworks: string[];
  supportedSchemes: string[];
  confirmations: number;
  enableProofOfAgency: boolean;
};

/**
 * x402 Payment Payload (from x402 protocol spec)
 */
type X402PaymentPayload = {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    v: number;
    r: string;
    s: string;
  };
};

/**
 * Verification request structure
 */
type VerifyRequest = {
  paymentHeader: string;
  paymentRequirements: {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset: string;
    resource: string;
  };
};

/**
 * Verification response (returned to client)
 */
type VerifyResponse = {
  isValid: boolean;
  invalidReason: string | null;
  consensusProof: string;
  reportId: string;
  timestamp: number;
};

/**
 * Settlement request structure
 */
type SettleRequest = {
  paymentHeader: string;
  paymentRequirements: {
    scheme: string;
    network: string;
    payTo: string;
    asset: string;
    amount: string;
    resource?: string;
  };
  agentId?: string;
};

/**
 * Settlement response (returned to client)
 */
type SettleResponse = {
  success: boolean;
  error: string | null;
  txHash: string | null;
  evidenceHash: string | null;
  networkId: string | null;
  consensusProof: string;
  timestamp: number;
};

/**
 * HTTP Request type
 */
type HTTPRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
};

/**
 * HTTP Response type
 */
type HTTPResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse and decode payment header from base64
 */
function parsePaymentHeader(headerBase64: string): X402PaymentPayload {
  try {
    const decoded = Buffer.from(headerBase64, "base64").toString("utf-8");
    return JSON.parse(decoded) as X402PaymentPayload;
  } catch (error) {
    throw new Error(`Failed to parse payment header: ${error.message}`);
  }
}

/**
 * Generate unique report ID for verification
 */
function generateReportId(): string {
  return `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Ensure nonce is properly formatted as bytes32
 */
function formatNonce(nonce: string): Hex {
  if (nonce.startsWith("0x")) {
    return nonce as Hex;
  }
  return `0x${nonce}` as Hex;
}

/**
 * Get chain ID from network name
 */
function getChainId(network: string): number {
  const chainIds: Record<string, number> = {
    "base-sepolia": 84532,
    "ethereum-sepolia": 11155111,
    "base-mainnet": 8453,
    "ethereum-mainnet": 1,
  };
  return chainIds[network] || 0;
}

// ============================================================================
// VERIFY HANDLER - PRODUCTION MODE
// ============================================================================

/**
 * VERIFY HANDLER (Production)
 * 
 * Verifies an x402 payment payload using real on-chain data and consensus.
 * 
 * Steps:
 * 1. Decode and parse payment payload
 * 2. Read on-chain nonce state (replay protection)
 * 3. Read user token balance
 * 4. Verify EIP-3009 cryptographic signature
 * 5. Verify amount and recipient match requirements
 * 6. Return BFT consensus-verified result with cryptographic proof
 */
const handleVerify = async (
  runtime: Runtime<Config>,
  request: VerifyRequest
): Promise<VerifyResponse> => {
  runtime.log("[VERIFY] Starting decentralized payment verification (PRODUCTION)");
  runtime.log(`[VERIFY] Network: ${request.paymentRequirements.network}`);
  runtime.log(`[VERIFY] Asset: ${request.paymentRequirements.asset}`);
  
  try {
    // 1. Decode payment payload
    const payload = parsePaymentHeader(request.paymentHeader);
    runtime.log(`[VERIFY] Decoded payload from ${payload.payload.from}`);
    
    // 2. Get token contract address
    const tokenAddress = getUSDCAddress(request.paymentRequirements.network);
    runtime.log(`[VERIFY] Token address: ${tokenAddress}`);
    
    // 3. Read on-chain nonce state (replay protection)
    runtime.log("[VERIFY] Checking nonce state on-chain...");
    const nonceHex = formatNonce(payload.payload.nonce);
    
    const isNonceUsed = await runtime.evm.read({
      chain: request.paymentRequirements.network,
      address: tokenAddress,
      abi: USDC_ABI,
      functionName: "authorizationState",
      args: [payload.payload.from as Address, nonceHex],
    });
    
    if (isNonceUsed) {
      runtime.log("[VERIFY] ❌ Nonce already used (replay attack detected)");
      return {
        isValid: false,
        invalidReason: "Nonce already used (replay protection)",
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    runtime.log("[VERIFY] ✅ Nonce is valid (not used)");
    
    // 4. Read user balance
    runtime.log("[VERIFY] Checking payer balance...");
    const balance = await runtime.evm.read({
      chain: request.paymentRequirements.network,
      address: tokenAddress,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [payload.payload.from as Address],
    });
    
    const requiredAmount = BigInt(payload.payload.value);
    
    if (BigInt(balance) < requiredAmount) {
      runtime.log(`[VERIFY] ❌ Insufficient balance: ${balance} < ${requiredAmount}`);
      return {
        isValid: false,
        invalidReason: `Insufficient balance. Required: ${requiredAmount}, Available: ${balance}`,
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    runtime.log(`[VERIFY] ✅ Balance sufficient: ${balance} >= ${requiredAmount}`);
    
    // 5. Verify EIP-3009 signature cryptographically
    runtime.log("[VERIFY] Verifying EIP-3009 signature...");
    
    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: getChainId(request.paymentRequirements.network),
      verifyingContract: tokenAddress,
    };
    
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    
    const message = {
      from: payload.payload.from,
      to: payload.payload.to,
      value: payload.payload.value,
      validAfter: payload.payload.validAfter,
      validBefore: payload.payload.validBefore,
      nonce: nonceHex,
    };
    
    const isSignatureValid = await runtime.crypto.verifyTypedSignature({
      domain,
      types,
      message,
      signature: {
        v: payload.payload.v,
        r: payload.payload.r as Hex,
        s: payload.payload.s as Hex,
      },
    });
    
    if (!isSignatureValid) {
      runtime.log("[VERIFY] ❌ Invalid EIP-3009 signature");
      return {
        isValid: false,
        invalidReason: "Invalid EIP-3009 signature",
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    runtime.log("[VERIFY] ✅ Signature cryptographically valid");
    
    // 6. Verify amount matches requirements
    const maxAllowed = BigInt(request.paymentRequirements.maxAmountRequired);
    if (requiredAmount > maxAllowed) {
      runtime.log(`[VERIFY] ❌ Amount exceeds maximum: ${requiredAmount} > ${maxAllowed}`);
      return {
        isValid: false,
        invalidReason: `Amount exceeds maximum allowed: ${requiredAmount} > ${maxAllowed}`,
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    // 7. Verify recipient matches
    if (payload.payload.to.toLowerCase() !== request.paymentRequirements.payTo.toLowerCase()) {
      runtime.log("[VERIFY] ❌ Recipient mismatch");
      return {
        isValid: false,
        invalidReason: "Recipient address does not match requirements",
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    // 8. Check time validity
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(payload.payload.validAfter);
    const validBefore = parseInt(payload.payload.validBefore);
    
    if (now < validAfter) {
      runtime.log("[VERIFY] ❌ Payment not valid yet");
      return {
        isValid: false,
        invalidReason: `Payment not valid until ${new Date(validAfter * 1000).toISOString()}`,
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    if (now > validBefore) {
      runtime.log("[VERIFY] ❌ Payment expired");
      return {
        isValid: false,
        invalidReason: `Payment expired at ${new Date(validBefore * 1000).toISOString()}`,
        consensusProof: await runtime.consensus.getProof(),
        reportId: generateReportId(),
        timestamp: Date.now(),
      };
    }
    
    // All checks passed!
    runtime.log("[VERIFY] ✅ All checks passed - payment is VALID");
    
    const consensusProof = await runtime.consensus.getProof();
    runtime.log(`[VERIFY] BFT consensus proof generated: ${consensusProof.substring(0, 20)}...`);
    
    return {
      isValid: true,
      invalidReason: null,
      consensusProof,
      reportId: generateReportId(),
      timestamp: Date.now(),
    };
    
  } catch (error) {
    runtime.log(`[VERIFY] ❌ Error during verification: ${error.message}`);
    return {
      isValid: false,
      invalidReason: `Verification error: ${error.message}`,
      consensusProof: await runtime.consensus.getProof(),
      reportId: generateReportId(),
      timestamp: Date.now(),
    };
  }
};

// ============================================================================
// SETTLE HANDLER - PRODUCTION MODE
// ============================================================================

/**
 * SETTLE HANDLER (Production)
 * 
 * Settles an x402 payment by executing real on-chain transactions.
 * 
 * Steps:
 * 1. Decode payment payload
 * 2. Execute ERC-20 transferWithAuthorization (EIP-3009)
 * 3. Wait for transaction confirmation (BFT monitored)
 * 4. Emit Proof-of-Agency to ValidationRegistry (if enabled)
 * 5. Return consensus-verified transaction hash with proof
 */
const handleSettle = async (
  runtime: Runtime<Config>,
  request: SettleRequest
): Promise<SettleResponse> => {
  runtime.log("[SETTLE] Starting decentralized payment settlement (PRODUCTION)");
  runtime.log(`[SETTLE] Network: ${request.paymentRequirements.network}`);
  runtime.log(`[SETTLE] Asset: ${request.paymentRequirements.asset}`);
  
  try {
    // 1. Decode payment payload
    const payload = parsePaymentHeader(request.paymentHeader);
    runtime.log(`[SETTLE] Settling payment from ${payload.payload.from} to ${payload.payload.to}`);
    
    // 2. Get token contract address
    const tokenAddress = getUSDCAddress(request.paymentRequirements.network);
    const nonceHex = formatNonce(payload.payload.nonce);
    
    // 3. Execute transferWithAuthorization (EIP-3009)
    runtime.log("[SETTLE] Executing transferWithAuthorization on-chain...");
    
    const txHash = await runtime.evm.write({
      chain: request.paymentRequirements.network,
      address: tokenAddress,
      abi: USDC_ABI,
      functionName: "transferWithAuthorization",
      args: [
        payload.payload.from as Address,
        payload.payload.to as Address,
        BigInt(payload.payload.value),
        BigInt(payload.payload.validAfter),
        BigInt(payload.payload.validBefore),
        nonceHex,
        payload.payload.v,
        payload.payload.r as Hex,
        payload.payload.s as Hex,
      ],
    });
    
    runtime.log(`[SETTLE] ✅ Transaction submitted: ${txHash}`);
    
    // 4. Wait for confirmation (BFT consensus monitors this)
    runtime.log(`[SETTLE] Waiting for ${runtime.config.confirmations} confirmations...`);
    
    await runtime.evm.waitForTransaction({
      chain: request.paymentRequirements.network,
      hash: txHash as Hex,
      confirmations: runtime.config.confirmations,
    });
    
    runtime.log(`[SETTLE] ✅ Transaction confirmed on-chain`);
    
    // 5. Emit Proof-of-Agency (ERC-8004) if enabled and deployed
    let evidenceHash: string | null = null;
    
    if (runtime.config.enableProofOfAgency && isValidationRegistryDeployed(request.paymentRequirements.network)) {
      runtime.log("[SETTLE] Emitting Proof-of-Agency (ERC-8004)...");
      
      try {
        const registryAddress = getValidationRegistryAddress(request.paymentRequirements.network);
        const agentIdHex = request.agentId 
          ? (request.agentId.startsWith("0x") ? request.agentId : `0x${request.agentId}`) as Hex
          : "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
        
        evidenceHash = await runtime.evm.write({
          chain: request.paymentRequirements.network,
          address: registryAddress,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: "recordPaymentEvidence",
          args: [
            payload.payload.from as Address,
            txHash as Hex,
            request.paymentRequirements.resource || "",
            agentIdHex,
          ],
        });
        
        runtime.log(`[SETTLE] ✅ Proof-of-Agency recorded: ${evidenceHash}`);
      } catch (error) {
        runtime.log(`[SETTLE] ⚠️  Failed to record Proof-of-Agency: ${error.message}`);
      }
    }
    
    // 6. Generate BFT consensus proof
    const consensusProof = await runtime.consensus.getProof();
    runtime.log(`[SETTLE] BFT consensus proof generated: ${consensusProof.substring(0, 20)}...`);
    
    return {
      success: true,
      error: null,
      txHash: txHash as string,
      evidenceHash,
      networkId: request.paymentRequirements.network,
      consensusProof,
      timestamp: Date.now(),
    };
    
  } catch (error) {
    runtime.log(`[SETTLE] ❌ Error during settlement: ${error.message}`);
    return {
      success: false,
      error: error.message,
      txHash: null,
      evidenceHash: null,
      networkId: null,
      consensusProof: await runtime.consensus.getProof(),
      timestamp: Date.now(),
    };
  }
};

// ============================================================================
// HTTP ENDPOINT HANDLERS
// ============================================================================

/**
 * POST /verify - Verify payment authorization
 */
const onVerifyHTTP = async (
  runtime: Runtime<Config>,
  httpRequest: HTTPRequest
): Promise<HTTPResponse> => {
  try {
    const body = JSON.parse(httpRequest.body);
    
    // Validate request
    if (!body.paymentHeader || !body.paymentRequirements) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Missing required fields: paymentHeader, paymentRequirements" 
        }),
      };
    }
    
    // Call verification logic
    const result = await handleVerify(runtime, body);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * POST /settle - Settle payment on-chain
 */
const onSettleHTTP = async (
  runtime: Runtime<Config>,
  httpRequest: HTTPRequest
): Promise<HTTPResponse> => {
  try {
    const body = JSON.parse(httpRequest.body);
    
    // Validate request
    if (!body.paymentHeader || !body.paymentRequirements) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Missing required fields: paymentHeader, paymentRequirements" 
        }),
      };
    }
    
    // Call settlement logic
    const result = await handleSettle(runtime, body);
    
    return {
      statusCode: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        success: false,
        error: error.message 
      }),
    };
  }
};

/**
 * GET /health - Health check endpoint
 */
const onHealthHTTP = async (
  runtime: Runtime<Config>
): Promise<HTTPResponse> => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      healthy: true,
      mode: runtime.config.mode,
      facilitatorMode: "cre-decentralized",
      networks: runtime.config.supportedNetworks,
      schemes: runtime.config.supportedSchemes,
      confirmations: runtime.config.confirmations,
      proofOfAgency: runtime.config.enableProofOfAgency,
      timestamp: Date.now(),
    }),
  };
};

/**
 * GET /supported - List supported networks
 */
const onSupportedHTTP = async (
  runtime: Runtime<Config>
): Promise<HTTPResponse> => {
  const supported = runtime.config.supportedNetworks.map((network) => ({
    x402Version: 1,
    scheme: "exact",
    network: network,
  }));
  
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kinds: supported }),
  };
};

// ============================================================================
// WORKFLOW INITIALIZATION
// ============================================================================

/**
 * Initialize workflow with HTTP triggers (production mode)
 */
const initWorkflow = (config: Config) => {
  const http = new cre.capabilities.HTTPCapability();

  return [
    // POST /verify
    cre.handler(
      http.trigger({ path: "/verify", method: "POST" }),
      onVerifyHTTP
    ),
    
    // POST /settle
    cre.handler(
      http.trigger({ path: "/settle", method: "POST" }),
      onSettleHTTP
    ),
    
    // GET /health
    cre.handler(
      http.trigger({ path: "/health", method: "GET" }),
      onHealthHTTP
    ),
    
    // GET /supported
    cre.handler(
      http.trigger({ path: "/supported", method: "GET" }),
      onSupportedHTTP
    ),
  ];
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Main entry point
 * Creates the CRE Runner and starts the workflow
 */
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

// Start the workflow
main();

