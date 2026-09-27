import { calculateGoalTimeline } from "@/lib/financial/goals";
import type { Feasibility } from "@/lib/financial/types";
import { inr } from "@/lib/format";
import { FeasibilityBadge } from "./ui";

/** Compares the required monthly saving with the surplus that's actually free, and explains the result. */
export function FeasibilityExplainer({ required, available, feasibility, remaining }: { required: number; available: number; feasibility: Feasibility; remaining: number }) {
  const flexibility = available - required;
  const fastest = calculateGoalTimeline(remaining, available);
  let text: string;
  if (remaining === 0) text = "You've already saved enough for this goal.";
  else if (feasibility === "comfortable")
    text = `This fits comfortably. After setting aside ${inr(required)}/month you'd still have about ${inr(flexibility)}/month of flexibility.`;
  else if (feasibility === "tight")
    text = `This fits, but only just — about ${inr(flexibility)}/month of flexibility remains. An unexpected expense could delay it.`;
  else if (feasibility === "stretch")
    text = `This needs ${inr(required - available)}/month more than your free surplus. Consider more time${fastest ? ` (about ${fastest} months at your current surplus)` : ""}, lower spending, higher savings, or additional income.`;
  else text = "Right now there's no free surplus after commitments and spending. Reducing spending or increasing income would make room for this goal.";

  return (
    <div className="mt-3 rounded-2xl bg-card p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold tracking-wide text-muted">FEASIBILITY</p>
        <FeasibilityBadge value={remaining === 0 ? "comfortable" : feasibility} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
        <div>
          <p className="text-muted">Free monthly surplus</p>
          <p className="num text-[15px] font-semibold">{inr(available)}</p>
        </div>
        <div>
          <p className="text-muted">Estimated flexibility</p>
          <p className={`num text-[15px] font-semibold ${flexibility < 0 ? "text-neg" : "text-pos"}`}>{inr(flexibility)}/mo</p>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/80">{text}</p>
    </div>
  );
}
