import { monthKey, monthsInData } from "./forecast";
import type { FinancialSnapshot, Transaction } from "./types";

export interface Insight {
  id: string;
  tone: "neutral" | "positive" | "warning";
  title: string;
  detail: string;
}

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

/** Generates 3–5 insights computed from the actual model. Nothing here is hardcoded copy about the data. */
export function generateInsights(snap: FinancialSnapshot, transactions: Transaction[]): Insight[] {
  const out: Insight[] = [];
  const income = snap.monthlyIncome;

  if (income > 0 && snap.fixedCommitments > 0) {
    const pct = Math.round((snap.fixedCommitments / income) * 100);
    out.push({
      id: "commit-ratio",
      tone: pct > 50 ? "warning" : pct > 35 ? "neutral" : "positive",
      title: `${pct}% of income is already committed`,
      detail: `Recurring commitments total ${inr(snap.fixedCommitments)}/month against ${inr(income)} of expected income.`,
    });
  }

  const subs = snap.recurring.filter((s) => s.type === "expense" && s.category === "Subscriptions");
  if (subs.length) {
    const total = subs.reduce((s, r) => s + r.monthlyAmount, 0);
    out.push({
      id: "subs",
      tone: "neutral",
      title: `Subscriptions cost about ${inr(total)}/month`,
      detail: `${subs.length} active: ${subs.map((s) => s.merchant).join(", ")}. That's ${inr(total * 12)} a year.`,
    });
  }

  const largest = snap.recurring.filter((s) => s.type === "expense").sort((a, b) => b.monthlyAmount - a.monthlyAmount)[0];
  if (largest) {
    out.push({
      id: "largest",
      tone: "neutral",
      title: `Largest commitment: ${largest.merchant}`,
      detail: `${inr(largest.monthlyAmount)}/month${largest.isEmi ? " (loan EMI)" : ""} — ${income ? Math.round((largest.monthlyAmount / income) * 100) : 0}% of your income.`,
    });
  }

  // Month-over-month change in the category that moved the most.
  const months = monthsInData(transactions);
  if (months.length >= 2) {
    const [cur, prev] = months;
    const totals = (m: string) => {
      const r: Record<string, number> = {};
      for (const t of transactions) {
        if (t.type !== "expense" || t.recurring || monthKey(t.date) !== m) continue;
        r[t.category] = (r[t.category] ?? 0) + t.amount;
      }
      return r;
    };
    const a = totals(cur);
    const b = totals(prev);
    let best: { cat: string; diff: number; pct: number } | null = null;
    for (const cat of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const diff = (a[cat] ?? 0) - (b[cat] ?? 0);
      const base = b[cat] ?? 0;
      if (base < 500) continue;
      const pct = Math.round((diff / base) * 100);
      if (Math.abs(pct) >= 5 && (!best || Math.abs(diff) > Math.abs(best.diff))) best = { cat, diff, pct };
    }
    if (best) {
      const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
      out.push({
        id: "mom",
        tone: best.diff > 0 ? "warning" : "positive",
        title: `${best.cat} spending ${best.diff > 0 ? "increased" : "decreased"} ${Math.abs(best.pct)}%`,
        detail: `${inr(Math.abs(best.diff))} ${best.diff > 0 ? "more" : "less"} in ${monthName(cur)} than in ${monthName(prev)}.`,
      });
    }
  }

  if (income > 0) {
    const rate = Math.round((snap.monthlySurplus / income) * 100);
    out.push({
      id: "surplus",
      tone: rate >= 20 ? "positive" : rate >= 5 ? "neutral" : "warning",
      title: snap.monthlySurplus > 0 ? `You can save about ${rate}% of income` : "Spending exceeds income",
      detail:
        snap.monthlySurplus > 0
          ? `Estimated surplus of ${inr(snap.monthlySurplus)}/month after commitments and typical spending.`
          : `You're short by about ${inr(snap.monthlySurplus)}/month on current patterns.`,
    });
  }

  return out.slice(0, 5);
}
