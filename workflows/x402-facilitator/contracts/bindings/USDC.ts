/**
 * USDC Token Contract Bindings
 * ERC-20 + EIP-3009 (Transfer with Authorization)
 * 
 * Auto-generated from USDC.json ABI
 */

import type { Address, Hex } from "viem";

export const USDC_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    name: "authorizationState",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * USDC Contract Addresses by Network
 */
export const USDC_ADDRESSES: Record<string, Address> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "ethereum-sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "base-mainnet": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "ethereum-mainnet": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

/**
 * Type-safe contract interface
 */
export interface USDCContract {
  address: Address;
  abi: typeof USDC_ABI;
  
  // Read functions
  balanceOf(account: Address): Promise<bigint>;
  decimals(): Promise<number>;
  allowance(owner: Address, spender: Address): Promise<bigint>;
  authorizationState(authorizer: Address, nonce: Hex): Promise<boolean>;
  
  // Write functions
  transferWithAuthorization(
    from: Address,
    to: Address,
    value: bigint,
    validAfter: bigint,
    validBefore: bigint,
    nonce: Hex,
    v: number,
    r: Hex,
    s: Hex
  ): Promise<Hex>;
  
  transferFrom(
    from: Address,
    to: Address,
    amount: bigint
  ): Promise<Hex>;
}

/**
 * Get USDC contract address for a network
 */
export function getUSDCAddress(network: string): Address {
  const address = USDC_ADDRESSES[network];
  if (!address) {
    throw new Error(`USDC not supported on network: ${network}`);
  }
  return address;
}

