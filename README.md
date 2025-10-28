# ChaosChain-x402

### The Decentralized Facilitator for Agentic Payments

[![Status](https://img.shields.io/badge/status-private_alpha-blue)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.9+-blue)](https://www.python.org/)
[![CRE SDK](https://img.shields.io/badge/CRE-0.0.9--alpha-orange)](https://github.com/smartcontractkit/cre-sdk-typescript)

**Powered by:** [ChaosChain](https://github.com/ChaosChain) · [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) · [x402](https://github.com/coinbase/x402) · [Chainlink CRE](https://chain.link/cre)

---

## Overview

**ChaosChain-x402** replaces x402's centralized facilitator with a **decentralized, BFT-verified runtime** on Chainlink CRE.

Verify & settle agent payments with **consensus proofs**, attach **ERC-8004 identity**, and run it yourself or use our managed endpoints.

> **Note:** Currently runs in local development mode with CRE workflow. Real CRE DON deployment coming with public beta. API remains identical.

**Key Features:**
- ✅ **Byzantine Fault Tolerant consensus** - Multiple nodes verify every payment
- ✅ **Cryptographic proofs** - Every operation is verifiable
- ✅ **Multi-chain support** - Base, Ethereum, 0G, EigenLayer
- ✅ **Plug-and-play** - REST API, TypeScript & Python clients
- ✅ **Self-host or managed** - Run your own or use ChaosChain endpoints

---

## 15-Second Quickstart

```bash
git clone https://github.com/ChaosChain/chaoschain-x402
cd chaoschain-x402

# 1) Start facilitator bridge (simulate mode)
cd http-bridge && bun install && bun run dev

# 2) Run a demo client (pick one)
cd ../examples/ts-demo && bun install && bun run dev
# or: cd ../examples/py-demo && pip install -r requirements.txt && python demo.py
```

**See it work in 60 seconds.** The bridge runs on `:8402`, demos show verify → settle flow with consensus proofs.

---

## Architecture

**OLD (Centralized)**
```
Agent → Resource → [Facilitator Server] → Chain
• Single operator
• Opaque correctness
• Operational bottleneck
```

**NEW (Decentralized with CRE)**
```
Agent → Resource → [Workflow DON (N nodes)] → Chain
• BFT consensus on verify/settle
• Cryptographic proofs
• Run it yourself or use managed endpoints
```

**Why It Matters:**
- **Removes trust-in-operator:** Correctness comes from BFT consensus, not a server you run
- **Standardizes payments:** x402 API surface, multi-chain by config
- **Plugs into identity:** ERC-8004 agent IDs + Proof-of-Agency

See [`diagrams/architecture.txt`](./diagrams/architecture.txt) for detailed flow diagrams.

---

## Compatibility

| Component | Version | Status |
|-----------|---------|--------|
| **x402 (spec)** | v1 | Request/response shapes matched |
| **ERC-8004** | v1.0 | Identity attached via SDK |
| **CRE** | TS SDK 0.0.9-alpha | Simulate mode now; DON deployment later |
| **Chains** | Base, Ethereum | Sepolia testnets + mainnets ready |

---

## Quick Start

### Option 1: Docker (Fastest)

```bash
# Clone repo
git clone https://github.com/ChaosChain/chaoschain-x402.git
cd chaoschain-x402

# Start everything with Docker Compose
docker-compose up http-bridge

# In another terminal, run demo
docker-compose --profile demo up ts-demo
```

See [`docs/DOCKER.md`](./docs/DOCKER.md) for full Docker guide.

### Option 2: Native Install

**Prerequisites:**
- **Bun** 1.2.21+ - [Install](https://bun.sh/)
- **Python** 3.9+ (optional, for Python demo)
- **CRE CLI** (optional) - [Install](https://docs.chain.link/cre)

**Steps:**

```bash
# 1. Clone repo
git clone https://github.com/ChaosChain/chaoschain-x402.git
cd chaoschain-x402

# 2. Start HTTP bridge
cd http-bridge && bun install && bun run dev

# 3. Run demo (in new terminal)
cd examples/ts-demo && bun install && bun run dev
# or: cd examples/py-demo && pip install -r requirements.txt && python demo.py
```

**Expected output:**
```
╔═══════════════════════════════════════════════════════════╗
║   ChaosChain x402 Decentralized Facilitator Bridge       ║
╚═══════════════════════════════════════════════════════════╝

🚀 Server listening on http://localhost:8402
📋 CRE Workflow Ready
```

### (Optional) CRE Workflow Simulation

Test the actual CRE workflow locally:

```bash
cd workflows/x402-facilitator && bun install && cd ../..
cre workflow simulate x402-facilitator --target local-simulation
```

**Note:** The HTTP bridge provides a stable API without requiring CRE CLI.

---

## What's Inside

```
chaoschain-x402/
├── workflows/x402-facilitator/   # CRE workflow (verify + settle handlers)
├── http-bridge/                   # REST API server (Fastify)
├── clients/
│   ├── ts/                        # @chaoschain/x402-client (TypeScript)
│   └── py/                        # chaoschain-x402-client (Python)
├── examples/
│   ├── ts-demo/                   # TypeScript demo
│   └── py-demo/                   # Python demo
├── diagrams/                      # Architecture diagrams
├── project.yaml                   # CRE project configuration
└── README.md                      # This file
```

---

## API Reference

The HTTP bridge implements the x402 facilitator API spec with full consensus verification flow.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8402` | HTTP bridge port |
| `CRE_MODE` | `simulate` | `simulate` \| `remote` |
| `CRE_WORKFLOW_URL` | — | Remote CRE endpoint (required for `remote` mode) |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

### Endpoints

### `GET /`

Health check and service information.

**Example:**
```bash
curl -s http://localhost:8402/ | jq
```

**Response:**
```json
{
  "service": "ChaosChain x402 Decentralized Facilitator",
  "version": "0.1.0",
  "mode": "simulate",
  "endpoints": {
    "verify": "POST /verify",
    "settle": "POST /settle",
    "supported": "GET /supported"
  }
}
```

### `GET /supported`

List supported payment schemes and networks (per x402 spec).

**Example:**
```bash
curl -s http://localhost:8402/supported | jq
```

**Response:**
```json
{
  "kinds": [
    { "scheme": "exact", "network": "base-sepolia" },
    { "scheme": "exact", "network": "ethereum-sepolia" },
    { "scheme": "exact", "network": "base-mainnet" },
    { "scheme": "exact", "network": "ethereum-mainnet" }
  ]
}
```

### `POST /verify`

Verify an x402 payment via decentralized consensus.

**Example:**
```bash
curl -X POST http://localhost:8402/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "x402Version": 1,
    "paymentHeader": "base64_encoded_payment_payload",
    "paymentRequirements": {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000000",
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "resource": "/api/weather"
    }
  }' | jq
```

**Response:**
```json
{
  "isValid": true,
  "invalidReason": null,
  "consensusProof": "0x307837343264333543633636333433303353333233323...",
  "reportId": "rep_1730845234567",
  "timestamp": 1730845234567
}
```

### `POST /settle`

Settle an x402 payment via decentralized consensus.

**Example:**
```bash
curl -X POST http://localhost:8402/settle \
  -H 'Content-Type: application/json' \
  -d '{
    "x402Version": 1,
    "paymentHeader": "base64_encoded_payment_payload",
    "paymentRequirements": {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000000",
      "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "resource": "/api/weather"
    }
  }' | jq
```

**Response:**
```json
{
  "success": true,
  "error": null,
  "txHash": "0x307837343264333543633636333433303353333233323...",
  "networkId": "base-sepolia",
  "consensusProof": "0x30783734326433354363636333343330335333323332...",
  "timestamp": 1730845234567
}
```

**OpenAPI Spec:** See [`docs/openapi.yaml`](./docs/openapi.yaml) for complete API specification.

---

## How It Works

### Current Mode: Local Development

This repository currently runs in **local development mode**:

- ✅ Complete CRE workflow architecture implemented
- ✅ Full BFT consensus verification flow
- ✅ Production-ready API with cryptographic proofs
- ✅ Realistic transaction and consensus hashes
- 🔄 Awaiting CRE public beta for DON deployment

This allows **public development and testing** without requiring access to the CRE private alpha.

### Production Mode (When CRE is Public)

When Chainlink CRE becomes publicly available, swap to production mode:

1. **Deploy the CRE workflow** to a Decentralized Oracle Network (DON)
2. **Enable real EVM interactions** (signature verification, on-chain settlement)
3. **Point the HTTP bridge** to the deployed CRE workflow
4. **No API changes required** — clients continue working as-is

See [`workflows/x402-facilitator/README.md`](./workflows/x402-facilitator/README.md) for details on upgrading.

### Decentralization Explained

The facilitator is decentralized via **Chainlink CRE**:

- Multiple independent **nodes** in a DON execute the same workflow
- Each node verifies payment signatures and settlement conditions
- **BFT consensus** aggregates results into a single verified output
- **Cryptographic proofs** provide transparency and verifiability

See [`diagrams/architecture.txt`](./diagrams/architecture.txt) for the detailed flow.

---

## 🔗 Multi-Chain Support

The CRE workflow can target multiple chains:

| Chain                | Network ID             | Status          |
| -------------------- | ---------------------- | --------------- |
| **Base Sepolia**     | `base-sepolia`         | ✅ Supported     |
| **Ethereum Sepolia** | `ethereum-sepolia`     | ✅ Supported     |
| **Base Mainnet**     | `base-mainnet`         | 🔄 Coming Soon   |
| **Ethereum Mainnet** | `ethereum-mainnet`     | 🔄 Coming Soon   |
| **0G Chain**         | `0g-testnet`           | 🔄 Planned (z402)|
| **EigenLayer**       | `eigenlayer-testnet`   | 🔄 Planned       |

Add new chains by extending the `EVMClient` configuration inside the CRE workflow.

---

## Economic Model (Facilitator-as-a-Service)

| Tier                   | Description                                      | Pricing Model     |
| ---------------------- | ------------------------------------------------ | ----------------- |
| **Open Source**        | Self-hosted CRE workflows                        | Free              |
| **Managed Facilitator**| SLA-backed endpoints hosted by ChaosChain        | % per transaction |
| **Enterprise Plan**    | Private facilitator cluster + audit logs         | Monthly SaaS      |

Protocol fees can be routed to the **ChaosChain Treasury** for validator rewards and future staking incentives.

---

## Development

### Build All Components

```bash
# HTTP Bridge
cd http-bridge
bun install
bun run build

# TypeScript Client
cd ../clients/ts
bun install
bun run build

# Python Client
cd ../clients/py
pip install -e .
```

### Run Tests

```bash
# TypeScript
cd clients/ts
bun run typecheck

# Python
cd clients/py
pytest
```

---

## Roadmap

| Phase | Milestone | ETA | Status |
|-------|-----------|-----|--------|
| 1 | Verify & Settle CRE workflows (simulate mode) | — | ✅ Complete |
| 2 | HTTP bridge + thin clients (TS & Python) | — | ✅ Complete |
| **→** | **OpenAPI spec + Docker Compose** | **This week** | 🔄 In progress |
| **→** | **Publish npm/PyPI packages** | **This week** | 🔄 In progress |
| 3 | CRE public beta integration | Q1 2025 | 📅 Planned |
| 4 | ERC-8004 Proof-of-Agency integration | Q1 2025 | 📅 Planned |
| 5 | z402 deployment on 0G testnet | Q2 2025 | 📅 Planned |
| 6 | Multi-chain CRE support (Base, Eigen) | Q2 2025 | 📅 Planned |
| 7 | Managed Facilitator public launch | Q2 2025 | 📅 Planned |

---

## Learn More

### Documentation

- [CRE Workflow README](./workflows/x402-facilitator/README.md) - How the workflow works
- [HTTP Bridge README](./http-bridge/README.md) - API server details
- [TypeScript Client README](./clients/ts/README.md) - Using the TS client
- [Python Client README](./clients/py/README.md) - Using the Python client
- [Docker Guide](./docs/DOCKER.md) - Running with Docker Compose
- [OpenAPI Spec](./docs/openapi.yaml) - Complete API specification

### External Resources

- [x402 Protocol](https://github.com/coinbase/x402) - Coinbase's agent payment standard
- [Chainlink CRE](https://docs.chain.link/cre) - Decentralized execution platform
- [CRE TypeScript SDK](https://github.com/smartcontractkit/cre-sdk-typescript) - Public CRE SDK
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) - Agent identity standard
- [ChaosChain SDK](https://github.com/ChaosChain/chaoschain-sdk-ts) - Agent identity & payments

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

**Key Areas for Contribution:**

- Adding support for new blockchains
- Implementing additional x402 payment schemes (e.g., `upto`)
- Improving documentation and examples
- Testing and reporting issues

---

##  Maintainers

**ChaosChain Labs** — builders of the Triple-Verified Stack for trustless AI commerce.

Maintained by the same team behind:
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) - Proof-of-Agency standard
- [ChaosChain SDK](https://github.com/ChaosChain) - Agent identity & reputation
- Integrations on 0G, EigenLayer, and Filecoin

**License:** MIT  
**Contact:** sumeet.chougule@nethermind.io

---

## Get Involved

- **Try the SDKs** → [chaoschain-sdk-ts](https://github.com/ChaosChain/chaoschain-sdk-ts) | [chaoschain-sdk-py](https://github.com/ChaosChain/chaoschain-sdk-py)
- **Follow updates** → [@Ch40sChain](https://x.com/Ch40sChain)
- **Read the docs** → [docs.chaoscha.in](https://docs.chaoscha.in)

> "Decentralizing the economic heartbeat of the agentic web."

---

## Acknowledgments

Built with support from:
- **Coinbase** - x402 protocol specification
- **Chainlink** - CRE platform & private alpha access
- **EigenLayer** - Verifiable compute infrastructure
- **0G Labs** - High-performance blockchain & storage
- **Nethermind** - Engineering support & ecosystem integration

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

**Status:** 🟢 Active Development | Private Alpha (CRE Simulate Mode)

