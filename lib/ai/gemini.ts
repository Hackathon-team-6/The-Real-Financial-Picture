import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { affordabilityInputSchema, checkAffordability, type AffordabilityResult } from "@/lib/report/affordability";
import { DEFAULT_ANNUAL_RATE_PCT } from "@/lib/report/emi";
import type { Finding, Severity } from "@/lib/report/insights";
import type { Metrics } from "@/lib/report/metrics";
import type { FinanceData } from "@/lib/report/schema";
import { formatINR } from "@/lib/format";
import { CHAT_SYSTEM_PROMPT, fillTemplate, INSIGHTS_COUNT_SUFFIX, INSIGHTS_PROMPT } from "./report-prompts";

/*
 * Server-only. Gemini never computes numbers: it phrases precomputed metrics/findings, and affordability
 * maths runs here via the check_affordability function call.
 */

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY or GEMINI_MODEL is not set");
  }
}

let client: GoogleGenAI | null = null;

function gemini(): { ai: GoogleGenAI; model: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) throw new GeminiNotConfiguredError();
  client ??= new GoogleGenAI({ apiKey });
  return { ai: client, model };
}

// ---------- insights ----------

export const insightSchema = z.object({
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(600),
  action: z.string().min(1).max(400),
  severity: z.enum(["high", "medium", "positive"]),
});
export type Insight = z.infer<typeof insightSchema>;

const insightsResponseSchema = z.object({ insights: z.array(insightSchema).min(1).max(12) });

const INSIGHTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          action: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "positive"] },
        },
        required: ["title", "detail", "action", "severity"],
      },
    },
  },
  required: ["insights"],
};

const pctText = (n: unknown) => `${n}%`;

/** Plain template text per finding, used when Gemini is unavailable or returns something unusable. */
export function fallbackInsights(findings: Finding[], m: Metrics): Insight[] {
  const card = (severity: Severity, title: string, detail: string, action: string): Insight => ({ title, detail, action, severity });
  return findings.map((f): Insight => {
    const d = f.data;
    switch (f.id) {
      case "emi_load_high":
      case "emi_load_moderate":
        return card(
          f.severity,
          `EMIs take ${pctText(d.emiLoadPct)} of income`,
          `Your EMI and loan payments are ${formatINR(m.emiCommitments)} a month out of ${formatINR(m.monthlyIncome)} income.`,
          f.id === "emi_load_high" ? "Avoid taking on new EMIs until one of the current loans ends." : "Keep new EMIs small so the total stays under 40% of income.",
        );
      case "low_savings":
        return card(
          f.severity,
          `Savings rate is ${pctText(d.savingsRatePct)}`,
          `After ${formatINR(m.totalDebit)} of spending this month, ${m.savingsRatePct < 0 ? "you spent more than your income" : "only a small part of your income is left"}.`,
          "Pick one variable category and set a cap for next month.",
        );
      case "overspent":
        return card(
          "high",
          `Spent ${formatINR(Number(d.shortfall))} more than came in`,
          `Debits were ${formatINR(m.totalDebit)} against credits of ${formatINR(m.totalCredit)} this month.`,
          "Review the largest debits below and postpone anything non-essential.",
        );
      case "category_heavy": {
        const cats = d.categories as { category: string; amount: number; pctOfIncome: number }[];
        const top = cats[0];
        return card(
          "medium",
          `${cap(top.category)} is ${pctText(top.pctOfIncome)} of income`,
          `You spent ${formatINR(top.amount)} on ${top.category} this month${cats.length > 1 ? `, and ${cats.length - 1} other categor${cats.length > 2 ? "ies are" : "y is"} also above 25%` : ""}.`,
          `Set a monthly limit for ${top.category}.`,
        );
      }
      case "large_transaction": {
        const t = (d.transactions as { amount: number; description: string; pctOfIncome: number }[])[0];
        return card(
          "medium",
          `One purchase took ${pctText(t.pctOfIncome)} of income`,
          `"${t.description || "A single debit"}" cost ${formatINR(t.amount)} this month.`,
          "For big purchases, plan them a month ahead so they come out of savings, not regular spending.",
        );
      }
      case "no_investments":
        return card("medium", "No investments this month", "Nothing was set aside into investments this period.", "Start with a small automatic amount on salary day, even ₹1,000.");
      case "good_savings":
        return card("positive", `Saving ${pctText(d.savingsRatePct)} of income`, `You kept ${formatINR(m.monthlyIncome - m.totalDebit)} of your ${formatINR(m.monthlyIncome)} income after spending.`, "Keep this up and move the surplus somewhere it won't get spent.");
      case "investing_consistently":
        return card("positive", `Invested ${pctText(d.pctOfIncome)} of income`, `You put ${formatINR(m.investedOut)} into investments this month.`, "Keep the same amount going every month.");
    }
  });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function generateInsights(metrics: Metrics, findings: Finding[], count?: number): Promise<{ insights: Insight[]; source: "gemini" | "fallback" }> {
  try {
    const { ai, model } = gemini();
    const res = await ai.models.generateContent({
      model,
      contents: fillTemplate(INSIGHTS_PROMPT, { metrics_json: metrics, findings_json: findings }) + (count ? fillTemplate(INSIGHTS_COUNT_SUFFIX, { count }) : ""),
      config: { responseMimeType: "application/json", responseJsonSchema: INSIGHTS_JSON_SCHEMA, temperature: 0.4 },
    });
    const parsed = insightsResponseSchema.safeParse(JSON.parse(res.text ?? ""));
    if (!parsed.success) throw new Error(`Gemini insights failed validation: ${parsed.error.message}`);
    return { insights: parsed.data.insights.slice(0, count), source: "gemini" };
  } catch (e) {
    if (e instanceof GeminiNotConfiguredError) console.warn(`[gemini] ${e.message}; using template insights`);
    else console.error("[gemini] insights failed, using fallback:", e);
    return { insights: fallbackInsights(findings, metrics).slice(0, count), source: "fallback" };
  }
}

// ---------- chat ----------

export const CHECK_AFFORDABILITY: FunctionDeclaration = {
  name: "check_affordability",
  description:
    "Checks whether the user can afford a purchase, now or in a later month, as a full payment or on EMI. Call this for any question about buying or affording something.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      item: { type: "string", description: "What the user wants to buy" },
      amount: { type: "number", description: "Price in INR" },
      emiTenures: {
        type: "array",
        items: { type: "integer" },
        description: "EMI tenures in months to evaluate. Default [3, 6, 9, 12] unless the user specifies.",
      },
      annualInterestRate: {
        type: "number",
        description: `Annual interest rate percent if the user mentions one; otherwise omit (the app assumes ${DEFAULT_ANNUAL_RATE_PCT}%).`,
      },
    },
    required: ["item", "amount"],
  },
};

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export const MAX_TOOL_ITERATIONS = 3;

