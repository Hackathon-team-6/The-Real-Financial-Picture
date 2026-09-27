"use client";

import { useEffect, useMemo, useState } from "react";
import type { Insight as AiInsight } from "@/lib/ai/gemini";
import type { Insight } from "@/lib/financial/insights";
import { toFinanceData } from "@/lib/report/adapter";
import { isoDay } from "@/lib/report/request";
import { useFinance } from "./FinanceProvider";

/** The dashboard always shows this many insight cards. */
const INSIGHT_COUNT = 4;

const CACHE_PREFIX = "financial-xray:ai-insights:";

const TONE: Record<AiInsight["severity"], Insight["tone"]> = { high: "warning", medium: "neutral", positive: "positive" };

function toDashboard(ai: AiInsight[]): Insight[] {
  return ai.map((i, n) => ({ id: `ai-${n}`, tone: TONE[i.severity], title: i.title, detail: i.detail, action: i.action }));
}

/** djb2 — only used to key the session cache, not for security. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readCache(key: string): Insight[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Insight[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, insights: Insight[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(insights));
  } catch {
    // Storage blocked or full: just refetch next time.
  }
}

/**
 * Gemini-written insights for the dashboard. Shows the local rule-based insights until Gemini answers, and keeps
 * them if the server is unreachable or has no Gemini key (the route's template fallback is not used here).
 */
export function useAiInsights(): { insights: Insight[]; ai: boolean } {
  const { insights: local, transactions, snapshot, hydrated } = useFinance();

  const request = useMemo(() => {
    if (!hydrated) return null;
    const data = toFinanceData(transactions, snapshot);
    if (!data) return null;
    const body = JSON.stringify({ data, today: isoDay(new Date()), count: INSIGHT_COUNT });
    return { body, key: CACHE_PREFIX + hash(body) };
  }, [hydrated, transactions, snapshot]);

  const [result, setResult] = useState<{ key: string; insights: Insight[] } | null>(null);

  useEffect(() => {
    if (!request) return;
    const cached = readCache(request.key);
    if (cached) {
      setResult({ key: request.key, insights: cached });
      return;
    }
    const ctrl = new AbortController();
    fetch("/api/report/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: request.body, signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: { insights: AiInsight[]; source: "gemini" | "fallback" }) => {
        if (json.source !== "gemini" || !json.insights?.length) return;
        const insights = toDashboard(json.insights.slice(0, INSIGHT_COUNT));
        writeCache(request.key, insights);
        setResult({ key: request.key, insights });
      })
      .catch(() => {
        // Offline, static hosting or a bad response: the local insights stay on screen.
      });
    return () => ctrl.abort();
  }, [request]);

  return result && request && result.key === request.key ? { insights: result.insights, ai: true } : { insights: local.slice(0, INSIGHT_COUNT), ai: false };
}
