import { NextResponse } from "next/server";
import { chat, GeminiNotConfiguredError } from "@/lib/ai/gemini";
import { computeMetrics } from "@/lib/report/metrics";
import { chatRequestSchema, isoDay, resolveToday } from "@/lib/report/request";
import { formatIssues } from "@/lib/report/schema";

export const runtime = "nodejs";

/** POST { data, insights?, messages, today? } → { reply, affordability } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid chat request", issues: formatIssues(parsed.error) }, { status: 400 });

  const { data, insights, messages, today } = parsed.data;
  const now = resolveToday(today);
  const metrics = computeMetrics(data, now);

  try {
    return NextResponse.json(await chat({ data, metrics, insights, messages, today: isoDay(now) }));
  } catch (e) {
    if (e instanceof GeminiNotConfiguredError) {
      console.error("[report/chat]", e.message);
      return NextResponse.json({ error: "The assistant isn't configured on the server." }, { status: 500 });
    }
    console.error("[report/chat] Gemini failed:", e);
    return NextResponse.json({ error: "The assistant couldn't answer right now. Please try again." }, { status: 500 });
  }
}
