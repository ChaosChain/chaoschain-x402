import { z } from "zod";

/**
 * x402 Protocol Types
 * Based on: https://github.com/coinbase/x402
 */

// ============================================================================
// REQUEST TYPES
// ============================================================================

/**
 * Payment Requirements Schema
 * Specifies what the resource server accepts for payment
 */
export const PaymentRequirementsSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().optional(),
  asset: z.string(),
  extra: z.record(z.any()).nullable().optional(),
});

export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

/**
 * Verify Request Schema
 * POST /verify request body
 */
export const VerifyRequestSchema = z.object({
  x402Version: z.number(),
  paymentHeader: z.string(), // base64 encoded X-PAYMENT header
  paymentRequirements: PaymentRequirementsSchema,
});

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

/**
 * Settle Request Schema
 * POST /settle request body
 */
export const SettleRequestSchema = z.object({
  x402Version: z.number(),
  paymentHeader: z.string(), // base64 encoded X-PAYMENT header
  paymentRequirements: PaymentRequirementsSchema,
});

export type SettleRequest = z.infer<typeof SettleRequestSchema>;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Verification Response
 * Returned by POST /verify
 */
export interface VerifyResponse {
  isValid: boolean;
  invalidReason: string | null;
  consensusProof?: string; // CRE consensus proof (ChaosChain extension)
  reportId?: string; // Report identifier (ChaosChain extension)
  timestamp?: number; // Unix timestamp (ChaosChain extension)
}

/**
 * Settlement Response
 * Returned by POST /settle
 */
export interface SettleResponse {
  success: boolean;
  error: string | null;
  txHash: string | null;
  networkId: string | null;
  consensusProof?: string; // CRE consensus proof (ChaosChain extension)
  timestamp?: number; // Unix timestamp (ChaosChain extension)
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error Response
 * Returned when request validation or processing fails
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

/**
 * Bridge Configuration
 */
export interface BridgeConfig {
  port: number;
  creMode: "simulate" | "remote";
  creWorkflowUrl?: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

