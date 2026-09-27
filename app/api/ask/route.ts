import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { localAssistant, type AssistantReply, type ChatMemory } from "@/lib/ai/assistant";
import { TOOL_DEFINITIONS, executeTool, type Card } from "@/lib/ai/tools";
import type { FinancialSnapshot } from "@/lib/financial/types";

export const runtime = "nodejs";

interface AskBody {
  message: string;
  snapshot: FinancialSnapshot;
  memory?: ChatMemory;
  history?: { role: "user" | "assistant"; text: string }[];
}

const MODEL = "claude-opus-5";
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPT = `You are Financial X-Ray, a friendly, precise personal-finance assistant inside a mobile app for users in India.

How you work:
- Every number you mention must come from a tool result. Never do financial arithmetic yourself and never invent figures. If you need a number, call a tool.
- When the user is planning or asking about a purchase, first call get_financial_position so they see their income, fixed expenses, savings and emergency fund; then call simulate_purchase (its result includes plan_steps).
- For "can I afford X" questions call simulate_purchase. For "help me save X" / goal planning call calculate_goal_plan. For "what if" questions call simulate_scenario. For "when will I reach X" call time_to_reach. For overviews use get_financial_position; for EMIs/subscriptions use get_recurring_commitments; for goals use get_active_goals.
- If the user wants to buy or plan for something and the price is unknown, first call simulate_purchase with just the item (it matches existing goals); if it reports price_unknown, ask for the price instead of guessing.
- The app renders each tool result as a visual card with the full breakdown and, for new plans, a "Create this goal" button. So keep your text short: 2–4 short sentences that explain what the numbers mean. Don't repeat every figure, don't use markdown tables or headings.
- Never answer with a bare yes/no. Explain the trade-off: timeline, monthly saving needed, remaining flexibility, and whether existing commitments and goals stay covered. When a goal doesn't fit, mention options: more time, lower spending, higher savings, or additional income.
- Call these figures estimates. Use the ₹ formatting exactly as returned by the tools (Indian digit grouping).
- Only call create_goal when the user explicitly asks to create or set up the goal; tell them to tap the button to confirm.`;

function lastRoundSuggestions(cards: Card[]): string[] | undefined {
  if (cards.some((c) => c.kind === "purchase")) return ["What if I reduce food spending by ₹3,000?"];
  return undefined;
}

async function claudeAssistant(body: AskBody): Promise<AssistantReply> {
  const client = new Anthropic();
  const snapshot = body.snapshot;
  const cards: Card[] = [];

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of (body.history ?? []).slice(-8)) {
    if (!h.text?.trim()) continue;
    // Keep strict alternation; merge consecutive same-role turns.
    const prev = messages[messages.length - 1];
    if (prev && prev.role === h.role && typeof prev.content === "string") prev.content += `\n\n${h.text}`;
    else messages.push({ role: h.role, content: h.text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `${body.message}\n\n(Today is ${today}.)`;
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") last.content += `\n\n${prompt}`;
  else messages.push({ role: "user", content: prompt });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("refusal");

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        try {
          const out = executeTool(block.name, block.input, snapshot);
          if (out.card) cards.push(out.card);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: `Tool failed: ${(e as Error).message}`, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { text: text || "Here's what I found.", cards: dedupeCards(cards), memory: body.memory ?? {}, suggestions: lastRoundSuggestions(cards), source: "claude" };
  }
  throw new Error("tool loop did not finish");
}

/** Keep only the latest card of each kind so the chat stays tidy. */
function dedupeCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.reverse().filter((c) => (seen.has(c.kind) ? false : (seen.add(c.kind), true))).reverse();
}

export async function POST(req: Request) {
  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body?.message?.trim() || !body.snapshot) {
    return NextResponse.json({ error: "Missing message or financial snapshot" }, { status: 400 });
  }
  const message = body.message.slice(0, 1000);

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return NextResponse.json(await claudeAssistant({ ...body, message }));
    } catch (e) {
      console.error("[ask] Claude path failed, falling back to local assistant:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json(localAssistant(message, body.snapshot, body.memory ?? {}));
}
