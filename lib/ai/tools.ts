import { calculateGoalRequirement } from "@/lib/financial/goals";
import { fmt, simulatePurchase, simulateScenario, timeToReach, type GoalDraft, type PurchaseSimulation, type ScenarioResult, type TimelineResult } from "@/lib/financial/simulator";
import { buildPosition, type FinancialPosition } from "@/lib/financial/position";
import type { FinancialSnapshot, GoalPlan, RecurringSeries } from "@/lib/financial/types";

/** Structured UI cards produced by deterministic tools. The UI renders these; the AI only explains them. */
export type Card =
  | { kind: "summary"; data: SummaryData }
  | { kind: "purchase"; data: PurchaseSimulation }
  | { kind: "scenario"; data: ScenarioResult }
  | { kind: "timeline"; data: TimelineResult }
  | { kind: "commitments"; data: RecurringSeries[] }
  | { kind: "goals"; data: GoalPlan[] }
  | { kind: "goalDraft"; data: GoalDraft }
  | { kind: "position"; data: FinancialPosition };

export interface SummaryData {
  monthlyIncome: number;
  fixedCommitments: number;
  variableSpending: number;
  monthlySurplus: number;
  safetyBuffer: number;
  safeToSpend: number;
  goalContributions: number;
  availableForNewGoals: number;
  unallocatedSavings: number;
}

const inr = (n: number) => `${n < 0 ? "-" : ""}₹${fmt(n)}`;

export function summaryOf(s: FinancialSnapshot): SummaryData {
  return {
    monthlyIncome: s.monthlyIncome,
    fixedCommitments: s.fixedCommitments,
    variableSpending: s.variableSpending,
    monthlySurplus: s.monthlySurplus,
    safetyBuffer: s.safetyBuffer,
    safeToSpend: s.safeToSpend,
    goalContributions: s.goalContributions,
    availableForNewGoals: s.availableForNewGoals,
    unallocatedSavings: s.unallocatedSavings,
  };
}

/** Finds an existing goal matching an item name ("this bike" → "X-Bike"). */
export function findGoal(snap: FinancialSnapshot, item?: string): GoalPlan | undefined {
  if (!item) return undefined;
  const words = item.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return snap.goals.find((p) => {
    const name = p.goal.name.toLowerCase();
    return words.some((w) => name.includes(w));
  });
}

// ---------- tool definitions (JSON schema, used by the Claude path) ----------

export const TOOL_DEFINITIONS = [
  {
    name: "get_financial_position",
    description:
      "Returns the user's full financial position: monthly income, itemised fixed expenses (EMIs, subscriptions, bills), typical variable spending by category, monthly surplus, savings (unallocated and per goal), emergency-fund health (months of expenses covered vs a 6-month target), goal contributions and surplus free for new plans. Call this first whenever the user is planning a purchase or asks how they're doing.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_financial_summary",
    description:
      "Returns the user's verified monthly financial model: expected income, fixed commitments, expected variable spending, monthly surplus, safety buffer, safe-to-spend, goal contributions, surplus available for new goals, and unallocated savings.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_active_goals",
    description: "Returns the user's savings goals with progress, remaining amount, required monthly saving, estimated completion and feasibility.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_recurring_commitments",
    description: "Returns detected recurring payments (EMIs, subscriptions, bills) and recurring income, with monthly amounts and next expected dates.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "calculate_monthly_surplus",
    description: "Returns income − fixed commitments − expected variable spending, and how much of it is free after existing goal contributions.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "calculate_goal_plan",
    description:
      "Plans a savings goal: remaining amount, months remaining, required monthly saving, and whether it fits the available surplus. Use for 'help me save X' or 'plan for X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Goal name, e.g. 'Emergency fund'" },
        target_amount: { type: "number", description: "Target amount in rupees" },
        current_savings: { type: "number", description: "Savings already set aside for it. Omit to use the user's unallocated savings." },
        target_date: { type: "string", description: "Optional ISO date yyyy-mm-dd" },
        months: { type: "number", description: "Optional timeline in months if the user gave one" },
      },
      required: ["name", "target_amount"],
      additionalProperties: false,
    },
  },
  {
    name: "simulate_purchase",
    description:
      "Checks whether a purchase is affordable using savings and the surplus left after existing commitments, spending and goals. Returns price, savings, surplus, required monthly saving, timeline, flexibility and a goal draft. If the item matches an existing goal it is analysed as that goal.",
    input_schema: {
      type: "object" as const,
      properties: {
        item: { type: "string", description: "What is being bought, e.g. 'bike'" },
        price: { type: "number", description: "Price in rupees. Omit if unknown and the item might match an existing goal." },
        target_date: { type: "string", description: "Optional ISO date yyyy-mm-dd" },
        months: { type: "number", description: "Optional timeline in months" },
      },
      required: ["item"],
      additionalProperties: false,
    },
  },
  {
    name: "simulate_scenario",
    description:
      "What-if analysis. Applies monthly changes and recomputes surplus, safe-to-spend and goal feasibility. Positive values increase, negative decrease.",
    input_schema: {
      type: "object" as const,
      properties: {
        label: { type: "string", description: "Short description, e.g. 'Rent +₹5,000'" },
        income_delta: { type: "number", description: "Change in monthly income" },
        fixed_delta: { type: "number", description: "Change in fixed commitments such as rent or a new EMI" },
        category_deltas: {
          type: "object",
          description: "Change in variable spending by category, e.g. {\"Food\": -3000}",
          additionalProperties: { type: "number" },
        },
        monthly_saving: { type: "number", description: "A fixed amount the user plans to save every month" },
      },
      required: ["label"],
      additionalProperties: false,
    },
  },
  {
    name: "time_to_reach",
    description: "How many months until savings reach a target amount, at the available surplus or at a given monthly saving.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_amount: { type: "number" },
        monthly_saving: { type: "number", description: "Optional; defaults to the surplus available for new goals" },
      },
      required: ["target_amount"],
      additionalProperties: false,
    },
  },
  {
    name: "create_goal",
    description:
      "Prepares a savings goal for the user to confirm in the app (it is created only when they tap 'Create this goal'). Use after planning when the user wants to go ahead.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        target_amount: { type: "number" },
        target_date: { type: "string", description: "ISO date yyyy-mm-dd" },
      },
      required: ["name", "target_amount"],
      additionalProperties: false,
    },
  },
];

