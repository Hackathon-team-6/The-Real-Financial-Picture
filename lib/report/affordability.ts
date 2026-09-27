import { z } from "zod";
import { DEFAULT_ANNUAL_RATE_PCT, emi } from "./emi";
import { INSIGHT_THRESHOLDS } from "./insights";
import { addMonths, monthIndex, pct, type Metrics } from "./metrics";
import type { FinanceData } from "./schema";

export const DEFAULT_EMI_TENURES = [3, 6, 9, 12];
/** How far ahead to look for the month the purchase can be paid upfront. */
export const UPFRONT_SEARCH_MONTHS = 24;
/** Commitments ending within this many months of the period are "ending soon". */
export const ENDING_SOON_MONTHS = 6;

/** Validates the arguments Gemini passes to check_affordability. */
export const affordabilityInputSchema = z.object({
  item: z.string().trim().min(1).max(100),
  amount: z.number().finite().positive().max(1e9),
  emiTenures: z.array(z.number().int().min(1).max(120)).min(1).max(8).optional(),
  annualInterestRate: z.number().finite().min(0).max(60).optional(),
});

export type AffordabilityInput = z.infer<typeof affordabilityInputSchema>;

export type Risk = "low" | "moderate" | "high";

export interface EmiOption {
  tenureMonths: number;
  monthlyEmi: number;
  totalInterest: number;
  fitsSafeToSpend: boolean;
  newEmiLoadPct: number;
  risk: Risk;
}

export interface AffordabilityResult {
  item: string;
  amount: number;
  assumedInterestRate: number;
  interestRateWasAssumed: boolean;
  safeToSpendNow: number;
  canPayUpfrontNow: boolean;
  earliestUpfrontMonth: string | null;
  currentEmiLoadPct: number;
  emiOptions: EmiOption[];
  commitmentsEndingSoon: { name: string; endDate: string; amount: number }[];
}

export function riskFor(emiLoadPct: number): Risk {
  if (emiLoadPct > INSIGHT_THRESHOLDS.emiLoadHigh) return "high";
  if (emiLoadPct >= INSIGHT_THRESHOLDS.emiLoadModerate) return "moderate";
  return "low";
}

/** Commitments still being paid in month `ym` (endDate is inclusive; null = open-ended). */
export function activeCommitmentTotal(data: FinanceData, ym: string): number {
  const i = monthIndex(ym);
  return data.commitments.filter((c) => c.endDate === null || monthIndex(c.endDate) >= i).reduce((s, c) => s + c.amount, 0);
}

/**
 * First month in which the purchase can be paid in full. Starts from this month's safe-to-spend and adds each
 * future month's estimated surplus (income − commitments active that month − this month's variable spend).
 */
export function earliestUpfrontMonth(data: FinanceData, metrics: Metrics, amount: number): string | null {
  let saved = metrics.safeToSpend;
  if (saved >= amount) return data.period;
  for (let k = 1; k <= UPFRONT_SEARCH_MONTHS; k++) {
    const ym = addMonths(data.period, k);
    saved += data.user.monthlyIncome - activeCommitmentTotal(data, ym) - metrics.fixedVsVariable.variable;
    if (saved >= amount) return ym;
  }
  return null;
}

export function checkAffordability(input: AffordabilityInput, data: FinanceData, metrics: Metrics): AffordabilityResult {
  const income = data.user.monthlyIncome;
  const rate = input.annualInterestRate ?? DEFAULT_ANNUAL_RATE_PCT;
  const tenures = [...new Set(input.emiTenures?.length ? input.emiTenures : DEFAULT_EMI_TENURES)].sort((a, b) => a - b);
  const amount = Math.round(input.amount);

  const emiOptions = tenures.map((n): EmiOption => {
    const monthly = emi(amount, rate, n);
    const newEmiLoadPct = pct(metrics.emiCommitments + monthly, income);
    return {
      tenureMonths: n,
      monthlyEmi: Math.round(monthly),
      totalInterest: Math.round(monthly * n - amount),
      fitsSafeToSpend: monthly <= metrics.safeToSpend,
      newEmiLoadPct,
      risk: riskFor(newEmiLoadPct),
    };
  });

  const p = monthIndex(data.period);
  const commitmentsEndingSoon = data.commitments
    .filter((c): c is typeof c & { endDate: string } => c.endDate !== null && monthIndex(c.endDate) - p >= 0 && monthIndex(c.endDate) - p <= ENDING_SOON_MONTHS)
    .map((c) => ({ name: c.name, endDate: c.endDate, amount: Math.round(c.amount) }))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  return {
    item: input.item,
    amount,
    assumedInterestRate: rate,
    interestRateWasAssumed: input.annualInterestRate === undefined,
    safeToSpendNow: metrics.safeToSpend,
    canPayUpfrontNow: metrics.safeToSpend >= amount,
    earliestUpfrontMonth: earliestUpfrontMonth(data, metrics, amount),
    currentEmiLoadPct: metrics.emiLoadPct,
    emiOptions,
    commitmentsEndingSoon,
  };
}
