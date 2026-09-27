"use client";

import { formatMonthYear, inr } from "@/lib/format";
import type { GoalPlan } from "@/lib/financial/types";
import { cn } from "@/lib/format";
import { Card, FeasibilityBadge, ProgressBar } from "./ui";

export function GoalCard({ plan, compact, onClick }: { plan: GoalPlan; compact?: boolean; onClick?: () => void }) {
  const { goal } = plan;
  const pct = Math.round(plan.progress * 100);
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper onClick={onClick} className={cn("block w-full text-left", onClick && "transition active:scale-[0.99]")}>
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-line-2 text-2xl">{goal.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[16px] font-semibold tracking-tight">{goal.name}</p>
              <FeasibilityBadge value={plan.remaining === 0 ? "comfortable" : plan.feasibility} />
            </div>
            <p className="num mt-0.5 text-[14px] text-muted">
              <span className="font-semibold text-ink">{inr(goal.currentSavings)}</span> / {inr(goal.targetAmount)}
            </p>
          </div>
        </div>
        <ProgressBar value={plan.progress} className="mt-4" tone={plan.remaining === 0 ? "pos" : "ink"} />
        <div className="mt-2 flex items-center justify-between text-[12.5px] text-muted">
          <span className="num">{plan.remaining === 0 ? "Goal reached 🎉" : `${pct}% complete`}</span>
          {plan.remaining > 0 && <span className="num">{inr(plan.requiredMonthly)}/mo</span>}
        </div>
        {!compact && plan.remaining > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-canvas p-3">
            <Mini label="Remaining" value={inr(plan.remaining)} />
            <Mini label="Months left" value={String(plan.monthsRemaining ?? "—")} />
            <Mini label="Est. done" value={formatMonthYear(plan.estimatedCompletion)} />
          </div>
        )}
      </Card>
    </Wrapper>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-[14px] font-semibold">{value}</p>
    </div>
  );
}
