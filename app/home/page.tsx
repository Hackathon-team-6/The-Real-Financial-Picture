"use client";

import { Plus, Upload } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AskSearchBar } from "@/components/AskSearchBar";
import { CommitmentList } from "@/components/CommitmentList";
import { FinancialSummary } from "@/components/FinancialSummary";
import { GoalCard } from "@/components/GoalCard";
import { Insights } from "@/components/Insights";
import { PrivacyNote } from "@/components/PrivacyNote";
import { SafeToSpend } from "@/components/SafeToSpend";
import { Card, SectionHeader } from "@/components/ui";
import { greeting } from "@/lib/format";
import { useFinance } from "@/lib/state/FinanceProvider";
import { useAiInsights } from "@/lib/state/useAiInsights";

export default function HomePage() {
  const { snapshot, source } = useFinance();
  const { insights, ai } = useAiInsights();

  return (
    <AppShell wide>
      <header className="flex items-start justify-between pt-3 pb-5">
        <div>
          <p className="text-[14px] text-muted">{greeting()} 👋</p>
          <h1 className="mt-0.5 text-[26px] leading-tight font-semibold tracking-tight">Your Financial Picture</h1>
        </div>
        <Link href="/?import=1" className="mt-1 grid size-11 place-items-center rounded-full border border-line bg-card text-ink transition hover:bg-line-2" aria-label="Import statements">
          <Upload size={18} />
        </Link>
      </header>

      <div className="mb-4">
        <AskSearchBar />
      </div>

      {source === "demo" && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[12px] font-medium text-muted ring-1 ring-line">
          <span className="size-1.5 rounded-full bg-s3" /> Viewing demo data
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <SafeToSpend snapshot={snapshot} />
          <FinancialSummary snapshot={snapshot} />
        </div>

        <div className="space-y-6 md:space-y-4">
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

      <section className="mt-6">
        <SectionHeader title="Insights" action={ai && <span className="text-[12px] font-medium text-muted">Written by Gemini</span>} />
        <Insights insights={insights} />
      </section>

      <div className="mt-6">
        <PrivacyNote />
      </div>
    </AppShell>
  );
}
