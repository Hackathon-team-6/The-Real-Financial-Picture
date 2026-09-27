import type { DebitCategory, DebitTransaction, FinanceData } from "./schema";

export interface CategoryAmount {
  category: string;
  amount: number;
  pctOfIncome: number;
}

export interface Metrics {
  period: string;
  monthlyIncome: number;
  totalCredit: number;
  totalDebit: number;
  investedOut: number;
  investedIn: number;
  netInvested: number;
  netCashFlow: number;
  savingsRatePct: number;
  categoryBreakdown: CategoryAmount[];
  creditBreakdown: { category: string; amount: number }[];
  totalCommitments: number;
  /** EMI + loan commitments per month. */
  emiCommitments: number;
  emiLoadPct: number;
  fixedVsVariable: { fixed: number; variable: number };
  safeToSpend: number;
  safeToSpendRaw: number;
  daysRemaining: number;
  dailySafeToSpend: number;
  topDebits: { id: string; date: string; amount: number; category: DebitCategory; description: string }[];
}

export const EMI_CATEGORIES: readonly string[] = ["emi", "loan"];

const rupees = (n: number) => Math.round(n);
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// ---------- YYYY-MM helpers (UTC, no Date parsing ambiguity) ----------

export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function addMonths(ym: string, n: number): string {
  const i = monthIndex(ym) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Days left in the period, counting today. Full month if the period is in the future, 0 if it's past. */
export function daysRemainingIn(period: string, today: Date): number {
  const cur = monthIndex(toYearMonth(today));
  const p = monthIndex(period);
  if (p < cur) return 0;
  if (p > cur) return daysInMonth(period);
  return daysInMonth(period) - today.getDate() + 1;
}

export function isDebit(t: FinanceData["transactions"][number]): t is DebitTransaction {
  return t.type === "debit";
}

/** All report numbers. Pure: `today` only affects daysRemaining / dailySafeToSpend. */
export function computeMetrics(data: FinanceData, today: Date = new Date()): Metrics {
  const income = data.user.monthlyIncome;
  const debits = data.transactions.filter(isDebit);

  let totalCredit = 0;
  let investedOut = 0;
  let investedIn = 0;
  const credits = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.type === "credit") {
      totalCredit += t.amount;
      credits.set(t.category, (credits.get(t.category) ?? 0) + t.amount);
    } else if (t.type === "investment") {
      if (t.flow === "out") investedOut += t.amount;
      else investedIn += t.amount;
    }
  }

  const byCategory = new Map<string, number>();
  let totalDebit = 0;
  for (const t of debits) {
    totalDebit += t.amount;
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
  }

  const commitmentCats = new Set(data.commitments.map((c) => c.category));
  const fixed = debits.filter((t) => commitmentCats.has(t.category)).reduce((s, t) => s + t.amount, 0);
  const variable = totalDebit - fixed;

  const totalCommitments = data.commitments.reduce((s, c) => s + c.amount, 0);
  const emiCommitments = data.commitments.filter((c) => EMI_CATEGORIES.includes(c.category)).reduce((s, c) => s + c.amount, 0);

  const safeToSpendRaw = income - totalCommitments - variable;
  const safeToSpend = Math.max(0, safeToSpendRaw);
  const daysRemaining = daysRemainingIn(data.period, today);

  return {
    period: data.period,
    monthlyIncome: rupees(income),
    totalCredit: rupees(totalCredit),
    totalDebit: rupees(totalDebit),
    investedOut: rupees(investedOut),
    investedIn: rupees(investedIn),
    netInvested: rupees(investedOut - investedIn),
    netCashFlow: rupees(totalCredit + investedIn - totalDebit - investedOut),
    savingsRatePct: pct(income - totalDebit, income),
    categoryBreakdown: [...byCategory]
      .map(([category, amount]) => ({ category, amount: rupees(amount), pctOfIncome: pct(amount, income) }))
      .sort((a, b) => b.amount - a.amount),
    creditBreakdown: [...credits].map(([category, amount]) => ({ category, amount: rupees(amount) })).sort((a, b) => b.amount - a.amount),
    totalCommitments: rupees(totalCommitments),
    emiCommitments: rupees(emiCommitments),
    emiLoadPct: pct(emiCommitments, income),
    fixedVsVariable: { fixed: rupees(fixed), variable: rupees(variable) },
    safeToSpend: rupees(safeToSpend),
    safeToSpendRaw: rupees(safeToSpendRaw),
    daysRemaining,
    dailySafeToSpend: rupees(safeToSpend / Math.max(daysRemaining, 1)),
    topDebits: [...debits]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((t) => ({ id: t.id, date: t.date, amount: rupees(t.amount), category: t.category, description: t.description })),
  };
}
