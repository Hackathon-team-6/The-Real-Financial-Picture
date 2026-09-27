"use client";

import { Plus, Repeat, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CommitmentList } from "@/components/CommitmentList";
import { SpendingChart } from "@/components/SpendingChart";
import { TransactionEditor } from "@/components/TransactionEditor";
import { Button, Card, SectionHeader } from "@/components/ui";
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
  const { transactions, snapshot, files, hasData } = useFinance();
  const [filter, setFilter] = useState<Filter>("All");
  const [limit, setLimit] = useState(PAGE);
  // `key` remounts the form so it always opens with the right values.
  const [editor, setEditor] = useState<{ open: boolean; tx?: Transaction; key: number }>({ open: false, key: 0 });
  const openEditor = (tx?: Transaction) => setEditor((e) => ({ open: true, tx, key: e.key + 1 }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("filter") === "recurring") setFilter("Recurring");
    if (params.get("add") === "1") openEditor();
  }, []);

  const filtered = useMemo(() => {
    return transactions.filter((t) =>
      filter === "All" ? true : filter === "Income" ? t.type === "income" : filter === "Expenses" ? t.type === "expense" : t.recurring,
    );
  }, [transactions, filter]);

  // Whole-month totals (not just the rows currently shown).
  const monthTotals = useMemo(() => {
    const totals: Record<string, { in: number; out: number }> = {};
    for (const t of transactions) {
      const k = monthKey(t.date);
      totals[k] ??= { in: 0, out: 0 };
      if (t.type === "income") totals[k].in += t.amount;
      else totals[k].out += t.amount;
    }
    return totals;
  }, [transactions]);

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
    <AppShell requireData={false}>
      <PageHeader
        eyebrow={files.length ? `From ${files.join(", ")}` : "Your transactions"}
        title="Activity"
        actions={
          <Button onClick={() => openEditor()} className="min-h-11 rounded-full px-4">
            <Plus size={18} /> Add entry
          </Button>
        }
      />

      <TransactionEditor key={editor.key} open={editor.open} transaction={editor.tx} onClose={() => setEditor((e) => ({ ...e, open: false }))} />

      {!hasData ? (
        <Card className="mx-auto max-w-xl p-6 text-center">
          <p className="text-3xl">🧾</p>
          <p className="mt-2 text-[17px] font-semibold tracking-tight">No transactions yet</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            Add your salary, rent and regular bills by hand, or import a bank statement. Everything else updates as you go.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button onClick={() => openEditor()}>
              <Plus size={18} /> Add first entry
            </Button>
            <Link href="/?import=1" className="contents">
              <Button variant="secondary">
                <Upload size={16} /> Import statement
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          <div className="space-y-6 lg:sticky lg:top-8 lg:col-span-5">
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

          <section className="lg:col-span-7">
            <div className="sticky top-0 z-10 -mx-4 bg-canvas/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:mx-0 lg:px-0">
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
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <p className="text-[13px] font-semibold text-muted">{monthLabel(month)}</p>
                  <p className="num text-[12.5px] text-subtle">
                    <span className="text-pos">+{inr(monthTotals[month]?.in ?? 0)}</span> · −{inr(monthTotals[month]?.out ?? 0)}
                  </p>
                </div>
                <Card className="divide-y divide-line-2 px-4">
                  {txs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openEditor(t)}
                      aria-label={`Edit ${t.merchant}, ${inr(t.amount)} on ${formatDate(t.date)}`}
                      className="flex w-full items-center gap-3 py-3 text-left transition hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-line-2 text-[17px]">{CATEGORY_EMOJI[t.category] ?? "•"}</div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                          {t.merchant}
                          {t.recurring && <Repeat size={12} className="shrink-0 text-subtle" aria-label="Recurring" />}
                          {t.manual && <span className="shrink-0 rounded-full bg-line-2 px-1.5 py-px text-[10.5px] font-semibold text-muted">Manual</span>}
                        </p>
                        <p className="truncate text-[12.5px] text-muted" title={t.originalDescription}>
                          {formatDate(t.date)} · {t.category}
                        </p>
                      </div>
                      <p className={cn("num text-[15px] font-semibold", t.type === "income" ? "text-pos" : "text-ink")}>
                        {t.type === "income" ? "+" : "-"}
                        {inr(t.amount)}
                      </p>
                    </button>
                  ))}
                </Card>
              </div>
            ))}

            {filtered.length > limit && (
              <button
                onClick={() => setLimit((l) => l + PAGE)}
                className="mt-4 h-12 w-full rounded-2xl border border-line bg-card text-[14px] font-semibold text-muted hover:text-ink"
              >
                Show more ({filtered.length - limit} left)
              </button>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
