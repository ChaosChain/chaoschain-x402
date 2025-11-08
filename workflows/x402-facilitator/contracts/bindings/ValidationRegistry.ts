/**
 * ValidationRegistry Contract Bindings (ERC-8004)
 * Proof-of-Agency on-chain reputation system
 * 
 * Auto-generated from ValidationRegistry.json ABI
 */

import type { Address, Hex } from "viem";

export const VALIDATION_REGISTRY_ABI = [
  {
    inputs: [
      { name: "payer", type: "address" },
      { name: "paymentTxHash", type: "bytes32" },
      { name: "resource", type: "string" },
      { name: "agentId", type: "bytes32" },
    ],
    name: "recordPaymentEvidence",
    outputs: [{ name: "evidenceId", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "evidenceId", type: "bytes32" }],
    name: "getEvidence",
    outputs: [
      { name: "payer", type: "address" },
      { name: "paymentTxHash", type: "bytes32" },
      { name: "resource", type: "string" },
      { name: "agentId", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "agentId", type: "bytes32" }],
    name: "getAgentReputation",
    outputs: [
      { name: "totalPayments", type: "uint256" },
      { name: "totalValue", type: "uint256" },
      { name: "averageValue", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * ValidationRegistry Contract Addresses by Network
 * 
 * TODO: Deploy ValidationRegistry contracts and update these addresses
 */
export const VALIDATION_REGISTRY_ADDRESSES: Record<string, Address> = {
  "base-sepolia": "0x0000000000000000000000000000000000000000", // TODO: Deploy
  "ethereum-sepolia": "0x0000000000000000000000000000000000000000", // TODO: Deploy
  "base-mainnet": "0x0000000000000000000000000000000000000000", // TODO: Deploy
  "ethereum-mainnet": "0x0000000000000000000000000000000000000000", // TODO: Deploy
};

/**
 * Type-safe contract interface
 */
export interface ValidationRegistryContract {
  address: Address;
  abi: typeof VALIDATION_REGISTRY_ABI;
  
  // Write functions
  recordPaymentEvidence(
    payer: Address,
    paymentTxHash: Hex,
    resource: string,
    agentId: Hex
  ): Promise<Hex>;
  
  // Read functions
  getEvidence(evidenceId: Hex): Promise<{
    payer: Address;
    paymentTxHash: Hex;
    resource: string;
    agentId: Hex;
    timestamp: bigint;
  }>;
  
  getAgentReputation(agentId: Hex): Promise<{
    totalPayments: bigint;
    totalValue: bigint;
    averageValue: bigint;
  }>;
}

/**
 * Get ValidationRegistry contract address for a network
 */
export function getValidationRegistryAddress(network: string): Address {
  const address = VALIDATION_REGISTRY_ADDRESSES[network];
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    throw new Error(`ValidationRegistry not deployed on network: ${network}`);
  }
  return address;
}

/**
 * Check if ValidationRegistry is deployed on a network
 */
export function isValidationRegistryDeployed(network: string): boolean {
  const address = VALIDATION_REGISTRY_ADDRESSES[network];
  return address !== undefined && address !== "0x0000000000000000000000000000000000000000";
}

