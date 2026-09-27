import { toTransaction, type RawTransaction } from "@/lib/financial/categorize";
import { addMonths } from "@/lib/financial/recurring";
import type { Goal, Profile, Transaction } from "@/lib/financial/types";

/**
 * Realistic demo statement: six months of history ending last month, written the way a bank
 * exports it (messy descriptions), so normalization, categorization and recurring detection
 * all do real work on it.
 */

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Splits `total` into `n` positive integer parts that sum exactly to `total`. */
function split(total: number, n: number, rand: () => number): number[] {
  const weights = Array.from({ length: n }, () => 0.6 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.max(1, Math.round((w / sum) * total)));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

interface VariableCategory {
  descriptions: string[];
  count: number;
  totals: number[]; // oldest → newest, one per month
}

// Monthly totals per category. The last three months average to:
// Food 6,000 · Groceries 3,000 · Transport 3,400 · Shopping 3,000 · Entertainment 1,450 · Other 700 = 17,550
const VARIABLE: Record<string, VariableCategory> = {
  Food: {
    descriptions: ["UPI-SWIGGY-BANGALORE", "ZOMATO ONLINE ORDER", "SWIGGY*ORDER 48213", "UPI/ZOMATO LTD", "STARBUCKS COFFEE MG ROAD", "DOMINOS PIZZA UPI"],
    count: 9,
    totals: [6400, 5600, 6200, 5800, 6300, 5900],
  },
  Groceries: {
    descriptions: ["BLINKIT UPI", "ZEPTO MARKETPLACE", "BIGBASKET ORDER", "DMART RETAIL"],
    count: 5,
    totals: [2800, 3300, 3100, 2900, 3200, 2900],
  },
  Transport: {
    descriptions: ["UBER INDIA TRIP", "OLA CABS RIDE", "HPCL PETROL PUMP", "UBER *TRIP HELP.UBER.COM", "RAPIDO BIKE TAXI", "NAMMA METRO RECHARGE"],
    count: 7,
    totals: [3000, 3600, 3200, 3100, 3300, 3800],
  },
  Shopping: {
    descriptions: ["AMAZON PAY INDIA", "AMZN MKTPLACE", "AMAZON.IN ORDER", "FLIPKART INTERNET", "MYNTRA DESIGNS"],
    count: 3,
    totals: [4200, 2600, 3300, 3500, 2400, 3100],
  },
  Entertainment: {
    descriptions: ["BOOKMYSHOW TICKETS", "PVR INOX CINEMAS", "STEAM PURCHASE"],
    count: 2,
    totals: [900, 1800, 1300, 1200, 1650, 1500],
  },
  Other: {
    descriptions: ["UPI/RAJU TEA STALL/9876543210", "UPI-SHARMA GENERAL STORE", "LAUNDRY SERVICE UPI"],
    count: 2,
    totals: [500, 800, 700, 600, 900, 600],
  },
};

interface RecurringTemplate {
  day: number;
  description: string;
  amounts: number[] | number;
  type: "income" | "expense";
}

const RECURRING: RecurringTemplate[] = [
  { day: 1, description: "NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY", amounts: 73000, type: "income" },
  { day: 3, description: "NACH DR BAJAJ FINSERV PERSONAL LOAN EMI", amounts: 11004, type: "expense" },
  { day: 5, description: "CLAUDE.AI SUBSCRIPTION ANTHROPIC", amounts: [2401, 2399, 2400, 2399, 2401, 2400], type: "expense" },
  { day: 5, description: "MICROSOFT*XBOX GAME PASS", amounts: 830, type: "expense" },
  { day: 7, description: "HDFC CAR LOAN EMI ACH DEBIT", amounts: 8450, type: "expense" },
  { day: 12, description: "AIRTEL POSTPAID BILL PAYMENT", amounts: 950, type: "expense" },
];

const MONTHS = 6;

/** First day of each demo month, oldest first, ending with last month. */
function demoMonths(today: Date): string[] {
  const firstOfThisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  return Array.from({ length: MONTHS }, (_, i) => addMonths(firstOfThisMonth, i - MONTHS));
}

function withDay(monthStart: string, day: number): string {
  return `${monthStart.slice(0, 8)}${String(Math.min(day, 28)).padStart(2, "0")}`;
}

export function buildDemoRaw(today = new Date()): RawTransaction[] {
  const rand = rng(42);
  const rows: RawTransaction[] = [];
  const months = demoMonths(today);

  months.forEach((m, mi) => {
    for (const r of RECURRING) {
      const amount = Array.isArray(r.amounts) ? r.amounts[mi % r.amounts.length] : r.amounts;
      rows.push({ date: withDay(m, r.day), description: r.description, amount, type: r.type, source: "Demo statement" });
    }
    for (const cat of Object.values(VARIABLE)) {
      const parts = split(cat.totals[mi], cat.count, rand);
      parts.forEach((amount, i) => {
        const day = 1 + Math.floor(rand() * 28);
        const description = cat.descriptions[(i + mi) % cat.descriptions.length];
        rows.push({ date: withDay(m, day), description, amount, type: "expense", source: "Demo statement" });
      });
    }
  });
  return rows;
}

export function buildDemoTransactions(today = new Date()): Transaction[] {
  return buildDemoRaw(today).map(toTransaction);
}

export function buildDemoGoals(today = new Date()): Goal[] {
  const iso = today.toISOString().slice(0, 10);
  return [
    {
      id: "goal_emergency",
      name: "Emergency Fund",
      emoji: "🛟",
      targetAmount: 100000,
      currentSavings: 40000,
      targetDate: addMonths(iso, 12),
      createdAt: iso,
    },
  ];
}

export const DEMO_PROFILE: Profile = {
  unallocatedSavings: 25000,
  safetyBuffer: 10000,
};
