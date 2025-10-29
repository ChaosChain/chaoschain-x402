import { parseUnits } from 'viem';
import { calculateFee } from './fees';

/**
 * Fee and amount breakdown with both human-readable and base unit representations
 */
export interface AmountBreakdown {
  amount: {
    human: string;      // "1.00"
    base: string;       // "1000000"
    symbol: string;     // "USDC"
    decimals: number;   // 6
  };
  fee: {
    human: string;      // "0.01"
    base: string;       // "10000"
    bps: number;        // 100
  };
  net: {
    human: string;      // "0.99"
    base: string;       // "990000"
  };
}

/**
 * Compute fee breakdown with both human and base units
 * Always call this to ensure transparency in all responses
 */
export async function computeFeeBreakdown(
  maxAmountRequired: string,
  apiKey?: string
): Promise<AmountBreakdown> {
  // USDC default 6 decimals; if you later add dynamic decimals, fold it in here
  const decimals = 6;
  const baseAmount = parseUnits(maxAmountRequired, decimals);
  const { feeAmount, netAmount, feeBps } = await calculateFee(baseAmount);

  return {
    amount: {
      human: maxAmountRequired,
      base: baseAmount.toString(),
      symbol: 'USDC',
      decimals,
    },
    fee: {
      human: (Number(maxAmountRequired) * feeBps / 10000).toFixed(2), // display-only
      base: feeAmount.toString(),
      bps: feeBps,
    },
    net: {
      human: (Number(maxAmountRequired) * (1 - feeBps / 10000)).toFixed(2),
      base: netAmount.toString(),
    },
  };
}

