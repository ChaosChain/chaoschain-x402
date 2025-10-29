import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { privateKeyToAccount } from 'viem/accounts';

// Lazy load Supabase (optional for testing)
function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return null;
  }
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

export async function checkHealth() {
  const checks = {
    supabase: false,
    rpcBaseSepolia: false,
    gasBalance: '0',
    gasBalanceHealthy: false,
    usdcBalance: '0',
    rpcLatencyMs: 0,
    blockLag: 0,
    timestamp: new Date().toISOString(),
  };

  // Check Supabase (optional)
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('transactions').select('count').limit(1);
      checks.supabase = !error;
    } catch (e) {
      checks.supabase = false;
    }
  } else {
    checks.supabase = true; // Consider healthy if not configured
  }

  // Check RPC + Gas Balance + Block Lag
  try {
    const startTime = Date.now();
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC_URL!),
    });
    
    const currentBlock = await client.getBlockNumber();
    checks.rpcLatencyMs = Date.now() - startTime;
    checks.rpcBaseSepolia = true;

    // Check block lag (should be < 30 seconds)
    const latestBlock = await client.getBlock({ blockNumber: currentBlock });
    const blockAge = Date.now() / 1000 - Number(latestBlock.timestamp);
    checks.blockLag = Math.floor(blockAge);

    // Check facilitator gas balance
    const account = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY! as `0x${string}`);
    const balance = await client.getBalance({ address: account.address });
    checks.gasBalance = formatEther(balance);
    
    const minGasBalance = parseFloat(process.env.MIN_GAS_BALANCE_ETH || '0.1');
    checks.gasBalanceHealthy = parseFloat(checks.gasBalance) >= minGasBalance;

    // Check USDC balance (optional)
    const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia
    const usdcBalance = await client.readContract({
      address: usdcAddress,
      abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
      functionName: 'balanceOf',
      args: [account.address],
    });
    checks.usdcBalance = formatUnits(usdcBalance, 6);

  } catch (e) {
    checks.rpcBaseSepolia = false;
  }

  const healthy = checks.supabase && checks.rpcBaseSepolia && checks.gasBalanceHealthy;
  return { healthy, checks };
}