export interface ChatResult {
  reply: string;
  /** Results of every check_affordability call made while answering, for the UI and for verification. */
  affordability: AffordabilityResult[];
}

export async function chat(args: { data: FinanceData; metrics: Metrics; insights: unknown; messages: ChatMessage[]; today: string }): Promise<ChatResult> {
  const { ai, model } = gemini();
  const { data, metrics } = args;

  const systemInstruction = fillTemplate(CHAT_SYSTEM_PROMPT, {
    user_json: data.user,
    period: data.period,
    metrics_json: metrics,
    commitments_json: data.commitments,
    insights_json: args.insights ?? [],
    today: args.today,
  });

  const contents: Content[] = args.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const affordability: AffordabilityResult[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools: [{ functionDeclarations: [CHECK_AFFORDABILITY] }], temperature: 0.3 },
    });

    const calls = res.functionCalls ?? [];
    if (!calls.length) {
      const text = res.text?.trim();
      if (!text) throw new Error(`Gemini returned no text (finishReason: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
      return { reply: text, affordability };
    }

    // Echo the model turn back unchanged (keeps thought signatures intact), then answer each call.
    const modelTurn = res.candidates?.[0]?.content;
    contents.push(modelTurn ?? { role: "model", parts: calls.map((functionCall) => ({ functionCall })) });

    contents.push({
      role: "user",
      parts: calls.map((call) => {
        let response: Record<string, unknown>;
        if (call.name !== "check_affordability") {
          response = { error: `Unknown function ${call.name}` };
        } else {
          const input = affordabilityInputSchema.safeParse(call.args ?? {});
          if (input.success) {
            const result = checkAffordability(input.data, data, metrics);
            affordability.push(result);
            response = { output: result };
          } else {
            response = { error: `Invalid arguments: ${input.error.issues.map((x) => `${x.path.join(".") || "args"}: ${x.message}`).join("; ")}` };
          }
        }
        return { functionResponse: { id: call.id, name: call.name, response } };
      }),
    });
  }
  throw new Error(`Gemini did not produce a text reply within ${MAX_TOOL_ITERATIONS} iterations`);
}
