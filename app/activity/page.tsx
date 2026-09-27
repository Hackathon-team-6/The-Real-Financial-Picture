"use client";

import { Repeat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CommitmentList } from "@/components/CommitmentList";
import { SpendingChart } from "@/components/SpendingChart";
import { Card, SectionHeader } from "@/components/ui";
import { cn, formatDate, inr, monthLabel } from "@/lib/format";
import { monthKey } from "@/lib/financial/forecast";
import type { Transaction } from "@/lib/financial/types";
import { useFinance } from "@/lib/state/FinanceProvider";

const FILTERS = ["All", "Income", "Expenses", "Recurring"] as const;
type Filter = (typeof FILTERS)[number];

const CATEGORY_EMOJI: Record<string, string> = {
  Income: "💰",
  Housing: "🏠",
  Food: "🍔",
  Groceries: "🛒",
  Transport: "🚕",
  Shopping: "🛍️",
  Entertainment: "🎬",
  Subscriptions: "🔁",
  Utilities: "💡",
  "EMI / Debt": "🏦",
  Healthcare: "💊",
  Insurance: "🛡️",
  Travel: "✈️",
  Education: "🎓",
  Other: "•",
};

const PAGE = 60;

export default function ActivityPage() {
  const { transactions, snapshot, files } = useFinance();
  const [filter, setFilter] = useState<Filter>("All");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "recurring") setFilter("Recurring");
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter((t) =>
      filter === "All" ? true : filter === "Income" ? t.type === "income" : filter === "Expenses" ? t.type === "expense" : t.recurring,
    );
  }, [transactions, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered.slice(0, limit)) {
      const k = monthKey(t.date);
      const arr = map.get(k);
      if (arr) arr.push(t);
      else map.set(k, [t]);
    }
    return [...map.entries()];
  }, [filtered, limit]);

  return (
    <AppShell wide>
      <header className="pt-3 pb-5">
        <p className="text-[14px] text-muted">{files.length ? `From ${files.join(", ")}` : "Your transactions"}</p>
        <h1 className="mt-0.5 text-[26px] leading-tight font-semibold tracking-tight">Activity</h1>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-start">
        <div className="space-y-6 md:sticky md:top-4">
          <SpendingChart transactions={transactions} />
          <section>
            <SectionHeader title="Recurring payments" />
            <CommitmentList series={snapshot.recurring} showFrequency />
            {snapshot.recurring.some((r) => r.type === "income") && (
              <p className="mt-2 px-1 text-[12.5px] text-muted">
                Recurring income:{" "}
                {snapshot.recurring
                  .filter((r) => r.type === "income")
                  .map((r) => `${r.merchant} ${inr(r.amount)}/${r.frequency === "monthly" ? "mo" : r.frequency}`)
                  .join(", ")}
              </p>
            )}
          </section>
        </div>

        <section>
          <div className="sticky top-0 z-10 -mx-4 bg-canvas/90 px-4 py-2 backdrop-blur md:mx-0 md:px-0">
            <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    "h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition",
                    filter === f ? "bg-ink text-white" : "border border-line bg-card text-muted hover:text-ink",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 && <Card className="mt-3 p-6 text-center text-[14px] text-muted">No transactions match this filter.</Card>}

          {groups.map(([month, txs]) => (
            <div key={month} className="mt-4">
              <p className="mb-2 px-1 text-[13px] font-semibold text-muted">{monthLabel(month)}</p>
              <Card className="divide-y divide-line-2 px-4">
                {txs.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-line-2 text-[17px]">{CATEGORY_EMOJI[t.category] ?? "•"}</div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                        {t.merchant}
                        {t.recurring && <Repeat size={12} className="shrink-0 text-subtle" aria-label="Recurring" />}
                      </p>
                      <p className="truncate text-[12.5px] text-muted" title={t.originalDescription}>
                        {formatDate(t.date)} · {t.category}
                      </p>
                    </div>
                    <p className={cn("num text-[15px] font-semibold", t.type === "income" ? "text-pos" : "text-ink")}>
                      {t.type === "income" ? "+" : "-"}
                      {inr(t.amount)}
                    </p>
                  </div>
                ))}
              </Card>
            </div>
          ))}

          {filtered.length > limit && (
            <button onClick={() => setLimit((l) => l + PAGE)} className="mt-4 h-12 w-full rounded-2xl border border-line bg-card text-[14px] font-semibold text-muted hover:text-ink">
              Show more ({filtered.length - limit} left)
            </button>
          )}
        </section>
      </div>
    </AppShell>
  );
}
