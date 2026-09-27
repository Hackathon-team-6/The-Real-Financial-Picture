import { fmt } from "@/lib/financial/simulator";
import type { FinancialSnapshot } from "@/lib/financial/types";
import { executeTool, findGoal, type Card } from "./tools";

export interface ChatMemory {
  item?: string;
  price?: number;
  awaiting?: "price";
}

export interface AssistantReply {
  text: string;
  cards: Card[];
  memory: ChatMemory;
  suggestions?: string[];
  source: "claude" | "local";
}

const inr = (n: number) => `₹${fmt(n)}`;

// ---------- natural-language parsing ----------

const UNIT: Record<string, number> = {
  k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, lk: 1e5, cr: 1e7, crore: 1e7, crores: 1e7,
};

/** Extracts rupee amounts: "₹1,80,000", "1.8 lakh", "90k", "Rs 2,00,000", "5 lakhs". */
export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|lk|l|crores?|cr)?\b(?!\s*(?:months?|years?|weeks?|days?|%|percent))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(n)) continue;
    const unit = m[2]?.toLowerCase();
    const value = unit ? n * (UNIT[unit] ?? 1) : n;
    const hasCurrency = /₹|rs|inr/i.test(m[0]);
    // Ignore bare small numbers like "2" in "2 wheels" unless they carry a unit or currency.
    if (!unit && !hasCurrency && value < 500) continue;
    out.push(Math.round(value));
  }
  return out;
}

const STOP = new Set(["it", "this", "that", "something", "anything", "more", "money", "much", "them", "one", "me"]);

/** Pulls the thing being bought / saved for: "buy a bike for…" → "bike". */
export function extractItem(text: string): string | undefined {
  const t = text.replace(/[?!.]/g, " ");
  const patterns = [
    /\b(?:buy|afford|purchase|get|getting|buying|own)\s+(?:(?:a|an|the|this|that|my|some)\s+)?(?:new\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)/i,
    /\bsave\s+(?:up\s+)?(?:for|towards)\s+(?:(?:a|an|the|my|this)\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)/i,
    /\bfor\s+(?:a|an|the|my|this)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)/i,
    /\bplan\s+(?:for\s+)?(?:a|an|the|my|this)\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (!m) continue;
    const words = m[1]
      .split(/\s+/)
      .filter((w) => !/^(for|worth|of|costing|at|with|without|by|in|within|and|help|me|plan|now|today|next|rs|inr)$/i.test(w) && !/^\d/.test(w));
    const item = words.slice(0, 2).join(" ").trim();
    if (item && !STOP.has(item.toLowerCase())) return item;
  }
  return undefined;
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "in 6 months", "within a year", "by April 2027" → { months } or { targetDate }. */
export function extractTimeline(text: string, today = new Date()): { months?: number; targetDate?: string } {
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12, eighteen: 18 };
  const toN = (s: string) => (isFinite(+s) ? +s : words[s.toLowerCase()]);
  let m = text.match(/\b(?:in|within|over|next)\s+(\d+|a|an|one|two|three|four|five|six|twelve|eighteen)\s+months?\b/i);
  if (m && toN(m[1])) return { months: toN(m[1]) };
  m = text.match(/\b(?:in|within|over|next)\s+(\d+|a|an|one|two|three|four|five)\s+years?\b/i);
  if (m && toN(m[1])) return { months: toN(m[1]) * 12 };
  m = text.match(/\bby\s+([a-z]{3,9})\s*(\d{4})?\b/i);
  if (m) {
    const mi = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      let year = m[2] ? +m[2] : today.getUTCFullYear();
      if (!m[2] && mi <= today.getUTCMonth()) year += 1;
      return { targetDate: `${year}-${String(mi + 1).padStart(2, "0")}-${String(Math.min(today.getUTCDate(), 28)).padStart(2, "0")}` };
    }
  }
  return {};
}

const CATEGORY_WORDS: [RegExp, string][] = [
  [/food|eating out|swiggy|zomato|dining|restaurant/i, "Food"],
  [/grocer/i, "Groceries"],
  [/transport|uber|ola|cab|fuel|petrol|travel to work/i, "Transport"],
  [/shopping|amazon|flipkart|clothes/i, "Shopping"],
  [/entertainment|movies?|games?/i, "Entertainment"],
];

// ---------- local (rule-based) assistant: same tools, deterministic phrasing ----------

