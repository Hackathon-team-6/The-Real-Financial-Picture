"use client";

import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { FeasibilityExplainer } from "@/components/FeasibilityExplainer";
import { GoalCard } from "@/components/GoalCard";
import { GoalCreator } from "@/components/GoalCreator";
import { Button, Card, Row, SectionHeader, Sheet } from "@/components/ui";
import { formatMonthYear, inr } from "@/lib/format";
import { parseAmount } from "@/lib/financial/parse";
import { useFinance } from "@/lib/state/FinanceProvider";

export default function GoalsPage() {
  const { snapshot, deleteGoal, contributeToGoal, updateProfile } = useFinance();
  const [creating, setCreating] = useState(false);
  const [creatorKey, setCreatorKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contribution, setContribution] = useState("");
  const [editingSavings, setEditingSavings] = useState(false);
  const [savingsInput, setSavingsInput] = useState("");

  const selected = snapshot.goals.find((p) => p.goal.id === selectedId);
  const s = snapshot;

  const openCreator = () => {
    setCreatorKey((k) => k + 1);
    setCreating(true);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Plan ahead"
        title="Goals"
        actions={
          <Button onClick={openCreator} className="min-h-11 rounded-full px-4">
            <Plus size={18} /> New goal
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <aside className="lg:sticky lg:top-8 lg:col-span-4">
          <Card className="animate-rise p-5">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-muted">MONTHLY SAVING CAPACITY</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="num text-[32px] leading-none font-semibold">{inr(s.availableForNewGoals)}</p>
              <p className="pb-1 text-[13px] text-muted">free for new goals</p>
            </div>
            <div className="mt-4 border-t border-line-2 pt-2">
              <Row label="Monthly surplus" value={inr(s.monthlySurplus)} />
              <Row label="Existing goal contributions" value={`−${inr(s.goalContributions)}`} />
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[14px] text-muted">Unallocated savings</span>
                {editingSavings ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = parseAmount(savingsInput);
                      if (!isNaN(n)) updateProfile({ unallocatedSavings: Math.abs(n) });
                      setEditingSavings(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={savingsInput}
                      onChange={(e) => setSavingsInput(e.target.value)}
                      inputMode="numeric"
                      className="num h-9 w-28 rounded-xl border border-line px-2 text-right text-[15px] outline-none focus:border-ink"
                    />
                    <button className="h-9 rounded-xl bg-ink px-3 text-[13px] font-semibold text-white">Save</button>
                  </form>
                ) : (
                  <button
                    className="num flex items-center gap-1.5 text-[15px] font-medium"
                    onClick={() => {
                      setSavingsInput(String(s.unallocatedSavings));
                      setEditingSavings(true);
                    }}
                  >
                    {inr(s.unallocatedSavings)} <Pencil size={13} className="text-subtle" />
                  </button>
                )}
              </div>
            </div>
          </Card>
        </aside>

        <section className="lg:col-span-8">
          <SectionHeader title={`Your goals${s.goals.length ? ` · ${s.goals.length}` : ""}`} />
          {s.goals.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {s.goals.map((p) => (
                <GoalCard key={p.goal.id} plan={p} onClick={() => setSelectedId(p.goal.id)} />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-3xl">🎯</p>
              <p className="mt-2 text-[16px] font-semibold">No goals yet</p>
              <p className="mt-1 text-[14px] text-muted">Create one and we&apos;ll tell you exactly how much to save each month.</p>
              <Button className="mt-4 w-full" onClick={openCreator}>
                Create a goal
              </Button>
            </Card>
          )}

          <Link href="/ask" className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-card p-4 transition hover:bg-line-2">
            <span className="grid size-10 place-items-center rounded-xl bg-lime">
              <Sparkles size={18} />
            </span>
            <span className="flex-1 text-[14px]">
              <span className="block font-semibold">Not sure what&apos;s realistic?</span>
              <span className="text-muted">Ask “I want to buy a bike. Help me plan.”</span>
            </span>
          </Link>
        </section>
      </div>

      <GoalCreator key={creatorKey} open={creating} onClose={() => setCreating(false)} snapshot={s} />

      <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected ? `${selected.goal.emoji} ${selected.goal.name}` : ""}>
        {selected && (
          <div className="space-y-4">
            <div className="rounded-3xl bg-canvas p-4">
              <Row label="Target" value={inr(selected.goal.targetAmount)} />
              <Row label="Current savings" value={inr(selected.goal.currentSavings)} />
              <Row label="Remaining" value={inr(selected.remaining)} />
              <Row label="Target date" value={formatMonthYear(selected.goal.targetDate)} />
              <Row label="Months remaining" value={String(selected.monthsRemaining ?? "—")} />
              <Row label="Estimated completion" value={formatMonthYear(selected.estimatedCompletion)} />
              <div className="mt-1 border-t border-line pt-1">
                <Row label="Required / month" value={inr(selected.requiredMonthly)} strong />
              </div>
              <FeasibilityExplainer
                required={selected.requiredMonthly}
                available={selected.flexibility + selected.requiredMonthly}
                feasibility={selected.feasibility}
                remaining={selected.remaining}
              />
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = parseAmount(contribution);
                if (n > 0) contributeToGoal(selected.goal.id, n);
                setContribution("");
              }}
            >
              <input
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
                inputMode="numeric"
                placeholder="Add money, e.g. 5,000"
                className="num h-12 min-w-0 flex-1 rounded-2xl border border-line bg-canvas px-4 text-[16px] outline-none focus:border-ink"
              />
              <Button type="submit" disabled={!(parseAmount(contribution) > 0)}>
                Add
              </Button>
            </form>
            <Button
              variant="ghost"
              className="w-full text-neg"
              onClick={() => {
                deleteGoal(selected.goal.id);
                setSelectedId(null);
              }}
            >
              <Trash2 size={16} /> Delete goal
            </Button>
          </div>
        )}
      </Sheet>
    </AppShell>
  );
}