// ---------- execution ----------

export interface ToolOutput {
  result: unknown; // JSON handed back to the model
  card?: Card; // rendered in the chat UI
}

type Input = Record<string, unknown>;
const num = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(+v) ? +v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const isoDate = (v: unknown): string | undefined => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : undefined;
};

function describePurchase(sim: PurchaseSimulation) {
  return {
    item: sim.item,
    price: inr(sim.price),
    current_savings_used: inr(sim.currentSavings),
    remaining_to_save: inr(sim.remaining),
    monthly_surplus: inr(sim.monthlySurplus),
    existing_goal_contributions: inr(sim.existingGoalContributions),
    surplus_available_for_this: inr(sim.availableSurplus),
    fixed_commitments_untouched: inr(sim.fixedCommitments),
    can_buy_outright_keeping_buffer: sim.canBuyNow,
    recommended_months: sim.recommendedMonths,
    fastest_months_using_all_available_surplus: sim.fastestMonths,
    required_monthly_saving: inr(sim.requiredMonthly),
    flexibility_per_month: inr(sim.flexibility),
    feasibility: sim.feasibility,
    estimated_date: sim.estimatedDate,
    safe_to_spend_while_saving: inr(sim.safeToSpendWhileSaving),
    suggestions: sim.suggestions,
    is_existing_goal: Boolean(sim.existingGoalId),
    plan_steps: sim.steps.map((st) => `${st.title}: ${st.detail}`),
  };
}