function purchaseText(card: Extract<Card, { kind: "purchase" }>["data"], snap: FinancialSnapshot): string {
  const s = card;
  const name = s.item.toLowerCase() === "purchase" ? "this purchase" : `the ${s.item}`;
  if (s.remaining === 0 && s.canBuyNow) {
    return `Good news — your savings already cover ${name} (${inr(s.price)}) and you'd still keep your ${inr(snap.safetyBuffer)} safety buffer. Buying it now wouldn't touch your monthly commitments.`;
  }
  const lines: string[] = ["Here's what I found, based on your current financial picture:"];
  if (s.feasibility === "comfortable" || s.feasibility === "tight") {
    lines.push(
      `You could reach ${inr(s.price)} in about ${s.recommendedMonths} month${s.recommendedMonths === 1 ? "" : "s"} by setting aside ${inr(s.requiredMonthly)}/month.`,
    );
    lines.push(
      `That leaves roughly ${inr(s.flexibility)}/month of estimated flexibility. Your fixed commitments (${inr(s.fixedCommitments)}/month)${s.existingGoalContributions ? ` and existing goal contributions (${inr(s.existingGoalContributions)}/month)` : ""} stay fully covered.`,
    );
    if (s.feasibility === "tight") lines.push("It fits, but it's tight — an unexpected expense could push the date back a little.");
  } else if (s.feasibility === "stretch") {
    lines.push(
      `On your timeline you'd need ${inr(s.requiredMonthly)}/month, but only about ${inr(s.availableSurplus)}/month is free after commitments${s.existingGoalContributions ? " and other goals" : ""}.`,
    );
    if (s.fastestMonths) lines.push(`At your current surplus it would take about ${s.fastestMonths} months instead.`);
    lines.push("To make it work you could allow more time, lower spending, save more aggressively, or add income.");
  } else {
    lines.push("Right now your commitments and typical spending use up your income, so there's no surplus to save from.");
    lines.push("Reducing spending or increasing income comes first — I can model either with a what-if.");
  }
  if (s.existingGoalId) lines.push("This is already one of your goals, so the plan above is tracked on your Goals tab.");
  else if (s.goalDraft) lines.push("I've prepared a goal plan for you.");
  return lines.join("\n\n");
}

function scenarioText(r: Extract<Card, { kind: "scenario" }>["data"]): string {
  const p0 = r.savingProjection;
  if (p0 && r.after.surplus === r.before.surplus) {
    const left = r.before.surplus - p0.monthly;
    return [
      `Saving ${inr(p0.monthly)} every month would use ${Math.round((p0.monthly / Math.max(r.before.surplus, 1)) * 100)}% of your ${inr(r.before.surplus)} monthly surplus, leaving ${left < 0 ? "-" : ""}${inr(left)}/month for everything else.`,
      `You'd have about ${inr(p0.after6)} in 6 months and ${inr(p0.after12)} in 12 months (including your current savings).`,
      p0.fits
        ? "That fits alongside your existing goals and commitments."
        : `That's more than the ${inr(r.before.available)}/month left after your existing goals, so one of them would slow down.`,
    ].join("\n\n");
  }
  const d = r.after.surplus - r.before.surplus;
  const parts = [
    `${r.label}: your monthly surplus would go from ${inr(r.before.surplus)} to ${r.after.surplus < 0 ? "-" : ""}${inr(r.after.surplus)} (${d >= 0 ? "+" : "-"}${inr(d)}), and safe-to-spend from ${inr(r.before.safeToSpend)} to ${r.after.safeToSpend < 0 ? "-" : ""}${inr(r.after.safeToSpend)}.`,
  ];
  const changed = r.goalImpacts.filter((g) => g.before !== g.after);
  const label: Record<string, string> = { comfortable: "on track", tight: "tight", stretch: "a stretch", "no-surplus": "unaffordable for now" };
  if (changed.length) parts.push(changed.map((g) => `${g.emoji} ${g.name} would go from ${label[g.before]} to ${label[g.after]}.`).join(" "));
  else if (r.goalImpacts.length) parts.push("Your existing goals would stay on track.");
  if (r.savingProjection) {
    const p = r.savingProjection;
    parts.push(
      `Saving ${inr(p.monthly)}/month, you'd have about ${inr(p.after6)} in 6 months and ${inr(p.after12)} in 12 months. ${p.fits ? "That fits within your available surplus." : "That's more than your currently available surplus, so something else would need to give."}`,
    );
  }
  return parts.join("\n\n");
}

