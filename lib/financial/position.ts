import type { FinancialSnapshot } from "./types";

/** Months of essential expenses an emergency fund should cover. */
export const EMERGENCY_TARGET_MONTHS = 6;
/** Below this many months the fund is considered too thin to lean on. */
export const EMERGENCY_MIN_MONTHS = 3;

const EMERGENCY_NAME = /emergency|rainy|safety\s*net/i;

export type EmergencyStatus = "healthy" | "building" | "missing";

export interface FinancialPosition {
  income: number;
  fixed: { total: number; items: { name: string; amount: number; isEmi: boolean; category: string }[] };
  variable: { total: number; byCategory: { category: string; amount: number }[] };
  surplus: number;
  safetyBuffer: number;
  safeToSpend: number;
  savings: {
    unallocated: number;
    inGoals: { name: string; emoji: string; saved: number }[];
    total: number;
  };
  emergency: {
    status: EmergencyStatus;
    monthlyEssentials: number;
    target: number;
    saved: number;
    monthsCovered: number;
    goalName: string | null;
    monthlyContribution: number;
  };
  goalContributions: number;
  availableForNewGoals: number;
  monthsAnalyzed: number;
}

/**
 * Everything a person needs to see before planning a purchase, computed from the snapshot
 * (and therefore from the same synced data every screen uses).
 */
export function buildPosition(snap: FinancialSnapshot): FinancialPosition {
  const fixedItems = snap.recurring
    .filter((r) => r.type === "expense")
    .map((r) => ({ name: r.merchant, amount: r.monthlyAmount, isEmi: r.isEmi, category: r.category }))
    .sort((a, b) => b.amount - a.amount);

  const byCategory = Object.entries(snap.variableByCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const inGoals = snap.goals.map((p) => ({ name: p.goal.name, emoji: p.goal.emoji, saved: p.goal.currentSavings }));
  const totalSavings = snap.unallocatedSavings + inGoals.reduce((s, g) => s + g.saved, 0);

  const essentials = snap.fixedCommitments + snap.variableSpending;
  const efPlan = snap.goals.find((p) => EMERGENCY_NAME.test(p.goal.name));
  const efSaved = efPlan?.goal.currentSavings ?? 0;
  const monthsCovered = essentials > 0 ? efSaved / essentials : 0;
  const status: EmergencyStatus = !efPlan && efSaved === 0 ? "missing" : monthsCovered >= EMERGENCY_TARGET_MONTHS ? "healthy" : "building";

  return {
    income: snap.monthlyIncome,
    fixed: { total: snap.fixedCommitments, items: fixedItems },
    variable: { total: snap.variableSpending, byCategory },
    surplus: snap.monthlySurplus,
    safetyBuffer: snap.safetyBuffer,
    safeToSpend: snap.safeToSpend,
    savings: { unallocated: snap.unallocatedSavings, inGoals, total: totalSavings },
    emergency: {
      status,
      monthlyEssentials: essentials,
      target: Math.round(essentials * EMERGENCY_TARGET_MONTHS),
      saved: efSaved,
      monthsCovered: Math.round(monthsCovered * 10) / 10,
      goalName: efPlan?.goal.name ?? null,
      monthlyContribution: efPlan?.requiredMonthly ?? 0,
    },
    goalContributions: snap.goalContributions,
    availableForNewGoals: snap.availableForNewGoals,
    monthsAnalyzed: snap.monthsAnalyzed,
  };
}
