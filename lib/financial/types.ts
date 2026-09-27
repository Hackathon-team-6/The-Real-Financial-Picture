export type TransactionType = "income" | "expense";
export type Frequency = "monthly" | "weekly" | "yearly";

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  merchant: string;
  originalDescription: string;
  amount: number; // always positive; direction is in `type`
  type: TransactionType;
  category: string;
  source: string;
  recurring: boolean;
  recurringFrequency?: Frequency;
  confidence?: number;
}

export const CATEGORIES = [
  "Income",
  "Housing",
  "Food",
  "Groceries",
  "Transport",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Utilities",
  "EMI / Debt",
  "Healthcare",
  "Insurance",
  "Travel",
  "Education",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface RecurringSeries {
  id: string;
  merchant: string;
  category: string;
  type: TransactionType;
  frequency: Frequency;
  amount: number; // typical amount per occurrence
  monthlyAmount: number; // normalised to a month
  occurrences: number;
  lastDate: string;
  nextDate: string;
  isEmi: boolean;
  confidence: number;
}

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  currentSavings: number;
  targetDate?: string; // ISO yyyy-mm-dd
  createdAt: string;
}

export interface Profile {
  /** Liquid savings not yet allocated to any goal. */
  unallocatedSavings: number;
  safetyBuffer: number;
}

/** The structured financial model. This (not raw transactions) is what the assistant sees. */
export interface FinancialSnapshot {
  asOf: string;
  monthsAnalyzed: number;
  monthlyIncome: number;
  fixedCommitments: number;
  variableSpending: number;
  variableByCategory: Record<string, number>;
  monthlySurplus: number;
  safetyBuffer: number;
  safeToSpend: number;
  goalContributions: number;
  availableForNewGoals: number;
  unallocatedSavings: number;
  recurring: RecurringSeries[];
  goals: GoalPlan[];
}

export type Feasibility = "comfortable" | "tight" | "stretch" | "no-surplus";

export interface GoalPlan {
  goal: Goal;
  remaining: number;
  progress: number; // 0..1
  monthsRemaining: number | null;
  requiredMonthly: number;
  estimatedCompletion: string | null; // ISO
  feasibility: Feasibility;
  flexibility: number; // surplus left after this goal's contribution
}

export interface ParseResult {
  transactions: Transaction[];
  warnings: string[];
  skipped: number;
}
