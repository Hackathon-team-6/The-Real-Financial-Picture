"use client";

import { AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";
import type { Insight } from "@/lib/financial/insights";
import { cn } from "@/lib/format";

export function Insights({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3 md:max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
      {insights.map((i) => {
        const Icon = i.tone === "warning" ? AlertTriangle : i.tone === "positive" ? TrendingUp : Lightbulb;
        return (
          <article key={i.id} className="w-[78%] shrink-0 snap-start rounded-[var(--radius-card)] border border-line bg-card p-4 md:w-auto">
            <div
              className={cn(
                "mb-3 grid size-9 place-items-center rounded-xl",
                i.tone === "warning" ? "bg-warn-bg text-warn" : i.tone === "positive" ? "bg-pos-bg text-pos" : "bg-line-2 text-ink",
              )}
            >
              <Icon size={17} />
            </div>
            <h3 className="text-[15px] leading-snug font-semibold tracking-tight">{i.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{i.detail}</p>
          </article>
        );
      })}
    </div>
  );
}
