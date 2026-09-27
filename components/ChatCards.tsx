"use client";

import { ArrowRight, CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";
import type { Card as CardData } from "@/lib/ai/tools";
import type { GoalDraft } from "@/lib/financial/simulator";
import { cn, formatMonthYear, inr } from "@/lib/format";
import { CommitmentList } from "./CommitmentList";
import { GoalCard } from "./GoalCard";
import { PositionCard } from "./PositionCard";
import { Button, FeasibilityBadge, Row } from "./ui";

interface Props {
  card: CardData;
  created: boolean;
  onCreateGoal: (draft: GoalDraft) => void;
}

function Shell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="mt-3 rounded-3xl border border-line bg-canvas/60 p-4">
      {title && <p className="mb-1 text-[11.5px] font-semibold tracking-[0.12em] text-muted">{title}</p>}
      {children}
    </div>
  );
}

function CreateGoalButton({ draft, created, onCreateGoal }: { draft: GoalDraft; created: boolean; onCreateGoal: (d: GoalDraft) => void }) {
  if (created) {
    return (
      <Link href="/home" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-pos-bg text-[15px] font-semibold text-pos">
        <CheckCircle2 size={18} /> Goal created · View on Home <ArrowRight size={16} />
      </Link>
    );
  }
  return (
    <Button className="mt-3 w-full" onClick={() => onCreateGoal(draft)}>
      <Plus size={18} /> Create this goal
    </Button>
  );
}

