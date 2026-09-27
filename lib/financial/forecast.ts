import { detectRecurring, isActiveSeries } from "./recurring";
import { planGoals } from "./goals";
import type { FinancialSnapshot, Goal, Profile, RecurringSeries, Transaction } from "./types";

export const DEFAULT_SAFETY_BUFFER = 10_000;
/** How many of the most recent months of data are used to estimate variable spending. */
const VARIABLE_WINDOW_MONTHS = 3;

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function roundRupee(n: number): number {
  return Math.round(n);
}

/** Distinct months present in the data, most recent first. */
export function monthsInData(transactions: Transaction[]): string[] {
  return [...new Set(transactions.map((t) => monthKey(t.date)))].sort().reverse();
}

export function activeSeries(series: RecurringSeries[], transactions: Transaction[]): RecurringSeries[] {
  const asOf = latestDate(transactions);
  return series.filter((s) => isActiveSeries(s, asOf));
}

export function latestDate(transactions: Transaction[]): string {
  return transactions.reduce((max, t) => (t.date > max ? t.date : max), "0000-00-00");
}

/** Expected monthly income: recurring income (e.g. salary); falls back to the average monthly credits. */
export function calculateMonthlyIncome(transactions: Transaction[], series: RecurringSeries[]): number {
  const recurringIncome = series.filter((s) => s.type === "income").reduce((sum, s) => sum + s.monthlyAmount, 0);
  if (recurringIncome > 0) return roundRupee(recurringIncome);
  const months = monthsInData(transactions).slice(0, VARIABLE_WINDOW_MONTHS);
  if (!months.length) return 0;
  const total = transactions
    .filter((t) => t.type === "income" && t.category === "Income" && months.includes(monthKey(t.date)))
    .reduce((s, t) => s + t.amount, 0);
  return roundRupee(total / months.length);
}

/** EMIs, rent, subscriptions, bills, insurance and any other recurring outflow – normalised to a month. */
export function calculateFixedCommitments(series: RecurringSeries[]): number {
  return roundRupee(series.filter((s) => s.type === "expense").reduce((sum, s) => sum + s.monthlyAmount, 0));
}

/** Average non-recurring spending per category over the recent window. */
export function calculateVariableSpending(transactions: Transaction[]): { total: number; byCategory: Record<string, number> } {
  const months = monthsInData(transactions).slice(0, VARIABLE_WINDOW_MONTHS);
  const byCategory: Record<string, number> = {};
  if (!months.length) return { total: 0, byCategory };
  for (const t of transactions) {
    if (t.type !== "expense" || t.recurring || !months.includes(monthKey(t.date))) continue;
    byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  }
  let total = 0;
  for (const k of Object.keys(byCategory)) {
    byCategory[k] = roundRupee(byCategory[k] / months.length);
    total += byCategory[k];
  }
  return { total, byCategory };
}

export function calculateMonthlySurplus(income: number, fixed: number, variable: number): number {
  return roundRupee(income - fixed - variable);
}

/** Expected income − fixed commitments − expected variable spending − safety buffer. An estimate. */
export function calculateSafeToSpend(income: number, fixed: number, variable: number, buffer = DEFAULT_SAFETY_BUFFER): number {
  return roundRupee(income - fixed - variable - buffer);
}

export interface AnalyzedData {
  transactions: Transaction[];
  series: RecurringSeries[];
}

/** Runs recurring detection over raw canonical transactions. */
export function analyzeTransactions(transactions: Transaction[]): AnalyzedData {
  const { transactions: flagged, series } = detectRecurring(transactions);
  return {
    transactions: flagged.sort((a, b) => b.date.localeCompare(a.date)),
    series: activeSeries(series, flagged),
  };
}

/** Builds the complete structured financial model used by every screen and by the assistant. */
export function buildSnapshot(data: AnalyzedData, goals: Goal[], profile: Profile, today = new Date()): FinancialSnapshot {
  const { transactions, series } = data;
  const monthlyIncome = calculateMonthlyIncome(transactions, series);
  const fixedCommitments = calculateFixedCommitments(series);
  const variable = calculateVariableSpending(transactions);
  const monthlySurplus = calculateMonthlySurplus(monthlyIncome, fixedCommitments, variable.total);
  const safetyBuffer = profile.safetyBuffer ?? DEFAULT_SAFETY_BUFFER;
  const plans = planGoals(goals, monthlySurplus, today);
  const goalContributions = roundRupee(plans.reduce((s, p) => s + p.requiredMonthly, 0));

  return {
    asOf: today.toISOString().slice(0, 10),
    monthsAnalyzed: Math.min(monthsInData(transactions).length, VARIABLE_WINDOW_MONTHS),
    monthlyIncome,
    fixedCommitments,
    variableSpending: variable.total,
    variableByCategory: variable.byCategory,
    monthlySurplus,
    safetyBuffer,
    safeToSpend: calculateSafeToSpend(monthlyIncome, fixedCommitments, variable.total, safetyBuffer),
    goalContributions,
    availableForNewGoals: roundRupee(Math.max(0, monthlySurplus - goalContributions)),
    unallocatedSavings: roundRupee(profile.unallocatedSavings ?? 0),
    recurring: series,
    goals: plans,
  };
}
