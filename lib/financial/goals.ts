import { addMonths } from "./recurring";
import type { Feasibility, Goal, GoalPlan } from "./types";

/** Horizon assumed for goals created without a target date. */
export const DEFAULT_GOAL_MONTHS = 12;
/** Share of the available surplus we're comfortable committing to a single goal when proposing plans. */
export const COMFORTABLE_SHARE = 0.85;

export function isoToday(today = new Date()): string {
  return today.toISOString().slice(0, 10);
}

/** Whole calendar months from today until the target date (minimum 1). */
export function monthsUntil(targetDate: string, today = new Date()): number {
  const t = new Date(targetDate + "T00:00:00Z");
  const months = (t.getUTCFullYear() - today.getUTCFullYear()) * 12 + (t.getUTCMonth() - today.getUTCMonth());
  return Math.max(1, months);
}

export interface GoalRequirement {
  remaining: number;
  monthsRemaining: number;
  requiredMonthly: number;
  progress: number;
}

export function calculateGoalRequirement(
  targetAmount: number,
  currentSavings: number,
  targetDate: string | undefined,
  today = new Date(),
): GoalRequirement {
  const remaining = Math.max(0, Math.round(targetAmount - currentSavings));
  const monthsRemaining = targetDate ? monthsUntil(targetDate, today) : DEFAULT_GOAL_MONTHS;
  const requiredMonthly = remaining === 0 ? 0 : Math.round(remaining / monthsRemaining);
  const progress = targetAmount > 0 ? Math.min(1, Math.max(0, currentSavings / targetAmount)) : 0;
  return { remaining, monthsRemaining, requiredMonthly, progress };
}

/** Months needed to close `remaining` when saving `monthly` each month. null if it can never close. */
export function calculateGoalTimeline(remaining: number, monthly: number): number | null {
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(remaining / monthly - 1e-9);
}

export function classifyFeasibility(required: number, available: number): Feasibility {
  if (available <= 0) return required > 0 ? "no-surplus" : "comfortable";
  const flexibility = available - required;
  if (flexibility >= available * (1 - COMFORTABLE_SHARE)) return "comfortable";
  if (flexibility >= 0) return "tight";
  return "stretch";
}

export function planGoal(goal: Goal, availableSurplus: number, today = new Date()): GoalPlan {
  const req = calculateGoalRequirement(goal.targetAmount, goal.currentSavings, goal.targetDate, today);
  const feasibility = classifyFeasibility(req.requiredMonthly, availableSurplus);
  // If the required pace doesn't fit, estimate completion at what the surplus can actually support.
  const pace = feasibility === "stretch" || feasibility === "no-surplus" ? availableSurplus : req.requiredMonthly;
  const months = calculateGoalTimeline(req.remaining, pace);
  return {
    goal,
    remaining: req.remaining,
    progress: req.progress,
    monthsRemaining: req.remaining === 0 ? 0 : req.monthsRemaining,
    requiredMonthly: req.requiredMonthly,
    estimatedCompletion: months === null ? null : addMonths(isoToday(today), months),
    feasibility,
    flexibility: Math.round(availableSurplus - req.requiredMonthly),
  };
}

/** Plans every goal against the surplus left after the *other* goals' contributions. */
export function planGoals(goals: Goal[], monthlySurplus: number, today = new Date()): GoalPlan[] {
  const base = goals.map((g) => calculateGoalRequirement(g.targetAmount, g.currentSavings, g.targetDate, today).requiredMonthly);
  const total = base.reduce((s, n) => s + n, 0);
  return goals.map((g, i) => planGoal(g, monthlySurplus - (total - base[i]), today));
}

const EMOJI_RULES: [RegExp, string][] = [
  [/bike|motorcycle|scooter|x-?bike/i, "🏍️"],
  [/car|suv/i, "🚗"],
  [/iphone|phone|mobile|pixel|galaxy/i, "📱"],
  [/laptop|macbook|computer|pc/i, "💻"],
  [/emergency|rainy|safety/i, "🛟"],
  [/house|home|flat|apartment|down\s*payment/i, "🏠"],
  [/trip|travel|vacation|holiday|goa|europe|flight/i, "✈️"],
  [/wedding|marriage/i, "💍"],
  [/education|course|college|mba|study/i, "🎓"],
  [/camera/i, "📷"],
  [/watch/i, "⌚"],
  [/tv|television/i, "📺"],
  [/ps5|playstation|xbox|console|gaming/i, "🎮"],
];

export function emojiFor(name: string): string {
  for (const [re, e] of EMOJI_RULES) if (re.test(name)) return e;
  return "🎯";
}
