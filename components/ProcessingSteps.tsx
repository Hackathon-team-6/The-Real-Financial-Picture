"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/format";

const STEPS = [
  "Reading transactions",
  "Identifying merchants",
  "Normalizing transactions",
  "Detecting recurring payments",
  "Finding subscriptions",
  "Detecting EMIs",
  "Calculating commitments",
  "Building financial picture",
  "Preparing recommendations",
];

const STEP_MS = 280;

/** Full-screen analysis sequence shown after import; calls onDone when the last step completes. */
export function ProcessingSteps({ onDone, summary }: { onDone: () => void; summary?: string }) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (done >= STEPS.length) {
      const t = setTimeout(onDone, 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [done, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade flex-col items-center justify-center bg-ink px-6 text-white">
      <div className="w-full max-w-sm">
        <div className="relative mb-8 grid size-16 place-items-center">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-lime/30" />
          <span className="relative grid size-16 place-items-center rounded-full bg-lime text-2xl text-ink">✦</span>
        </div>
        <h2 className="text-[26px] font-semibold tracking-tight">Analyzing your finances…</h2>
        {summary && <p className="mt-1 text-[14px] text-white/55">{summary}</p>}
        <ul className="mt-7 space-y-3">
          {STEPS.map((s, i) => {
            const complete = i < done;
            const active = i === done;
            return (
              <li key={s} className={cn("flex items-center gap-3 text-[15px] transition", complete ? "text-white" : active ? "text-white/80" : "text-white/25")}>
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full transition",
                    complete ? "bg-lime text-ink" : active ? "border-2 border-lime/60 border-t-transparent animate-spin" : "border border-white/20",
                  )}
                >
                  {complete && <Check size={14} strokeWidth={3} />}
                </span>
                {s}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
