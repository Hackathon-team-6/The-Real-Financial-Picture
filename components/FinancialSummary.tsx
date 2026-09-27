"use client";

import { inr } from "@/lib/format";
import type { FinancialSnapshot } from "@/lib/financial/types";
import { Card } from "./ui";

/** Income, committed and expected spending, plus a part-to-whole bar of where income goes. */
export function FinancialSummary({ snapshot }: { snapshot: FinancialSnapshot }) {
  const s = snapshot;
  const committed = s.fixedCommitments + s.variableSpending;
  const segments = [
    { key: "fixed", label: "Commitments", value: s.fixedCommitments, color: "var(--color-s1)" },
    { key: "variable", label: "Spending", value: s.variableSpending, color: "var(--color-s2)" },
    { key: "buffer", label: "Buffer", value: Math.min(s.safetyBuffer, Math.max(0, s.monthlyIncome - committed)), color: "var(--color-s4)" },
    { key: "safe", label: "Safe to spend", value: Math.max(0, s.safeToSpend), color: "var(--color-s3)" },
  ].filter((x) => x.value > 0);
  const total = Math.max(s.monthlyIncome, segments.reduce((a, b) => a + b.value, 0), 1);

  return (
    <Card className="animate-rise p-5 [animation-delay:60ms]">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Income" value={inr(s.monthlyIncome)} />
        <Stat label="Committed" value={inr(committed)} hint={`${inr(s.fixedCommitments)} fixed`} />
        <Stat label="Expected spend" value={inr(s.variableSpending)} hint="variable" />
      </div>

      <div className="mt-5">
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Where your monthly income goes">
          {segments.map((seg) => (
            <div key={seg.key} title={`${seg.label}: ${inr(seg.value)}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {segments.map((seg) => (
            <li key={seg.key} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="flex items-center gap-2 text-muted">
                <span className="size-2.5 rounded-full" style={{ background: seg.color }} />
                {seg.label}
              </span>
              <span className="num font-medium text-ink">{Math.round((seg.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] font-medium text-muted">{label}</p>
      <p className="num mt-1 truncate text-[17px] font-semibold">{value}</p>
      {hint && <p className="num truncate text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}
