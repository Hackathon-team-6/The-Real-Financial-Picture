import {
  COMFORTABLE_SHARE,
  calculateGoalTimeline,
  classifyFeasibility,
  emojiFor,
  isoToday,
  monthsUntil,
  planGoals,
} from "./goals";
import { buildPosition, EMERGENCY_MIN_MONTHS, EMERGENCY_TARGET_MONTHS } from "./position";
import { addMonths } from "./recurring";
import type { Feasibility, FinancialSnapshot, Goal } from "./types";

export interface PlanStep {
  title: string;
  detail: string;
  tone: "neutral" | "positive" | "warning";
}

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
  steps: PlanStep[];
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const monthYear = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** Turns a simulation into an ordered, concrete plan grounded in the user's own position. */
function buildSteps(snap: FinancialSnapshot, sim: Omit<PurchaseSimulation, "steps">): PlanStep[] {
  const pos = buildPosition(snap);
  const ef = pos.emergency;
  const steps: PlanStep[] = [];

  if (ef.status === "missing") {
    steps.push({
      title: "Start an emergency fund alongside",
      detail: `You don't have one yet. Aim for ${EMERGENCY_TARGET_MONTHS} months of expenses (${fmtR(ef.target)}); don't let the ${sim.item.toLowerCase()} use money you'd need in a crisis.`,
      tone: "warning",
    });
  } else if (ef.monthsCovered < EMERGENCY_MIN_MONTHS) {
    steps.push({
      title: "Keep your emergency fund growing",
      detail: `${ef.goalName ?? "It"} covers about ${ef.monthsCovered} month${ef.monthsCovered === 1 ? "" : "s"} of expenses. ${ef.monthlyContribution ? `Keep the ${fmtR(ef.monthlyContribution)}/month going — this plan doesn't touch it.` : "Don't dip into it for this purchase."}`,
      tone: "warning",
    });
  } else {
    steps.push({ title: "Emergency fund is in good shape", detail: `It covers about ${ef.monthsCovered} months of expenses. Leave it untouched.`, tone: "positive" });
  }

  if (sim.remaining === 0) {
    steps.push({
      title: sim.canBuyNow ? "Pay from savings" : "Savings cover it, but only just",
      detail: sim.canBuyNow
        ? `Your savings cover ${fmtR(sim.price)} and still leave your ${fmtR(snap.safetyBuffer)} buffer.`
        : `Paying now would take you below your ${fmtR(snap.safetyBuffer)} safety buffer. Consider saving for a month or two first.`,
      tone: sim.canBuyNow ? "positive" : "warning",
    });
    return steps;
  }

  if (sim.currentSavings > 0) {
    steps.push({ title: `Start with ${fmtR(sim.currentSavings)} you already have`, detail: `That leaves ${fmtR(sim.remaining)} to save.`, tone: "neutral" });
  }

  if (sim.feasibility === "comfortable" || sim.feasibility === "tight") {
    const salary = snap.recurring.find((r) => r.type === "income");
    const day = salary ? Number(salary.lastDate.slice(8, 10)) : null;
    steps.push({
      title: `Set aside ${fmtR(sim.requiredMonthly)} every month`,
      detail: `${day ? `Move it on the ${ordinal(day)}, right after your salary arrives, ` : "Move it as soon as income arrives, "}for ${sim.recommendedMonths} month${sim.recommendedMonths === 1 ? "" : "s"}.`,
      tone: "neutral",
    });
    if (sim.estimatedDate) steps.push({ title: `Buy in ${monthYear(sim.estimatedDate)}`, detail: `Paid in full, with no new EMI added to your ${fmtR(snap.fixedCommitments)}/month of commitments.`, tone: "positive" });
    steps.push({
      title: `Keep ${fmtR(sim.flexibility)}/month spare`,
      detail: sim.feasibility === "tight" ? "That's a thin cushion — trimming one spending category would make this safer." : "That's your room for surprises after commitments, spending, goals and this plan.",
      tone: sim.feasibility === "tight" ? "warning" : "positive",
    });
  } else if (sim.feasibility === "stretch") {
    steps.push({
      title: "This timeline doesn't fit yet",
      detail: `It needs ${fmtR(sim.requiredMonthly)}/month but only ${fmtR(sim.availableSurplus)} is free after commitments and goals.`,
      tone: "warning",
    });
    if (sim.fastestMonths) steps.push({ title: `Or allow about ${sim.fastestMonths} months`, detail: `Saving all ${fmtR(sim.availableSurplus)}/month gets you there by ${sim.estimatedDate ? monthYear(sim.estimatedDate) : "then"}.`, tone: "neutral" });
    const top = pos.variable.byCategory[0];
    if (top) steps.push({ title: `Or trim ${top.category.toLowerCase()} spending`, detail: `It's your largest variable category at ${fmtR(top.amount)}/month.`, tone: "neutral" });
  } else {
    steps.push({ title: "Make room first", detail: "Your commitments and typical spending use up your income. Reduce spending or add income before planning this.", tone: "warning" });
  }
  return steps;
}

const fmtR = (n: number) => `₹${fmt(n)}`;

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
  const result: Omit<PurchaseSimulation, "steps"> = {
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
  return { ...result, steps: buildSteps(snap, result) };
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
