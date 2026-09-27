"use client";

import { ChevronDown, LifeBuoy, PiggyBank, Wallet } from "lucide-react";
import { useState } from "react";
import { EMERGENCY_TARGET_MONTHS, type FinancialPosition } from "@/lib/financial/position";
import { cn, inr } from "@/lib/format";
import { ProgressBar } from "./ui";

const EF_BADGE = {
  healthy: { label: "Healthy", cls: "bg-pos-bg text-pos" },
  building: { label: "Building", cls: "bg-warn-bg text-warn" },
  missing: { label: "Not started", cls: "bg-neg-bg text-neg" },
} as const;

function Line({ label, value, strong, tone, sub }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg"; sub?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", sub ? "py-1 pl-3 text-[13px]" : "py-1.5 text-[14px]")}>
      <span className={cn(strong ? "font-semibold text-ink" : sub ? "text-subtle" : "text-muted")}>{label}</span>
      <span className={cn("num", strong ? "font-semibold" : sub ? "text-muted" : "font-medium", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Wallet; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-3.5">
      <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">
        <Icon size={13} /> {title}
      </p>
      {children}
    </section>
  );
}

/** The user's full position: monthly flow, savings and emergency-fund health. Used in chat and the Ask side panel. */
export function PositionCard({ position: p, className }: { position: FinancialPosition; className?: string }) {
  const [showFixed, setShowFixed] = useState(false);
  const ef = p.emergency;
  const badge = EF_BADGE[ef.status];

  return (
    <div className={cn("space-y-2 rounded-3xl border border-line bg-canvas/60 p-2.5", className)}>
      <Section icon={Wallet} title="Every month">
        <Line label="Income" value={inr(p.income)} />
        <button
          type="button"
          onClick={() => setShowFixed((v) => !v)}
          className="flex w-full items-baseline justify-between gap-3 py-1.5 text-left text-[14px]"
          aria-expanded={showFixed}
        >
          <span className="flex items-center gap-1 text-muted">
            Fixed expenses <ChevronDown size={14} className={cn("transition", showFixed && "rotate-180")} />
          </span>
          <span className="num font-medium">−{inr(p.fixed.total)}</span>
        </button>
        {showFixed && (
          <div className="animate-fade border-l border-line">
            {p.fixed.items.map((i) => (
              <Line key={i.name} sub label={`${i.name}${i.isEmi ? " (EMI)" : ""}`} value={inr(i.amount)} />
            ))}
          </div>
        )}
        <Line label="Typical spending" value={`−${inr(p.variable.total)}`} />
        <div className="mt-1 border-t border-line-2 pt-1">
          <Line label="Monthly surplus" value={inr(p.surplus)} strong tone={p.surplus < 0 ? "neg" : undefined} />
        </div>
        {p.goalContributions > 0 && <Line label="Already going to goals" value={`−${inr(p.goalContributions)}`} />}
        <Line label="Free for a new plan" value={inr(p.availableForNewGoals)} strong tone={p.availableForNewGoals > 0 ? "pos" : "neg"} />
      </Section>

      <Section icon={PiggyBank} title="Savings">
        <Line label="Unallocated" value={inr(p.savings.unallocated)} />
        {p.savings.inGoals.map((g) => (
          <Line key={g.name} label={`${g.emoji} ${g.name}`} value={inr(g.saved)} />
        ))}
        <div className="mt-1 border-t border-line-2 pt-1">
          <Line label="Total saved" value={inr(p.savings.total)} strong />
        </div>
      </Section>

      <Section icon={LifeBuoy} title="Emergency fund">
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="num text-[15px] font-semibold">
            {ef.status === "missing" ? "None yet" : `${ef.monthsCovered} of ${EMERGENCY_TARGET_MONTHS} months covered`}
          </span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", badge.cls)}>{badge.label}</span>
        </div>
        <ProgressBar value={Math.min(1, ef.monthsCovered / EMERGENCY_TARGET_MONTHS)} tone={ef.status === "healthy" ? "pos" : "warn"} className="my-1.5" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          {ef.status === "missing"
            ? `Aim for ${inr(ef.target)} — ${EMERGENCY_TARGET_MONTHS} months of your ${inr(ef.monthlyEssentials)} monthly expenses.`
            : `${inr(ef.saved)} saved of a recommended ${inr(ef.target)}${ef.monthlyContribution ? `, adding ${inr(ef.monthlyContribution)}/month` : ""}.`}
        </p>
      </Section>
    </div>
  );
}
