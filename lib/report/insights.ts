import { EMI_CATEGORIES, pct, type Metrics } from "./metrics";
import type { FinanceData } from "./schema";

/** All insight thresholds (percent of monthly income unless noted). */
export const INSIGHT_THRESHOLDS = {
  emiLoadHigh: 40,
  emiLoadModerate: 30,
  lowSavings: 20,
  goodSavings: 30,
  categoryHeavy: 25,
  largeTransaction: 10,
  investingConsistently: 10,
} as const;

export type Severity = "high" | "medium" | "positive";

export type FindingId =
  | "emi_load_high"
  | "emi_load_moderate"
  | "low_savings"
  | "overspent"
  | "category_heavy"
  | "large_transaction"
  | "no_investments"
  | "good_savings"
  | "investing_consistently";

export interface Finding {
  id: FindingId;
  severity: Severity;
  data: Record<string, unknown>;
}

/** Categories that are expected to be large and excluded from "heavy" / "large" checks. */
const EXPECTED_LARGE = new Set(["rent", ...EMI_CATEGORIES]);

export function detectFindings(m: Metrics, data: FinanceData, t = INSIGHT_THRESHOLDS): Finding[] {
  const income = m.monthlyIncome;
  const out: Finding[] = [];

  if (m.emiLoadPct > t.emiLoadHigh) {
    out.push({ id: "emi_load_high", severity: "high", data: { emiLoadPct: m.emiLoadPct, emiCommitments: m.emiCommitments, threshold: t.emiLoadHigh } });
  } else if (m.emiLoadPct >= t.emiLoadModerate) {
    out.push({ id: "emi_load_moderate", severity: "medium", data: { emiLoadPct: m.emiLoadPct, emiCommitments: m.emiCommitments } });
  }

  if (m.savingsRatePct < t.lowSavings) {
    out.push({ id: "low_savings", severity: m.savingsRatePct < 0 ? "high" : "medium", data: { savingsRatePct: m.savingsRatePct, threshold: t.lowSavings } });
  }

  if (m.totalDebit > m.totalCredit) {
    out.push({ id: "overspent", severity: "high", data: { totalDebit: m.totalDebit, totalCredit: m.totalCredit, shortfall: m.totalDebit - m.totalCredit } });
  }

  const heavy = m.categoryBreakdown.filter((c) => !EXPECTED_LARGE.has(c.category) && c.pctOfIncome > t.categoryHeavy);
  if (heavy.length) out.push({ id: "category_heavy", severity: "medium", data: { categories: heavy, threshold: t.categoryHeavy } });

  const large = data.transactions
    .filter((x) => x.type === "debit" && !EXPECTED_LARGE.has(x.category) && x.amount > (income * t.largeTransaction) / 100)
    .map((x) => ({ id: x.id, date: x.date, amount: Math.round(x.amount), category: x.category, description: x.description, pctOfIncome: pct(x.amount, income) }))
    .sort((a, b) => b.amount - a.amount);
  if (large.length) out.push({ id: "large_transaction", severity: "medium", data: { transactions: large, threshold: t.largeTransaction } });

  if (m.investedOut === 0) out.push({ id: "no_investments", severity: "medium", data: { investedOut: 0 } });

  if (m.savingsRatePct >= t.goodSavings) out.push({ id: "good_savings", severity: "positive", data: { savingsRatePct: m.savingsRatePct } });

  if (m.investedOut >= (income * t.investingConsistently) / 100) {
    out.push({ id: "investing_consistently", severity: "positive", data: { investedOut: m.investedOut, pctOfIncome: pct(m.investedOut, income) } });
  }

  return out;
}
