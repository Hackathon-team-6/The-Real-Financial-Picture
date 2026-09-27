import { monthKey, monthsInData } from "@/lib/financial/forecast";
import type { FinancialSnapshot, Transaction as AppTransaction } from "@/lib/financial/types";
import type { CreditCategory, DebitCategory, FinanceData } from "./schema";

/*
 * Converts the dashboard's multi-month model into the single-month `FinanceData` the report API expects.
 * Returns null when there isn't enough to build a valid report (no income or no transactions).
 */

const DEBIT_MAP: Record<string, DebitCategory> = {
  Housing: "rent",
  Food: "food",
  Groceries: "groceries",
  Transport: "transport",
  Shopping: "shopping",
  Utilities: "utilities",
  "EMI / Debt": "emi",
  Insurance: "insurance",
  Education: "education",
};

const INVESTMENT_RE = /\b(sip|mutual ?fund|zerodha|groww|upstox|kuvera|nps|ppf|fixed deposit|fd)\b/i;
const REFUND_RE = /refund|reversal|cashback/i;

/** A month whose statement ends before this day is treated as partial; the previous month is reported instead. */
const PARTIAL_MONTH_DAY = 25;

function reportPeriod(transactions: AppTransaction[]): string | null {
  const months = monthsInData(transactions); // newest first
  if (!months.length) return null;
  const latest = months[0];
  const lastDay = Math.max(...transactions.filter((t) => monthKey(t.date) === latest).map((t) => Number(t.date.slice(8, 10))));
  return lastDay < PARTIAL_MONTH_DAY && months.length > 1 ? months[1] : latest;
}

const dayOf = (iso: string) => Math.min(31, Math.max(1, Number(iso.slice(8, 10)) || 1));

export function toFinanceData(transactions: AppTransaction[], snapshot: FinancialSnapshot): FinanceData | null {
  if (snapshot.monthlyIncome <= 0) return null;
  const period = reportPeriod(transactions);
  if (!period) return null;

  const salary = snapshot.recurring.find((s) => s.type === "income");
  const seen = new Set<string>();
  const txs: FinanceData["transactions"] = [];
  for (const t of transactions) {
    if (monthKey(t.date) !== period || t.amount <= 0 || seen.has(t.id)) continue;
    seen.add(t.id);
    const base = { id: t.id, date: t.date, amount: t.amount, description: (t.merchant || t.originalDescription).slice(0, 200) };
    const text = `${t.merchant} ${t.originalDescription}`;
    if (INVESTMENT_RE.test(text)) {
      txs.push({ ...base, type: "investment", flow: t.type === "expense" ? "out" : "in", category: /sip|mutual/i.test(text) ? "sip" : "other" });
    } else if (t.type === "income") {
      const category: CreditCategory = REFUND_RE.test(text) ? "refund" : t.category === "Income" && t.recurring ? "salary" : "other";
      txs.push({ ...base, type: "credit", category });
    } else {
      txs.push({ ...base, type: "debit", category: DEBIT_MAP[t.category] ?? "other" });
    }
  }
  if (!txs.length) return null;

  return {
    user: { name: "You", currency: "INR", monthlyIncome: snapshot.monthlyIncome, salaryDay: salary ? dayOf(salary.nextDate) : 1 },
    period,
    commitments: snapshot.recurring
      .filter((s) => s.type === "expense" && s.monthlyAmount > 0)
      .map((s) => ({ name: s.merchant, category: DEBIT_MAP[s.category] ?? "other", amount: s.monthlyAmount, dueDay: dayOf(s.nextDate), endDate: null })),
    transactions: txs,
  };
}
