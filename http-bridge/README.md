# HTTP Bridge for ChaosChain x402 Facilitator

REST API bridge for the decentralized x402 facilitator powered by Chainlink CRE.

## Overview

This service provides a standard HTTP interface for x402 payment verification and settlement. It acts as a bridge between clients (TypeScript SDK, Python SDK, etc.) and the CRE workflow DON.

## Current Mode: Simulate

The bridge currently runs in **simulate mode**, returning mock consensus responses. This allows public demonstration without requiring access to the CRE private alpha.

## Installation

```bash
bun install
```

## Running the Server

### Development Mode (with hot reload)
```bash
bun run dev
```

### Production Mode
```bash
bun run start
```

The server will start on port `8402` (configurable via `PORT` env var).

## API Endpoints

### `GET /`
Health check and service information

**Response:**
```json
{
  "service": "ChaosChain x402 Decentralized Facilitator",
  "version": "0.1.0",
  "mode": "simulate",
  "endpoints": { ... }
}
```

### `GET /supported`
Returns supported payment schemes and networks (per x402 spec)

**Response:**
```json
{
  "kinds": [
    { "scheme": "exact", "network": "base-sepolia" },
    { "scheme": "exact", "network": "ethereum-sepolia" }
  ]
}
```

### `POST /verify`
Verify an x402 payment via decentralized consensus

**Request:**
```json
{
  "x402Version": 1,
  "paymentHeader": "base64_encoded_payment_payload",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000000",
    "payTo": "0x...",
    "asset": "0x...",
    "resource": "/api/resource"
  }
}
```

**Response:**
```json
{
  "isValid": true,
  "invalidReason": null,
  "consensusProof": "0xCRE-MOCK-1234567890",
  "reportId": "rep_1234567890",
  "timestamp": 1234567890
}
```

### `POST /settle`
Settle an x402 payment via decentralized consensus

**Request:**
```json
{
  "x402Version": 1,
  "paymentHeader": "base64_encoded_payment_payload",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "payTo": "0x...",
    "asset": "0x...",
    "maxAmountRequired": "1000000",
    "resource": "/api/resource"
  }
}
```

**Response:**
```json
{
  "success": true,
  "error": null,
  "txHash": "0x30783734326433354363636333343330335333323332...",
  "networkId": "base-sepolia",
  "consensusProof": "0xCRE-MOCK-1234567890",
  "timestamp": 1234567890
}
```

## Configuration

Create a `.env` file (copy from root `.env.example`):

```bash
PORT=8402
CRE_MODE=simulate
LOG_LEVEL=info

# For production mode (when CRE is deployed):
# CRE_MODE=remote
# CRE_WORKFLOW_URL=https://your-cre-workflow-url.com
```

## Upgrading to Production

When CRE becomes publicly available:

1. Deploy the CRE workflow (see `workflows/x402-facilitator/`)
2. Set environment variables:
   ```bash
   CRE_MODE=remote
   CRE_WORKFLOW_URL=https://your-deployed-cre-workflow.com
   ```
3. Implement the `forwardVerifyToCRE` and `forwardSettleToCRE` functions in `src/server.ts`

The API contract remains the same, so clients don't need to change.

## Testing

```bash
# Start the server
bun run dev

# In another terminal, test the endpoints
curl http://localhost:8402/

curl http://localhost:8402/supported

curl -X POST http://localhost:8402/verify \
  -H "Content-Type: application/json" \
  -d '{
    "x402Version": 1,
    "paymentHeader": "test",
    "paymentRequirements": {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000000",
      "payTo": "0x0000000000000000000000000000000000000000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "resource": "/api/test"
    }
  }'
```

## Learn More

- [x402 Protocol](https://github.com/coinbase/x402)
- [Chainlink CRE](https://docs.chain.link/cre)
- [ChaosChain Docs](https://docs.chaoscha.in)

