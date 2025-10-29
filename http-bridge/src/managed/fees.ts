import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export interface FeeCalculation {
  feeAmount: bigint;
  netAmount: bigint;
  feeBps: number;
  tier: 'public';  // Simplified - everyone gets the same tier (no API keys like PayAI)
  treasuryAddress: string;
}

// Simple flat fee for everyone (like PayAI - no API keys needed)
export async function calculateFee(
  amount: bigint
): Promise<FeeCalculation> {
  const feeBps = parseInt(process.env.FEE_BPS_DEFAULT || '100'); // 1% default
  
  // Calculate fee: feeAmount = amount * feeBps / 10000
  const feeAmount = (amount * BigInt(feeBps)) / BigInt(10000);
  const netAmount = amount - feeAmount;

  return {
    feeAmount,
    netAmount,
    feeBps,
    tier: 'public',  // Everyone gets the same tier
    treasuryAddress: process.env.TREASURY_ADDRESS!,
  };
}

export async function checkSpendLimits(
  tenantId: string,
  amount: bigint
): Promise<{ allowed: boolean; reason?: string }> {
  // Check daily spend cap
  const { data: dailySpend } = await supabase
    .from('daily_spend')
    .select('total_usd')
    .eq('tenant_id', tenantId)
    .eq('date', new Date().toISOString().split('T')[0])
    .single();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('daily_spend_cap_usd, max_payment_amount_usd')
    .eq('id', tenantId)
    .single();

  if (!tenant) {
    return { allowed: false, reason: 'Tenant not found' };
  }

  // Check single payment max
  const amountUSD = Number(amount) / 1e6; // Assuming USDC
  if (amountUSD > tenant.max_payment_amount_usd) {
    return { allowed: false, reason: `Payment exceeds max amount: $${tenant.max_payment_amount_usd}` };
  }

  // Check daily cap
  const currentDailySpend = dailySpend?.total_usd || 0;
  if (currentDailySpend + amountUSD > tenant.daily_spend_cap_usd) {
    return { allowed: false, reason: 'Daily spend cap exceeded' };
  }

  return { allowed: true };
}

export async function checkDenyList(address: string): Promise<boolean> {
  const { data } = await supabase
    .from('deny_list')
    .select('address')
    .eq('address', address.toLowerCase())
    .single();

  return !!data;
}

export async function getTenantByApiKey(apiKey: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('api_key', apiKey)
    .eq('active', true)
    .single();

  if (error) {
    return null;
  }

  return data;
}

