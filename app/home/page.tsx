"use client";

import { ArrowRight, Cloud, CloudOff, LifeBuoy, Plus, Sparkles, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CommitmentList } from "@/components/CommitmentList";
import { FinancialSummary } from "@/components/FinancialSummary";
import { GoalCard } from "@/components/GoalCard";
import { Insights } from "@/components/Insights";
import { PrivacyNote } from "@/components/PrivacyNote";
import { SafeToSpend } from "@/components/SafeToSpend";
import { Card, ProgressBar, SectionHeader } from "@/components/ui";
import { buildPosition, EMERGENCY_TARGET_MONTHS } from "@/lib/financial/position";
import { greeting, inr } from "@/lib/format";
import { useFinance } from "@/lib/state/FinanceProvider";

const iconButton = "grid size-11 place-items-center rounded-full border border-line bg-card text-ink transition hover:bg-line-2";

export default function HomePage() {
  const { snapshot, insights, source, cloud } = useFinance();
  const position = useMemo(() => buildPosition(snapshot), [snapshot]);
  const CloudIcon = !cloud.enabled ? UserRound : cloud.user ? Cloud : CloudOff;
  const ef = position.emergency;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${greeting()} 👋`}
        title="Your Financial Picture"
        actions={
          // Desktop has these in the sidebar.
          <div className="flex gap-2 lg:hidden">
            <Link href="/?import=1" className={iconButton} aria-label="Import statements">
              <Upload size={18} />
            </Link>
            <Link href="/account" className={`relative ${iconButton}`} aria-label={cloud.user ? `Account: ${cloud.status}` : "Sign in to sync"}>
              <CloudIcon size={18} />
              {cloud.user && (
                <span
                  className={`absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-card ${cloud.status === "error" ? "bg-neg" : cloud.status === "syncing" ? "bg-warn" : "bg-pos"}`}
                />
              )}
            </Link>
          </div>
        }
      />

      {source === "demo" && (
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[12px] font-medium text-muted ring-1 ring-line">
          <span className="size-1.5 rounded-full bg-s3" /> Viewing demo data
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-7">
          <SafeToSpend snapshot={snapshot} />
          <FinancialSummary snapshot={snapshot} />
          <Link href="/ask" className="group flex items-center gap-4 rounded-[var(--radius-card)] bg-lime p-5 transition active:scale-[0.99]">
            <div className="grid size-12 place-items-center rounded-2xl bg-ink text-lime">
              <Sparkles size={22} />
            </div>
            <div className="flex-1">
              <p className="text-[16px] font-semibold tracking-tight">Ask Financial X-Ray</p>
              <p className="text-[14px] text-ink/70">Can I afford something?</p>
            </div>
            <ArrowRight size={20} className="transition group-hover:translate-x-1" />
          </Link>

          <section className="pt-2">
            <SectionHeader title="Savings & safety net" />
            <Card className="p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium text-muted">Total saved</p>
                  <p className="num mt-1 text-[22px] font-semibold">{inr(position.savings.total)}</p>
                </div>
                <p className="num text-right text-[12.5px] text-muted">
                  {inr(position.savings.unallocated)} unallocated
                  <br />
                  {inr(position.savings.total - position.savings.unallocated)} in goals
                </p>
              </div>
              <div className="mt-4 rounded-2xl bg-canvas p-3.5">
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <LifeBuoy size={15} /> Emergency fund
                  </span>
                  <span className="num text-muted">{ef.status === "missing" ? "Not started" : `${ef.monthsCovered} / ${EMERGENCY_TARGET_MONTHS} months`}</span>
                </div>
                <ProgressBar value={Math.min(1, ef.monthsCovered / EMERGENCY_TARGET_MONTHS)} tone={ef.status === "healthy" ? "pos" : "warn"} className="mt-2" />
                <p className="mt-2 text-[12.5px] text-muted">Recommended: {inr(ef.target)}, six months of your {inr(ef.monthlyEssentials)} monthly expenses.</p>
              </div>
            </Card>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <section>
            <SectionHeader
              title="Active goals"
              action={
                <Link href="/goals" className="flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink">
                  <Plus size={14} /> New
                </Link>
              }
            />
            {snapshot.goals.length ? (
              <div className="space-y-3">
                {snapshot.goals.map((p) => (
                  <Link key={p.goal.id} href="/goals" className="block">
                    <GoalCard plan={p} compact />
                  </Link>
                ))}
              </div>
            ) : (
              <Link href="/goals">
                <Card className="border-dashed p-5 text-center text-[14px] text-muted">Plan your first goal →</Card>
              </Link>
            )}
          </section>


          <section>
            <SectionHeader
              title="Upcoming commitments"
              action={
                <Link href="/activity?filter=recurring" className="text-[13px] font-semibold text-muted hover:text-ink">
                  See all
                </Link>
              }
            />
            <CommitmentList series={snapshot.recurring} limit={5} sortBy="date" />
          </section>
        </div>
      </div>

      <section className="mt-8">
        <SectionHeader title="Insights" />
        <Insights insights={insights} />
      </section>

      <div className="mt-6">
        <PrivacyNote />
      </div>
    </AppShell>
  );
}
