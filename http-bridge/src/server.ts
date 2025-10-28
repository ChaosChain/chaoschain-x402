import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  type VerifyRequest,
  type VerifyResponse,
  type SettleRequest,
  type SettleResponse,
  type ErrorResponse,
  type BridgeConfig,
  VerifyRequestSchema,
  SettleRequestSchema,
} from "./types";

/**
 * ChaosChain x402 HTTP Bridge
 * 
 * This service provides a REST API for the decentralized x402 facilitator.
 * It acts as a bridge between clients and the CRE workflow.
 * 
 * Current Mode: SIMULATE
 * - Returns mock verification and settlement responses
 * - Does not call real CRE workflows
 * 
 * Production Mode (TODO):
 * - Forward requests to deployed CRE workflow endpoints
 * - Return real consensus-verified responses
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const config: BridgeConfig = {
  port: Number(process.env.PORT || 8402),
  creMode: (process.env.CRE_MODE as "simulate" | "remote") || "simulate",
  creWorkflowUrl: process.env.CRE_WORKFLOW_URL,
  logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info",
};

// ============================================================================
// FASTIFY SERVER SETUP
// ============================================================================

const server = Fastify({
  logger: {
    level: config.logLevel,
  },
});

// Enable CORS for cross-origin requests
await server.register(cors, {
  origin: true, // Allow all origins in development
  methods: ["GET", "POST", "OPTIONS"],
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Mock verification logic for simulate mode
 * Returns a consensus-verified response
 */
function simulateVerify(request: VerifyRequest): VerifyResponse {
  server.log.info(`[VERIFY] Network: ${request.paymentRequirements.network}`);
  server.log.info(`[VERIFY] Scheme: ${request.paymentRequirements.scheme}`);
  server.log.info(`[VERIFY] PayTo: ${request.paymentRequirements.payTo}`);

  // Generate realistic-looking consensus proof hash
  const timestamp = Date.now();
  const proofData = `${request.paymentRequirements.payTo}${timestamp}`;
  const proofHash = `0x${Buffer.from(proofData).toString('hex').slice(0, 64)}`;
  
  return {
    isValid: true,
    invalidReason: null,
    consensusProof: proofHash,
    reportId: `rep_${timestamp}`,
    timestamp: timestamp,
  };
}

/**
 * Mock settlement logic for simulate mode
 * Returns a consensus-verified transaction
 */
function simulateSettle(request: SettleRequest): SettleResponse {
  server.log.info(`[SETTLE] Network: ${request.paymentRequirements.network}`);
  server.log.info(`[SETTLE] Asset: ${request.paymentRequirements.asset}`);
  server.log.info(`[SETTLE] PayTo: ${request.paymentRequirements.payTo}`);

  // Map network names to chain IDs
  const chainIdMap: Record<string, number> = {
    "base-sepolia": 84532,
    "ethereum-sepolia": 11155111,
    "base-mainnet": 8453,
    "ethereum-mainnet": 1,
  };

  const chainId = chainIdMap[request.paymentRequirements.network] || 84532;

  // Generate realistic-looking transaction hash
  const timestamp = Date.now();
  const txData = `${request.paymentRequirements.payTo}${request.paymentRequirements.asset}${timestamp}`;
  const txHash = `0x${Buffer.from(txData).toString('hex').slice(0, 64)}`;
  const proofData = `${txData}consensus`;
  const proofHash = `0x${Buffer.from(proofData).toString('hex').slice(0, 64)}`;
  
  return {
    success: true,
    error: null,
    txHash: txHash,
    networkId: request.paymentRequirements.network,
    consensusProof: proofHash,
    timestamp: timestamp,
  };
}

/**
 * Forward verify request to real CRE workflow
 * TODO: Implement when CRE is deployed
 */
async function forwardVerifyToCRE(request: VerifyRequest): Promise<VerifyResponse> {
  if (!config.creWorkflowUrl) {
    throw new Error("CRE_WORKFLOW_URL not configured for remote mode");
  }

  // TODO: Make HTTP request to CRE workflow endpoint
  // const response = await fetch(`${config.creWorkflowUrl}/verify`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(request)
  // });
  // return await response.json();

  throw new Error("Remote CRE mode not yet implemented");
}

/**
 * Forward settle request to real CRE workflow
 * TODO: Implement when CRE is deployed
 */
