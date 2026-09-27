import {
  COMFORTABLE_SHARE,
  calculateGoalTimeline,
  classifyFeasibility,
  emojiFor,
  isoToday,
  monthsUntil,
  planGoals,
} from "./goals";
import { addMonths } from "./recurring";
import type { Feasibility, FinancialSnapshot, Goal } from "./types";

export interface GoalDraft {
  name: string;
  emoji: string;
  targetAmount: number;
  currentSavings: number;
  targetDate: string;
}

export interface PurchaseSimulation {
  item: string;
  price: number;
  currentSavings: number;
  remaining: number;
  monthlySurplus: number;
  existingGoalContributions: number;
  availableSurplus: number;
  fixedCommitments: number;
  safeToSpend: number;
  canBuyNow: boolean;
  fastestMonths: number | null;
  recommendedMonths: number | null;
  requiredMonthly: number;
  flexibility: number;
  feasibility: Feasibility;
  estimatedDate: string | null;
  safeToSpendWhileSaving: number;
  suggestions: string[];
  goalDraft: GoalDraft | null;
  existingGoalId?: string;
}

function titleCase(s: string): string {
  // Capitalise plain lowercase words but keep brand casing like "iPhone" or "PS5".
  return s
    .split(/\s+/)
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Can the user afford a purchase? Uses savings + the monthly surplus left after fixed commitments,
 * expected spending and existing goal contributions — so existing commitments are never touched.
 */
export function simulatePurchase(
  snap: FinancialSnapshot,
  input: { price: number; item?: string; targetDate?: string; months?: number; goalId?: string },
  today = new Date(),
): PurchaseSimulation {
  const price = Math.max(0, Math.round(input.price));
  const item = titleCase((input.item || "purchase").trim());
  // When the purchase is an existing goal, use that goal's savings and don't count its own contribution twice.
  const existing = input.goalId ? snap.goals.find((p) => p.goal.id === input.goalId) : undefined;
  const savingsPool = existing ? existing.goal.currentSavings : snap.unallocatedSavings;
  const currentSavings = Math.min(savingsPool, price);
  const remaining = Math.max(0, price - savingsPool);
  const available = existing
    ? Math.max(0, snap.monthlySurplus - (snap.goalContributions - existing.requiredMonthly))
    : snap.availableForNewGoals;
  if (existing && !input.targetDate) input = { ...input, targetDate: existing.goal.targetDate };
  // Buying outright is only "safe" if savings still cover the safety buffer afterwards.
  const canBuyNow = savingsPool - price >= snap.safetyBuffer;

  const fastestMonths = calculateGoalTimeline(remaining, available);
  let recommendedMonths: number | null;
  if (input.targetDate) recommendedMonths = monthsUntil(input.targetDate, today);
  else if (input.months && input.months > 0) recommendedMonths = Math.round(input.months);
  else recommendedMonths = calculateGoalTimeline(remaining, available * COMFORTABLE_SHARE);
  if (remaining === 0) recommendedMonths = 0;

  const requiredMonthly = recommendedMonths && recommendedMonths > 0 ? Math.round(remaining / recommendedMonths) : 0;
  const feasibility = remaining === 0 ? "comfortable" : classifyFeasibility(requiredMonthly, available);
  const flexibility = Math.round(available - requiredMonthly);

  const monthsForDate = feasibility === "stretch" || feasibility === "no-surplus" ? fastestMonths : recommendedMonths;
  const estimatedDate = monthsForDate === null ? null : addMonths(isoToday(today), monthsForDate);

  const suggestions: string[] = [];
  if (feasibility === "stretch" && fastestMonths !== null) {
    suggestions.push(`Extend the timeline to about ${fastestMonths} months to fit your current surplus.`);
    suggestions.push(`Or free up ₹${fmt(requiredMonthly - available)}/month by trimming variable spending or subscriptions.`);
    suggestions.push("Additional income or a bonus would shorten the timeline.");
  } else if (feasibility === "no-surplus") {
    suggestions.push("Your current commitments and spending use up your income — reduce spending or increase income first.");
    const biggest = Object.entries(snap.variableByCategory).sort((a, b) => b[1] - a[1])[0];
    if (biggest) suggestions.push(`${biggest[0]} is your largest variable category at ₹${fmt(biggest[1])}/month.`);
  } else if (feasibility === "tight") {
    suggestions.push("It fits, but leaves little room. A small cut in discretionary spending would add breathing room.");
  }

  const draftMonths = monthsForDate && monthsForDate > 0 ? monthsForDate : 1;
  return {
    item,
    price,
    currentSavings,
    remaining,
    monthlySurplus: snap.monthlySurplus,
    existingGoalContributions: existing ? snap.goalContributions - existing.requiredMonthly : snap.goalContributions,
    availableSurplus: available,
    fixedCommitments: snap.fixedCommitments,
    safeToSpend: snap.safeToSpend,
    canBuyNow,
    fastestMonths,
    recommendedMonths,
    requiredMonthly,
    flexibility,
    feasibility,
    estimatedDate,
    safeToSpendWhileSaving: Math.round(snap.safeToSpend - requiredMonthly),
    suggestions,
    existingGoalId: existing?.goal.id,
    goalDraft:
      price > 0 && !existing
        ? {
            name: item,
            emoji: emojiFor(item),
            targetAmount: price,
            currentSavings,
            targetDate: input.targetDate ?? addMonths(isoToday(today), draftMonths),
          }
        : null,
  };
}

export interface ScenarioChange {
  incomeDelta?: number;
  fixedDelta?: number;
  categoryDeltas?: Record<string, number>;
  monthlySaving?: number;
  label?: string;
}

export interface ScenarioResult {
  label: string;
  before: { income: number; fixed: number; variable: number; surplus: number; safeToSpend: number; available: number };
  after: { income: number; fixed: number; variable: number; surplus: number; safeToSpend: number; available: number };
  goalImpacts: { name: string; emoji: string; before: Feasibility; after: Feasibility; completionBefore: string | null; completionAfter: string | null }[];
  savingProjection?: { monthly: number; after6: number; after12: number; fits: boolean };
}

/** What-if analysis: applies changes to the model and recomputes everything deterministically. */
export function simulateScenario(snap: FinancialSnapshot, change: ScenarioChange, today = new Date()): ScenarioResult {
  const categoryTotal = Object.values(change.categoryDeltas ?? {}).reduce((s, n) => s + n, 0);
  const income = snap.monthlyIncome + (change.incomeDelta ?? 0);
  const fixed = snap.fixedCommitments + (change.fixedDelta ?? 0);
  const variable = Math.max(0, snap.variableSpending + categoryTotal);
  const surplus = income - fixed - variable;
  const safeToSpend = surplus - snap.safetyBuffer;
  const goals: Goal[] = snap.goals.map((p) => p.goal);
  const newPlans = planGoals(goals, surplus, today);
  const goalContribAfter = newPlans.reduce((s, p) => s + p.requiredMonthly, 0);

  const result: ScenarioResult = {
    label: change.label ?? "Scenario",
    before: {
      income: snap.monthlyIncome,
      fixed: snap.fixedCommitments,
      variable: snap.variableSpending,
      surplus: snap.monthlySurplus,
      safeToSpend: snap.safeToSpend,
      available: snap.availableForNewGoals,
    },
    after: {
      income: Math.round(income),
      fixed: Math.round(fixed),
      variable: Math.round(variable),
      surplus: Math.round(surplus),
      safeToSpend: Math.round(safeToSpend),
      available: Math.round(Math.max(0, surplus - goalContribAfter)),
    },
    goalImpacts: snap.goals.map((p, i) => ({
      name: p.goal.name,
      emoji: p.goal.emoji,
      before: p.feasibility,
      after: newPlans[i].feasibility,
      completionBefore: p.estimatedCompletion,
      completionAfter: newPlans[i].estimatedCompletion,
    })),
  };

  if (change.monthlySaving && change.monthlySaving > 0) {
    const m = change.monthlySaving;
    result.savingProjection = {
      monthly: m,
      after6: snap.unallocatedSavings + m * 6,
      after12: snap.unallocatedSavings + m * 12,
      fits: m <= snap.availableForNewGoals,
    };
  }
  return result;
}

export interface TimelineResult {
  target: number;
  currentSavings: number;
  remaining: number;
  monthlySaving: number;
  months: number | null;
  date: string | null;
}

/** When will savings reach a target amount at the current available surplus (or a given monthly amount)? */
export function timeToReach(snap: FinancialSnapshot, target: number, monthly?: number, today = new Date()): TimelineResult {
  const saving = monthly && monthly > 0 ? monthly : snap.availableForNewGoals;
  const remaining = Math.max(0, target - snap.unallocatedSavings);
  const months = calculateGoalTimeline(remaining, saving);
  return {
    target,
    currentSavings: snap.unallocatedSavings,
    remaining,
    monthlySaving: Math.round(saving),
    months,
    date: months === null ? null : addMonths(isoToday(today), months),
  };
}

export function fmt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString("en-IN");
}
