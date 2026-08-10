import type { Chain } from 'viem';

export const zeroGMainnet = {
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: '0G',
    symbol: '0G',
  },
  rpcUrls: {
    default: {
      http: [process.env.ZG_MAINNET_RPC_URL || 'https://evmrpc.0g.ai'],
    },
    public: {
      http: [process.env.ZG_MAINNET_RPC_URL || 'https://evmrpc.0g.ai'],
    },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan.0g.ai' },
  },
  testnet: false,
} as const satisfies Chain;