export function executeTool(name: string, rawInput: unknown, snap: FinancialSnapshot, today = new Date()): ToolOutput {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Input;
  switch (name) {
    case "get_financial_position": {
      const p = buildPosition(snap);
      return {
        result: {
          monthly_income: inr(p.income),
          fixed_expenses_total: inr(p.fixed.total),
          fixed_expenses: p.fixed.items.map((i) => ({ name: i.name, monthly: inr(i.amount), emi: i.isEmi })),
          typical_variable_spending: inr(p.variable.total),
          variable_by_category: p.variable.byCategory.map((c) => ({ category: c.category, monthly: inr(c.amount) })),
          monthly_surplus: inr(p.surplus),
          safe_to_spend_estimate: inr(p.safeToSpend),
          savings_total: inr(p.savings.total),
          savings_unallocated: inr(p.savings.unallocated),
          savings_in_goals: p.savings.inGoals.map((g) => ({ goal: g.name, saved: inr(g.saved) })),
          emergency_fund: {
            status: p.emergency.status,
            saved: inr(p.emergency.saved),
            months_of_expenses_covered: p.emergency.monthsCovered,
            recommended_target_6_months: inr(p.emergency.target),
            monthly_contribution: inr(p.emergency.monthlyContribution),
          },
          existing_goal_contributions: inr(p.goalContributions),
          surplus_free_for_new_plans: inr(p.availableForNewGoals),
        },
        card: { kind: "position", data: p },
      };
    }
    case "get_financial_summary":
    case "calculate_monthly_surplus": {
      const s = summaryOf(snap);
      return {
        result: {
          expected_monthly_income: inr(s.monthlyIncome),
          fixed_commitments: inr(s.fixedCommitments),
          expected_variable_spending: inr(s.variableSpending),
          variable_by_category: Object.fromEntries(Object.entries(snap.variableByCategory).map(([k, v]) => [k, inr(v)])),
          monthly_surplus: inr(s.monthlySurplus),
          safety_buffer: inr(s.safetyBuffer),
          safe_to_spend_estimate: inr(s.safeToSpend),
          existing_goal_contributions: inr(s.goalContributions),
          surplus_available_for_new_goals: inr(s.availableForNewGoals),
          unallocated_savings: inr(s.unallocatedSavings),
          months_of_data_analyzed: snap.monthsAnalyzed,
        },
        card: { kind: "summary", data: s },
      };
    }
    case "get_active_goals":
      return {
        result: snap.goals.map((p) => ({
          name: p.goal.name,
          target: inr(p.goal.targetAmount),
          saved: inr(p.goal.currentSavings),
          remaining: inr(p.remaining),
          progress_percent: Math.round(p.progress * 100),
          target_date: p.goal.targetDate,
          required_monthly: inr(p.requiredMonthly),
          feasibility: p.feasibility,
          estimated_completion: p.estimatedCompletion,
        })),
        card: snap.goals.length ? { kind: "goals", data: snap.goals } : undefined,
      };
    case "get_recurring_commitments":
      return {
        result: snap.recurring.map((r) => ({
          name: r.merchant,
          type: r.type,
          category: r.category,
          frequency: r.frequency,
          amount: inr(r.amount),
          monthly: inr(r.monthlyAmount),
          next_expected: r.nextDate,
          emi: r.isEmi,
        })),
        card: { kind: "commitments", data: snap.recurring },
      };
    case "calculate_goal_plan":
    case "simulate_purchase": {
      const item = str(input.item) ?? str(input.name) ?? "Goal";
      let price = num(input.price) ?? num(input.target_amount);
      const goal = findGoal(snap, item);
      if (price === undefined && goal) price = goal.goal.targetAmount;
      if (price === undefined || price <= 0) {
        return { result: { error: "price_unknown", message: `Ask the user how much the ${item} costs.` } };
      }
      const useGoal = goal && Math.abs(goal.goal.targetAmount - price) < 1 ? goal.goal.id : undefined;
      const current = num(input.current_savings);
      let sim = simulatePurchase(snap, { price, item: useGoal ? goal!.goal.name : item, targetDate: isoDate(input.target_date), months: num(input.months), goalId: useGoal }, today);
      if (current !== undefined && !useGoal) {
        // Explicit savings for this goal override the unallocated-savings default.
        sim = simulatePurchase({ ...snap, unallocatedSavings: current }, { price, item, targetDate: isoDate(input.target_date), months: num(input.months) }, today);
      }
      return { result: describePurchase(sim), card: { kind: "purchase", data: sim } };
    }
    case "simulate_scenario": {
      const deltas = input.category_deltas && typeof input.category_deltas === "object" ? (input.category_deltas as Record<string, unknown>) : {};
      const categoryDeltas: Record<string, number> = {};
      for (const [k, v] of Object.entries(deltas)) {
        const n = num(v);
        if (n !== undefined) categoryDeltas[k] = n;
      }
      const res = simulateScenario(
        snap,
        {
          label: str(input.label) ?? "Scenario",
          incomeDelta: num(input.income_delta),
          fixedDelta: num(input.fixed_delta),
          categoryDeltas,
          monthlySaving: num(input.monthly_saving),
        },
        today,
      );
      return {
        result: {
          label: res.label,
          before: Object.fromEntries(Object.entries(res.before).map(([k, v]) => [k, inr(v)])),
          after: Object.fromEntries(Object.entries(res.after).map(([k, v]) => [k, inr(v)])),
          goal_impacts: res.goalImpacts,
          saving_projection: res.savingProjection && {
            monthly: inr(res.savingProjection.monthly),
            after_6_months: inr(res.savingProjection.after6),
            after_12_months: inr(res.savingProjection.after12),
            fits_available_surplus: res.savingProjection.fits,
          },
        },
        card: { kind: "scenario", data: res },
      };
    }
    case "time_to_reach": {
      const target = num(input.target_amount);
      if (!target || target <= 0) return { result: { error: "target_amount required" } };
      const t = timeToReach(snap, target, num(input.monthly_saving), today);
      return {
        result: { target: inr(t.target), current_savings: inr(t.currentSavings), remaining: inr(t.remaining), monthly_saving: inr(t.monthlySaving), months: t.months, date: t.date },
        card: { kind: "timeline", data: t },
      };
    }
    case "create_goal": {
      const name = str(input.name) ?? "Savings goal";
      const target = num(input.target_amount);
      if (!target || target <= 0) return { result: { error: "target_amount required" } };
      const sim = simulatePurchase(snap, { price: target, item: name, targetDate: isoDate(input.target_date) }, today);
      if (!sim.goalDraft) return { result: { error: "could not prepare goal" } };
      const req = calculateGoalRequirement(sim.goalDraft.targetAmount, sim.goalDraft.currentSavings, sim.goalDraft.targetDate, today);
      return {
        result: { status: "draft_ready_user_must_tap_create", name, target: inr(target), target_date: sim.goalDraft.targetDate, required_monthly: inr(req.requiredMonthly) },
        card: { kind: "goalDraft", data: sim.goalDraft },
      };
    }
    default:
      return { result: { error: `unknown tool ${name}` } };
  }
}