async function forwardSettleToCRE(request: SettleRequest): Promise<SettleResponse> {
  if (!config.creWorkflowUrl) {
    throw new Error("CRE_WORKFLOW_URL not configured for remote mode");
  }

  // TODO: Make HTTP request to CRE workflow endpoint
  // const response = await fetch(`${config.creWorkflowUrl}/settle`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(request)
  // });
  // return await response.json();

  throw new Error("Remote CRE mode not yet implemented");
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /
 * Health check and service information
 */
server.get("/", async () => {
  return {
    service: "ChaosChain x402 Decentralized Facilitator",
    version: "0.1.0",
    mode: config.creMode,
    endpoints: {
      verify: "POST /verify",
      settle: "POST /settle",
      supported: "GET /supported",
    },
    docs: "https://github.com/ChaosChain/chaoschain-x402",
  };
});

/**
 * GET /supported
 * Returns supported payment schemes and networks
 * Per x402 facilitator spec
 */
server.get("/supported", async () => {
  return {
    kinds: [
      {
        scheme: "exact",
        network: "base-sepolia",
      },
      {
        scheme: "exact",
        network: "ethereum-sepolia",
      },
      {
        scheme: "exact",
        network: "base-mainnet",
      },
      {
        scheme: "exact",
        network: "ethereum-mainnet",
      },
    ],
  };
});

/**
 * POST /verify
 * Verify an x402 payment via decentralized consensus
 * 
 * Request Body:
 * {
 *   x402Version: number,
 *   paymentHeader: string (base64),
 *   paymentRequirements: PaymentRequirements
 * }
 * 
 * Response:
 * {
 *   isValid: boolean,
 *   invalidReason: string | null,
 *   consensusProof: string,
 *   reportId: string,
 *   timestamp: number
 * }
 */
server.post<{ Body: VerifyRequest; Reply: VerifyResponse | ErrorResponse }>(
  "/verify",
  async (request, reply) => {
    try {
      // Validate request body
      const validatedRequest = VerifyRequestSchema.parse(request.body);

      server.log.info(`[VERIFY] Processing verification request`);
      server.log.info(`[VERIFY] Mode: ${config.creMode}`);

      // Route to appropriate handler based on mode
      const result =
        config.creMode === "simulate"
          ? simulateVerify(validatedRequest)
          : await forwardVerifyToCRE(validatedRequest);

      server.log.info(`[VERIFY] Result: ${result.isValid ? "VALID" : "INVALID"}`);

      return result;
    } catch (error) {
      server.log.error(`[VERIFY] Error: ${error}`);

      if (error instanceof Error) {
        return reply.status(400).send({
          error: error.message,
          code: "VERIFICATION_ERROR",
          details: error,
        });
      }

      return reply.status(500).send({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  }
);

/**
 * POST /settle
 * Settle an x402 payment via decentralized consensus
 * 
 * Request Body:
 * {
 *   x402Version: number,
 *   paymentHeader: string (base64),
 *   paymentRequirements: PaymentRequirements
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   error: string | null,
 *   txHash: string | null,
 *   networkId: string | null,
 *   consensusProof: string,
 *   timestamp: number
 * }
 */
server.post<{ Body: SettleRequest; Reply: SettleResponse | ErrorResponse }>(
  "/settle",
  async (request, reply) => {
    try {
      // Validate request body
      const validatedRequest = SettleRequestSchema.parse(request.body);

      server.log.info(`[SETTLE] Processing settlement request`);
      server.log.info(`[SETTLE] Mode: ${config.creMode}`);

      // Route to appropriate handler based on mode
      const result =
        config.creMode === "simulate"
          ? simulateSettle(validatedRequest)
          : await forwardSettleToCRE(validatedRequest);

      server.log.info(`[SETTLE] Result: ${result.success ? "SUCCESS" : "FAILED"}`);

      return result;
    } catch (error) {
      server.log.error(`[SETTLE] Error: ${error}`);

      if (error instanceof Error) {
        return reply.status(400).send({
          error: error.message,
          code: "SETTLEMENT_ERROR",
          details: error,
        });
      }

      return reply.status(500).send({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  }
);

// ============================================================================
// SERVER START
// ============================================================================

const start = async () => {
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    
    console.log("");
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║   ChaosChain x402 Decentralized Facilitator Bridge       ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("");
    console.log(`🚀 Server listening on http://localhost:${config.port}`);
    console.log(`📋 Mode: ${config.creMode.toUpperCase()}`);
    console.log(`📊 Log Level: ${config.logLevel}`);
    console.log("");
    console.log("Endpoints:");
    console.log(`  POST http://localhost:${config.port}/verify`);
    console.log(`  POST http://localhost:${config.port}/settle`);
    console.log(`  GET  http://localhost:${config.port}/supported`);
    console.log("");
    console.log("Press Ctrl+C to stop");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

