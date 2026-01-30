import { createPublicClient, http, formatEther, formatUnits, defineChain } from 'viem';
import { createClient } from '@supabase/supabase-js';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAINS, getPublicClient, getChainConfig } from '../config/chains';

// Lazy load Supabase (optional for testing)
function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return null;
  }
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

async function checkNetwork(networkName: string, config: any, facilitatorAddress: string) {
  if (!config.rpcUrl) {
    return {
      rpcHealthy: false,
      gasBalance: '0',
      token: config.defaultToken.toUpperCase(),
      error: 'RPC URL not configured',
    };
  }

  try {
    const client = getPublicClient(networkName);

    // Check if RPC is reachable
    const balance = await client.getBalance({ address: facilitatorAddress as `0x${string}` });

    return {
      rpcHealthy: true,
      gasBalance: formatEther(balance),
      token: config.defaultToken.toUpperCase(),
    };
  } catch (e: any) {
    return {
      rpcHealthy: false,
      gasBalance: '0',
      token: config.defaultToken.toUpperCase(),
      error: e.message || 'RPC check failed',
    };
  }
}

export async function checkHealth() {
  // Get facilitator address from private key if available
  let facilitatorAddress: string;
  try {
    const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('FACILITATOR_PRIVATE_KEY not set');
    }
    const pkWithPrefix = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    facilitatorAddress = privateKeyToAccount(pkWithPrefix as `0x${string}`).address;
  } catch (e: any) {
    return {
      healthy: false,
      facilitatorMode: 'managed',
      networks: {},
      error: `Facilitator configuration error: ${e.message}`,
      timestamp: new Date().toISOString(),
    };
  }

  // Check Supabase (optional)
  let supabaseHealthy = true;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('transactions').select('count').limit(1);
      supabaseHealthy = !error;
    } catch (e) {
      supabaseHealthy = false;
    }
  }

  // Check all networks in parallel
  const networkChecks = await Promise.all(
    Object.entries(CHAINS).map(async ([name, config]) => {
      const result = await checkNetwork(name, config, facilitatorAddress);
      return [name, result];
    })
  );

  const networks = Object.fromEntries(networkChecks);

  // Overall health: Supabase OK + at least one network healthy
  const anyNetworkHealthy = Object.values(networks).some((n: any) => n.rpcHealthy);
  const healthy = supabaseHealthy && anyNetworkHealthy;

  // Create public-safe network status (no gas balances or addresses)
  const publicNetworkStatus = Object.fromEntries(
    Object.entries(networks).map(([name, data]: [string, any]) => [
      name,
      {
        rpcHealthy: data.rpcHealthy,
        token: data.token,
        status: data.rpcHealthy ? 'operational' : 'degraded',
        ...(data.error && { error: data.error })
      }
    ])
  );

  return {
    healthy,
    facilitatorMode: 'managed',
    networks: publicNetworkStatus,
    timestamp: new Date().toISOString(),
  };
}

