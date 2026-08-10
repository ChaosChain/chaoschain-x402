import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { baseSepolia, sepolia, base, mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { zeroGTestnet } from './networks/eip155-16600';
import { skaleBaseSepolia } from './networks/eip155-324705682';
import { zeroGMainnet } from './networks/eip155-16661';

/**
 * Chain configuration interface
 */
export interface ChainConfig {
  id: number;
  name: string;
  network: string; // Internal identifier (e.g., 'base-sepolia')
  chain: Chain;
  rpcUrl: string;
  confirmations: number;
  defaultToken: string; // Primary token for this network (e.g., 'usdc')
}

/**
 * Token configuration interface
 */
export interface TokenConfig {
  symbol: string;
  decimals: number;
  supportsEIP3009: boolean;
  addresses: Record<string, string>; // network -> address
}

// ============================================================================
// CHAIN REGISTRY
// ============================================================================

export const CHAINS: Record<string, ChainConfig> = {
  'base-sepolia': {
    id: baseSepolia.id,
    name: 'Base Sepolia',
    network: 'base-sepolia',
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    confirmations: 2,
    defaultToken: 'usdc',
  },
  'ethereum-sepolia': {
    id: sepolia.id,
    name: 'Ethereum Sepolia',
    network: 'ethereum-sepolia',
    chain: sepolia,
    rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia.blockpi.network/v1/rpc/public',
    confirmations: 3,
    defaultToken: 'usdc',
  },
  '0g-testnet': {
    id: zeroGTestnet.id,
    name: '0G Galileo Testnet',
    network: '0g-testnet',
    chain: zeroGTestnet,
    rpcUrl: process.env.ZG_TESTNET_RPC_URL || 'https://rpc-testnet.0g.ai',
    confirmations: 1,
    defaultToken: '0g',
  },
  'skale-base-sepolia': {
    id: skaleBaseSepolia.id,
    name: 'SKALE Base Sepolia',
    network: 'skale-base-sepolia',
    chain: skaleBaseSepolia,
    rpcUrl: process.env.SKALE_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-testnet.skalenodes.com/v1/jubilant-horrible-ancha',
    confirmations: 1,
    defaultToken: 'usdc',
  },
  'base-mainnet': {
    id: base.id,
    name: 'Base Mainnet',
    network: 'base-mainnet',
    chain: base,
    rpcUrl: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    confirmations: 2,
    defaultToken: 'usdc',
  },
  'ethereum-mainnet': {
    id: mainnet.id,
    name: 'Ethereum Mainnet',
    network: 'ethereum-mainnet',
    chain: mainnet,
    rpcUrl: process.env.ETHEREUM_MAINNET_RPC_URL || 'https://eth.merkle.io',
    confirmations: 3,
    defaultToken: 'usdc',
  },
  '0g-mainnet': {
    id: zeroGMainnet.id,
    name: '0G Mainnet',
    network: '0g-mainnet',
    chain: zeroGMainnet,
    rpcUrl: process.env.ZG_MAINNET_RPC_URL || 'https://evmrpc.0g.ai',
    confirmations: 5,
    defaultToken: 'w0g',
  },
};

// ============================================================================
// TOKEN REGISTRY
// ============================================================================

export const TOKENS: Record<string, TokenConfig> = {
  'usdc': {
    symbol: 'usdc',
    decimals: 6,
    supportsEIP3009: true,
    addresses: {
      'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      'skale-base-sepolia': '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
      'base-mainnet': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'ethereum-mainnet': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
  },
  'w0g': {
    symbol: 'w0g',
    decimals: 18,
    supportsEIP3009: false,
    addresses: {
      '0g-mainnet': '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
    },
  },
  '0g': {
    symbol: '0g',
    decimals: 18,
    supportsEIP3009: false,
    addresses: {
      '0g-testnet': '0x0000000000000000000000000000000000000000',
      '0g-mainnet': '0x0000000000000000000000000000000000000000',
    },
  },
  'eth': {
    symbol: 'eth',
    decimals: 18,
    supportsEIP3009: false,
    addresses: {
      'ethereum-sepolia': '0x0000000000000000000000000000000000000000',
      'base-sepolia': '0x0000000000000000000000000000000000000000',
      'skale-base-sepolia': '0x0000000000000000000000000000000000000000',
      'base-mainnet': '0x0000000000000000000000000000000000000000',
      'ethereum-mainnet': '0x0000000000000000000000000000000000000000',
    },
  },
  'credit': {
    symbol: 'credit',
    decimals: 18,
    supportsEIP3009: false,
    addresses: {}, // Placeholder or add specific addresses if known
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getChainConfig(network: string): ChainConfig {
  const config = CHAINS[network];
  if (!config) throw new Error(`Unsupported network: ${network}`);
  return config;
}

export function getTokenConfig(symbol: string): TokenConfig {
  const config = TOKENS[symbol.toLowerCase()];
  if (!config) throw new Error(`Unsupported token: ${symbol}`);
  return config;
}

export function getTokenAddress(network: string, symbol: string): string {
  const token = getTokenConfig(symbol);
  const address = token.addresses[network];
  if (!address) throw new Error(`Token ${symbol} not supported on network ${network}`);
  return address;
}

export function getPublicClient(network: string) {
  const config = getChainConfig(network);
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
}

export function getWalletClient(network: string) {
  const config = getChainConfig(network);
  if (!process.env.FACILITATOR_PRIVATE_KEY) {
    throw new Error('FACILITATOR_PRIVATE_KEY not configured');
  }
  const account = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`);
  return createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
}

export function getConfirmations(network: string): number {
  return getChainConfig(network).confirmations;
}

export function getChainId(network: string): number {
  return getChainConfig(network).id;
}

export function getSupportedNetworks(): string[] {
  return Object.keys(CHAINS);
}

export function getSupportedAssets(network: string): string[] {
  return Object.entries(TOKENS)
    .filter(([_, token]) => token.addresses[network])
    .map(([symbol]) => symbol);
}

export function isSupported(network: string, asset: string): boolean {
  try {
    getTokenAddress(network, asset);
    return true;
  } catch {
    return false;
  }
}

export function isNativeToken(network: string, asset: string): boolean {
  return getTokenAddress(network, asset) === '0x0000000000000000000000000000000000000000';
}
