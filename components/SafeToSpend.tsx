"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { inr } from "@/lib/format";
import type { FinancialSnapshot } from "@/lib/financial/types";

export function SafeToSpend({ snapshot }: { snapshot: FinancialSnapshot }) {
  const [open, setOpen] = useState(false);
  const s = snapshot;
  const negative = s.safeToSpend < 0;
  return (
    <section className="relative animate-rise overflow-hidden rounded-[28px] bg-ink p-6 text-white">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-lime/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-white/60">SAFE TO SPEND</p>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/70 transition hover:text-white"
            aria-expanded={open}
            aria-label="How is this calculated?"
          >
            <Info size={16} />
          </button>
        </div>
        <p className={`num mt-3 text-[46px] leading-none font-semibold ${negative ? "text-[#ff8a8f]" : "text-lime"}`}>{inr(s.safeToSpend)}</p>
        <p className="mt-2 text-[14px] text-white/60">estimated this month</p>

        {open && (
          <div className="mt-5 animate-fade space-y-1.5 border-t border-white/10 pt-4 text-[14px]">
            <Line label="Expected income" value={inr(s.monthlyIncome)} />
            <Line label="Fixed commitments" value={`−${inr(s.fixedCommitments)}`} />
            <Line label="Expected spending" value={`−${inr(s.variableSpending)}`} />
            <Line label="Safety buffer" value={`−${inr(s.safetyBuffer)}`} />
            <div className="border-t border-dashed border-white/15 pt-1.5">
              <Line label="Safe to spend" value={inr(s.safeToSpend)} bold />
            </div>
            <p className="pt-2 text-[12px] text-white/45">
              An estimate from {s.monthsAnalyzed} month{s.monthsAnalyzed === 1 ? "" : "s"} of your transactions. Goal contributions are not deducted.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-white" : "text-white/60"}>{label}</span>
      <span className={`num ${bold ? "font-semibold text-lime" : "text-white/90"}`}>{value}</span>
    </div>
  );
}
