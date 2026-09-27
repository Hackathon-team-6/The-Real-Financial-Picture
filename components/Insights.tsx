"use client";

import { AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";
import type { Insight } from "@/lib/financial/insights";
import { cn } from "@/lib/format";
import { Card } from "./ui";

/** Insights as one compact list: scannable on phones and sized to sit in a column on desktop. */
export function Insights({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <Card className="divide-y divide-line-2 px-4">
      {insights.map((i) => {
        const Icon = i.tone === "warning" ? AlertTriangle : i.tone === "positive" ? TrendingUp : Lightbulb;
        return (
          <article key={i.id} className="flex gap-3 py-3.5">
            <div
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                i.tone === "warning" ? "bg-warn-bg text-warn" : i.tone === "positive" ? "bg-pos-bg text-pos" : "bg-line-2 text-ink",
              )}
            >
              <Icon size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14.5px] leading-snug font-semibold tracking-tight">{i.title}</h3>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.detail}</p>
            </div>
          </article>
        );
      })}
    </Card>
  );
}
