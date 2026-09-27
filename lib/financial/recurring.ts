import { isEmiDescription, merchantKey } from "./normalize";
import type { Frequency, RecurringSeries, Transaction } from "./types";

const DAY = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const FREQUENCIES: { freq: Frequency; days: number; tolerance: number; perMonth: number }[] = [
  { freq: "weekly", days: 7, tolerance: 2, perMonth: 52 / 12 },
  { freq: "monthly", days: 30.4, tolerance: 6, perMonth: 1 },
  { freq: "yearly", days: 365, tolerance: 20, perMonth: 1 / 12 },
];

const RECURRING_FRIENDLY = new Set(["Income", "Subscriptions", "Utilities", "Housing", "Insurance", "Education", "EMI / Debt"]);

const AMOUNT_TOLERANCE = 0.15; // amounts within ±15% of the typical amount count as "similar"

/** Splits a merchant's transactions into clusters of similar amounts. */
function clusterByAmount(txs: Transaction[]): Transaction[][] {
  const sorted = [...txs].sort((a, b) => a.amount - b.amount);
  const clusters: Transaction[][] = [];
  for (const tx of sorted) {
    const current = clusters[clusters.length - 1];
    if (current) {
      const ref = median(current.map((t) => t.amount));
      if (Math.abs(tx.amount - ref) <= ref * AMOUNT_TOLERANCE) {
        current.push(tx);
        continue;
      }
    }
    clusters.push([tx]);
  }
  return clusters;
}

function classifyIntervals(dates: string[]): { freq: Frequency; regularity: number } | null {
  if (dates.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1], dates[i]));
  const typical = median(intervals);
  for (const f of FREQUENCIES) {
    if (Math.abs(typical - f.days) <= f.tolerance) {
      const regular = intervals.filter((iv) => Math.abs(iv - f.days) <= f.tolerance).length;
      const regularity = regular / intervals.length;
      if (regularity >= 0.6) return { freq: f.freq, regularity };
    }
  }
  return null;
}

export interface RecurringResult {
  transactions: Transaction[];
  series: RecurringSeries[];
}

/**
 * Detects recurring payments/income: same merchant, similar amounts, regular intervals, multiple occurrences.
 * EMI/loan transactions are always treated as recurring monthly commitments.
 */
export function detectRecurring(transactions: Transaction[]): RecurringResult {
  const byMerchant = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = merchantKey(tx.merchant, tx.type);
    const list = byMerchant.get(key);
    if (list) list.push(tx);
    else byMerchant.set(key, [tx]);
  }

  const flagged = new Map<string, { freq: Frequency; confidence: number }>();
  const series: RecurringSeries[] = [];

  for (const txs of byMerchant.values()) {
    for (const cluster of clusterByAmount(txs)) {
      const ordered = [...cluster].sort((a, b) => a.date.localeCompare(b.date));
      const isEmi = ordered.some((t) => t.category === "EMI / Debt" || (t.type === "expense" && isEmiDescription(t.originalDescription)));
      // Bills and subscriptions are expected to recur, so two occurrences are enough; for
      // everything else (e.g. two similar food orders a month apart) require three.
      // A frequency the user set by hand wins over detection and needs only one occurrence.
      const userFreq = ordered.find((t) => t.userRecurring)?.userRecurring;
      const minOccurrences = isEmi || userFreq ? 1 : RECURRING_FRIENDLY.has(ordered[0].category) ? 2 : 3;
      if (ordered.length < minOccurrences) continue;

      let result = classifyIntervals(ordered.map((t) => t.date));
      if (userFreq) result = { freq: userFreq, regularity: 1 };
      if (!result && isEmi) result = { freq: "monthly", regularity: 0.7 };
      if (!result) continue;

      const amounts = ordered.map((t) => t.amount);
      const typical = Math.round(median(amounts));
      const spread = (Math.max(...amounts) - Math.min(...amounts)) / Math.max(typical, 1);
      const confidence = Math.min(
        0.99,
        0.45 + 0.1 * Math.min(ordered.length, 4) + 0.1 * result.regularity - 0.2 * spread + (isEmi ? 0.1 : 0),
      );
      const perMonth = FREQUENCIES.find((f) => f.freq === result!.freq)!.perMonth;
      const last = ordered[ordered.length - 1];
      const nextDate =
        result.freq === "monthly" ? addMonths(last.date, 1) : result.freq === "weekly" ? addDays(last.date, 7) : addMonths(last.date, 12);

      series.push({
        id: `rec_${merchantKey(last.merchant, last.type)}_${typical}`,
        merchant: last.merchant,
        category: last.category,
        type: last.type,
        frequency: result.freq,
        amount: typical,
        monthlyAmount: Math.round(typical * perMonth),
        occurrences: ordered.length,
        lastDate: last.date,
        nextDate,
        isEmi,
        confidence: Math.round(confidence * 100) / 100,
      });
      for (const t of ordered) flagged.set(t.id, { freq: result.freq, confidence });
    }
  }

  const updated = transactions.map((tx) => {
    const f = flagged.get(tx.id);
    if (!f) return { ...tx, recurring: false, recurringFrequency: undefined };
    return { ...tx, recurring: true, recurringFrequency: f.freq, confidence: Math.round(f.confidence * 100) / 100 };
  });

  series.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  return { transactions: updated, series };
}

/**
 * A recurring series counts toward the forward-looking model only while it is still active,
 * i.e. its expected next occurrence is not long overdue relative to the latest data.
 */
export function isActiveSeries(s: RecurringSeries, asOf: string): boolean {
  const grace = s.frequency === "weekly" ? 10 : s.frequency === "monthly" ? 20 : 45;
  return daysBetween(s.nextDate, asOf) <= grace;
}

/** Next expected occurrence on or after `today` (rolls the detected next date forward by the series frequency). */
export function upcomingDate(s: Pick<RecurringSeries, "nextDate" | "frequency">, today = new Date()): string {
  const todayIso = today.toISOString().slice(0, 10);
  let d = s.nextDate;
  for (let i = 0; i < 60 && d < todayIso; i++) {
    d = s.frequency === "monthly" ? addMonths(d, 1) : s.frequency === "weekly" ? addDays(d, 7) : addMonths(d, 12);
  }
  return d;
}