export function localAssistant(message: string, snap: FinancialSnapshot, memory: ChatMemory = {}, today = new Date()): AssistantReply {
  const text = message.trim();
  const lower = text.toLowerCase();
  const amounts = extractAmounts(text);
  const timeline = extractTimeline(text, today);
  let item = extractItem(text);
  const cards: Card[] = [];
  const reply = (t: string, mem: ChatMemory = {}, suggestions?: string[]): AssistantReply => ({ text: t, cards, memory: mem, suggestions, source: "local" });

  if (!snap.monthlyIncome && !snap.fixedCommitments && !snap.variableSpending) {
    return reply("I don't have any financial data yet. Upload a statement or load the demo data from the Home screen, and I'll analyse it for you.");
  }

  // Follow-up: we asked for a price and the user replied with just an amount.
  if (memory.awaiting === "price" && amounts.length && !/what if|suppose/.test(lower)) {
    item = item ?? memory.item;
  }

  const isScenario = /\bwhat if\b|\bwhat happens if\b|\bsuppose\b|\bif (my|i)\b/.test(lower) && !/\b(buy|afford|purchase)\b/.test(lower);
  const isPurchase = /\b(buy|afford|purchase|buying)\b/.test(lower) || (memory.awaiting === "price" && amounts.length > 0);
  const isTimeline = /\b(when will i|how long)\b/.test(lower) && /\b(reach|have|hit|save|get to)\b/.test(lower);
  const isGoal = /\b(save|saving|goal|plan|emergency fund)\b/.test(lower);

  // ----- what-if scenarios -----
  if (isScenario) {
    const amt = amounts[0];
    const input: Record<string, unknown> = {};
    let label = "";
    if (/\brent\b/.test(lower) && amt) {
      const sign = /decrease|reduce|drop|lower|cut/.test(lower) ? -1 : 1;
      input.fixed_delta = sign * amt;
      label = `Rent ${sign > 0 ? "+" : "−"}${inr(amt)}/month`;
    } else if (/\b(salary|income|pay)\b/.test(lower) && (amt || /%|percent/.test(lower))) {
      const pct = lower.match(/(\d+(?:\.\d+)?)\s*(%|percent)/);
      const delta = pct ? Math.round((snap.monthlyIncome * +pct[1]) / 100) : amt!;
      const sign = /decrease|reduce|drop|lower|cut|lose|lost/.test(lower) ? -1 : 1;
      input.income_delta = sign * delta;
      label = `Income ${sign > 0 ? "+" : "−"}${inr(delta)}/month`;
      if (/lose|lost/.test(lower) && /job/.test(lower)) {
        input.income_delta = -snap.monthlyIncome;
        label = "Income stops";
      }
    } else if (/\bsave\b/.test(lower) && amt) {
      input.monthly_saving = amt;
      label = `Saving ${inr(amt)} every month`;
    } else if (/subscription/.test(lower) && /cancel|stop|drop/.test(lower)) {
      const subs = snap.recurring.filter((r) => r.type === "expense" && r.category === "Subscriptions");
      input.fixed_delta = -subs.reduce((s, r) => s + r.monthlyAmount, 0);
      label = "Cancel all subscriptions";
    } else if (/\bemi\b|\bloan\b/.test(lower) && amt) {
      input.fixed_delta = /close|finish|end|pay off|prepay/.test(lower) ? -amt : amt;
      label = `EMI ${(input.fixed_delta as number) > 0 ? "+" : "−"}${inr(amt)}/month`;
    } else {
      const cat = CATEGORY_WORDS.find(([re]) => re.test(lower));
      if (cat && amt) {
        const sign = /increase|more|raise|up\b/.test(lower) ? 1 : -1;
        input.category_deltas = { [cat[1]]: sign * amt };
        label = `${cat[1]} spending ${sign > 0 ? "+" : "−"}${inr(amt)}/month`;
      }
    }
    if (!label) {
      return reply(
        "I can model what-ifs like a rent increase, a pay rise, cutting a spending category, or saving a fixed amount each month. Try one of these:",
        {},
        ["What if my rent increases by ₹5,000?", "What if I reduce food spending by ₹3,000?", "What if I save ₹20,000 every month?"],
      );
    }
    input.label = label;
    const out = executeTool("simulate_scenario", input, snap, today);
    if (out.card) cards.push(out.card);
    return reply(out.card?.kind === "scenario" ? scenarioText(out.card.data) : "Here's the scenario.");
  }

  // ----- timeline to a savings target -----
  if (isTimeline && !isPurchase && amounts.length) {
    const out = executeTool("time_to_reach", { target_amount: amounts[0], monthly_saving: amounts[1] }, snap, today);
    if (out.card?.kind === "timeline") {
      cards.push(out.card);
      const t = out.card.data;
      return reply(
        t.months === null
          ? `At the moment there's no free surplus to save towards ${inr(t.target)}. Reducing spending or increasing income would change that.`
          : t.months === 0
            ? `You already have ${inr(t.currentSavings)} set aside, which covers ${inr(t.target)}.`
            : `Saving about ${inr(t.monthlySaving)}/month on top of your ${inr(t.currentSavings)} in savings, you'd reach ${inr(t.target)} in roughly ${t.months} months — around ${new Date(t.date! + "T00:00:00Z").toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}.`,
      );
    }
  }

  // ----- purchases and goals -----
  if (isPurchase || (isGoal && (amounts.length || item))) {
    const existing = findGoal(snap, item);
    // Reuse a remembered price only when the conversation is still about the same item.
    const sameItem = !item || (memory.item && item.toLowerCase() === memory.item.toLowerCase());
    const price = amounts[0] ?? (existing ? existing.goal.targetAmount : memory.awaiting !== "price" && sameItem ? memory.price : undefined);
    const name = item ?? (/emergency/.test(lower) ? "Emergency fund" : isGoal && !isPurchase ? "Savings goal" : memory.item);

    if (!price) {
      const what = name ? `the ${name}` : "it";
      return reply(`Happy to help you plan for ${what}. Roughly how much does ${what} cost?`, { item: name, awaiting: "price" }, name ? [`About ₹1,80,000`, `Around ₹90,000`] : undefined);
    }

    const toolName = isPurchase ? "simulate_purchase" : "calculate_goal_plan";
    const input: Record<string, unknown> = { item: name ?? "purchase", price, months: timeline.months, target_date: timeline.targetDate };
    if (!isPurchase) input.name = name ?? "Savings goal";
    const out = executeTool(toolName, input, snap, today);
    if (out.card?.kind === "purchase") {
      cards.push(out.card);
      return reply(purchaseText(out.card.data, snap), { item: name, price }, out.card.data.goalDraft ? undefined : ["What if I reduce food spending by ₹3,000?"]);
    }
  }

  // ----- informational -----
  if (/subscription|commitment|emi|recurring|bills?\b|loan/.test(lower)) {
    const out = executeTool("get_recurring_commitments", {}, snap, today);
    if (out.card) cards.push(out.card);
    const subs = snap.recurring.filter((r) => r.type === "expense" && r.category === "Subscriptions");
    const subTotal = subs.reduce((s, r) => s + r.monthlyAmount, 0);
    const emis = snap.recurring.filter((r) => r.isEmi);
    return reply(
      `You have ${snap.recurring.filter((r) => r.type === "expense").length} recurring commitments totalling ${inr(snap.fixedCommitments)}/month.` +
        (emis.length ? ` EMIs account for ${inr(emis.reduce((s, r) => s + r.monthlyAmount, 0))} of that.` : "") +
        (subs.length ? ` Subscriptions (${subs.map((s) => s.merchant).join(", ")}) come to about ${inr(subTotal)}/month.` : ""),
    );
  }

  if (/\bgoals?\b/.test(lower)) {
    const out = executeTool("get_active_goals", {}, snap, today);
    if (out.card) cards.push(out.card);
    return reply(
      snap.goals.length
        ? `You have ${snap.goals.length} active goal${snap.goals.length === 1 ? "" : "s"}, needing ${inr(snap.goalContributions)}/month in total. After that, about ${inr(snap.availableForNewGoals)}/month is free for new goals.`
        : "You don't have any goals yet. Tell me what you're saving for and roughly how much it costs.",
    );
  }

  if (/safe to spend|spend|summary|overview|how am i doing|picture|surplus|income|budget/.test(lower)) {
    const out = executeTool("get_financial_summary", {}, snap, today);
    if (out.card) cards.push(out.card);
    return reply(
      `This month you can safely spend about ${inr(snap.safeToSpend)} (an estimate). That's your expected income of ${inr(snap.monthlyIncome)}, minus ${inr(snap.fixedCommitments)} in fixed commitments, ${inr(snap.variableSpending)} of typical spending and a ${inr(snap.safetyBuffer)} safety buffer.`,
    );
  }

  return reply(
    "I can check whether you can afford something, plan a savings goal, or run a what-if on your finances. Try asking:",
    {},
    ["Can I afford a bike for ₹1,80,000?", "Help me save ₹1 lakh for an emergency fund", "What if my rent increases by ₹5,000?", "When will I reach ₹5 lakh?"],
  );
}

export const STARTER_PROMPTS = [
  "Can I afford a bike for ₹1,80,000?",
  "I want to buy a bike. Help me plan.",
  "What if I reduce food spending by ₹3,000?",
  "When will I reach ₹5 lakh?",
];