export function ChatCard({ card, created, onCreateGoal }: Props) {
  switch (card.kind) {
    case "purchase": {
      const s = card.data;
      const months = s.feasibility === "stretch" || s.feasibility === "no-surplus" ? s.fastestMonths : s.recommendedMonths;
      return (
        <Shell>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11.5px] font-semibold tracking-[0.12em] text-muted">{s.existingGoalId ? "GOAL CHECK" : "PURCHASE PLAN"}</p>
            <FeasibilityBadge value={s.feasibility} />
          </div>
          <Row label={`${s.item} price`} value={inr(s.price)} />
          <Row label="Current savings" value={inr(s.currentSavings)} />
          <Row label="Monthly surplus" value={inr(s.monthlySurplus)} />
          {s.existingGoalContributions > 0 && <Row label="Other goals" value={`−${inr(s.existingGoalContributions)}`} />}
          <div className="mt-1 border-t border-line pt-1">
            <Row label="Required / month" value={inr(s.requiredMonthly)} strong />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-card p-3">
              <p className="text-[11.5px] text-muted">Timeline</p>
              <p className="num text-[18px] font-semibold">{months === null ? "—" : `~${months} mo`}</p>
              <p className="text-[11.5px] text-subtle">{formatMonthYear(s.estimatedDate)}</p>
            </div>
            <div className="rounded-2xl bg-card p-3">
              <p className="text-[11.5px] text-muted">Flexibility</p>
              <p className={`num text-[18px] font-semibold ${s.flexibility < 0 ? "text-neg" : "text-pos"}`}>{inr(s.flexibility)}</p>
              <p className="text-[11.5px] text-subtle">per month</p>
            </div>
          </div>
          {s.steps.length > 0 && (
            <div className="mt-3 rounded-2xl bg-card p-3.5">
              <p className="mb-2 text-[11.5px] font-semibold tracking-[0.12em] text-muted">YOUR PLAN</p>
              <ol className="space-y-3">
                {s.steps.map((st, i) => (
                  <li key={st.title} className="flex gap-3">
                    <span
                      className={cn(
                        "num grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                        st.tone === "warning" ? "bg-warn-bg text-warn" : st.tone === "positive" ? "bg-pos-bg text-pos" : "bg-line-2 text-ink",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] leading-snug font-semibold">{st.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{st.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {s.goalDraft && <CreateGoalButton draft={s.goalDraft} created={created} onCreateGoal={onCreateGoal} />}
        </Shell>
      );
    }
    case "position":
      // On desktop the same position is pinned beside the chat, so it isn't repeated in each answer.
      return (
        <div className="mt-3 lg:hidden">
          <p className="mb-1.5 px-1 text-[11.5px] font-semibold tracking-[0.12em] text-muted">YOUR POSITION TODAY</p>
          <PositionCard position={card.data} />
        </div>
      );
    case "goalDraft":
      return (
        <Shell title="GOAL DRAFT">
          <Row label="Goal" value={`${card.data.emoji} ${card.data.name}`} />
          <Row label="Target" value={inr(card.data.targetAmount)} />
          <Row label="Starting savings" value={inr(card.data.currentSavings)} />
          <Row label="Target date" value={formatMonthYear(card.data.targetDate)} />
          <CreateGoalButton draft={card.data} created={created} onCreateGoal={onCreateGoal} />
        </Shell>
      );
    case "summary": {
      const s = card.data;
      return (
        <Shell title="THIS MONTH (ESTIMATE)">
          <Row label="Income" value={inr(s.monthlyIncome)} />
          <Row label="Fixed commitments" value={`−${inr(s.fixedCommitments)}`} />
          <Row label="Expected spending" value={`−${inr(s.variableSpending)}`} />
          <Row label="Safety buffer" value={`−${inr(s.safetyBuffer)}`} />
          <div className="mt-1 border-t border-line pt-1">
            <Row label="Safe to spend" value={inr(s.safeToSpend)} strong tone={s.safeToSpend < 0 ? "neg" : "pos"} />
          </div>
        </Shell>
      );
    }
    case "scenario": {
      const r = card.data;
      const rows: [string, number, number][] = [
        ["Income", r.before.income, r.after.income],
        ["Fixed commitments", r.before.fixed, r.after.fixed],
        ["Expected spending", r.before.variable, r.after.variable],
        ["Monthly surplus", r.before.surplus, r.after.surplus],
        ["Safe to spend", r.before.safeToSpend, r.after.safeToSpend],
      ];
      return (
        <Shell title={`WHAT IF · ${r.label.toUpperCase()}`}>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 pt-1 text-[13.5px]">
            <span className="text-[11px] text-subtle" />
            <span className="text-right text-[11px] text-subtle">Now</span>
            <span className="text-right text-[11px] text-subtle">After</span>
            {rows.map(([label, a, b]) => (
              <div key={label} className="contents">
                <span className="text-muted">{label}</span>
                <span className="num text-right">{inr(a)}</span>
                <span className={`num text-right font-semibold ${b > a ? (label === "Income" || label === "Monthly surplus" || label === "Safe to spend" ? "text-pos" : "text-neg") : b < a ? (label === "Income" || label === "Monthly surplus" || label === "Safe to spend" ? "text-neg" : "text-pos") : ""}`}>
                  {inr(b)}
                </span>
              </div>
            ))}
          </div>
          {r.savingProjection && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card p-3">
                <p className="text-[11.5px] text-muted">In 6 months</p>
                <p className="num text-[17px] font-semibold">{inr(r.savingProjection.after6)}</p>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <p className="text-[11.5px] text-muted">In 12 months</p>
                <p className="num text-[17px] font-semibold">{inr(r.savingProjection.after12)}</p>
              </div>
            </div>
          )}
        </Shell>
      );
    }
    case "timeline": {
      const t = card.data;
      return (
        <Shell title="TIMELINE">
          <Row label="Target" value={inr(t.target)} />
          <Row label="Current savings" value={inr(t.currentSavings)} />
          <Row label="Saving / month" value={inr(t.monthlySaving)} />
          <div className="mt-1 border-t border-line pt-1">
            <Row label="Reached in" value={t.months === null ? "—" : `~${t.months} months · ${formatMonthYear(t.date)}`} strong />
          </div>
        </Shell>
      );
    }
    case "commitments":
      return (
        <div className="mt-3">
          <CommitmentList series={card.data} limit={6} />
        </div>
      );
    case "goals":
      return (
        <div className="mt-3 space-y-2">
          {card.data.map((p) => (
            <GoalCard key={p.goal.id} plan={p} compact />
          ))}
        </div>
      );
  }
}
