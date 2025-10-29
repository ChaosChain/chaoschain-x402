import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Generate deterministic idempotency key using SHA-256 hash
 * Prevents PII leakage and ensures full determinism
 */
export function generateIdempotencyHash(
  tenantId: string,
  endpoint: string,
  body: any,
  payer: string,
  nonce?: string
): string {
  const payload = JSON.stringify({
    tenantId,
    endpoint,
    body,
    payer: payer.toLowerCase(),
    nonce,
  });
  
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function checkIdempotency(
  request: FastifyRequest,
  reply: FastifyReply,
  tenantId?: string
): Promise<any | null> {
  const idempotencyKey = request.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    return null;
  }

  // Generate hash of request
  const requestHash = generateIdempotencyHash(
    tenantId || 'anonymous',
    request.routeOptions.url || request.url,
    request.body,
    (request.body as any)?.paymentHeader?.sender || 'unknown',
    (request.body as any)?.paymentHeader?.nonce
  );

  // Check if we've seen this exact request before
  const { data } = await supabase
    .from('idempotency_store')
    .select('response, request_hash')
    .eq('key', idempotencyKey)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .single();

  if (data) {
    // Verify hash matches to prevent key reuse with different request
    if (data.request_hash !== requestHash) {
      reply.code(409).send({
        error: 'Idempotency key conflict',
        message: 'This idempotency key was used for a different request',
      });
      return { _conflict: true };
    }
    
    // Return cached response
    reply.code(200).send(data.response);
    return data.response;
  }

  return null;
}

export async function storeIdempotencyResponse(
  key: string,
  requestHash: string,
  response: any
): Promise<void> {
  await supabase
    .from('idempotency_store')
    .insert({ key, request_hash: requestHash, response });
}

