import { NextResponse } from "next/server";
import { generateInsights } from "@/lib/ai/gemini";
import { detectFindings } from "@/lib/report/insights";
import { computeMetrics } from "@/lib/report/metrics";
import { insightsRequestSchema, resolveToday } from "@/lib/report/request";
import { dataWarnings, formatIssues } from "@/lib/report/schema";

export const runtime = "nodejs";

/** POST { data, today?, count? } → { metrics, findings, insights, source, warnings } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const parsed = insightsRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid finance data", issues: formatIssues(parsed.error) }, { status: 400 });

  const { data, today, count } = parsed.data;
  const metrics = computeMetrics(data, resolveToday(today));
  const findings = detectFindings(metrics, data);
  // Never throws: falls back to template text when Gemini is unavailable.
  const { insights, source } = await generateInsights(metrics, findings, count);

  return NextResponse.json({ metrics, findings, insights, source, warnings: dataWarnings(data) });
}
