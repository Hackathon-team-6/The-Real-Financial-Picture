"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inr, inrCompact } from "@/lib/format";
import { monthKey, monthsInData } from "@/lib/financial/forecast";
import type { Transaction } from "@/lib/financial/types";
import { Card } from "./ui";

const EXCLUDED = new Set(["Income", "EMI / Debt"]);
const MAX_ROWS = 7;

/** Average monthly spend by category (recent 3 months), as a single-series horizontal bar chart. */
export function SpendingChart({ transactions }: { transactions: Transaction[] }) {
  const months = monthsInData(transactions).slice(0, 3);
  const totals: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== "expense" || EXCLUDED.has(t.category) || !months.includes(monthKey(t.date))) continue;
    totals[t.category] = (totals[t.category] ?? 0) + t.amount;
  }
  let rows = Object.entries(totals)
    .map(([category, total]) => ({ category, value: Math.round(total / Math.max(months.length, 1)) }))
    .sort((a, b) => b.value - a.value);
  if (rows.length > MAX_ROWS) {
    const rest = rows.slice(MAX_ROWS - 1).reduce((s, r) => s + r.value, 0);
    rows = [...rows.slice(0, MAX_ROWS - 1), { category: "Everything else", value: rest }];
  }
  const total = rows.reduce((s, r) => s + r.value, 0);

  if (!rows.length) return <Card className="p-5 text-[14px] text-muted">No spending to chart yet.</Card>;

  return (
    <Card className="p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.14em] text-muted">AVERAGE MONTHLY SPEND</p>
          <p className="num mt-1 text-[26px] leading-none font-semibold">{inr(total)}</p>
        </div>
        <p className="text-right text-[12px] text-subtle">
          last {months.length} month{months.length === 1 ? "" : "s"}
          <br />
          excl. loan EMIs
        </p>
      </div>
      <div className="mt-4" style={{ height: rows.length * 40 + 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={10}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="category"
              width={104}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 13, fill: "var(--color-muted)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--color-line-2)", radius: 8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { category: string; value: number };
                return (
                  <div className="rounded-xl border border-line bg-card px-3 py-2 text-[13px] shadow-lg">
                    <p className="font-semibold">{p.category}</p>
                    <p className="num text-muted">
                      {inr(p.value)}/month · {Math.round((p.value / total) * 100)}%
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]} isAnimationActive animationDuration={600}>
              {rows.map((r) => (
                <Cell key={r.category} fill="var(--color-s1)" />
              ))}
              <LabelList dataKey="value" position="right" formatter={(v: unknown) => inrCompact(Number(v))} style={{ fontSize: 12.5, fill: "var(--color-ink)", fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
