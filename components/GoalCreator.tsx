"use client";

import { useMemo, useState } from "react";
import { inr, formatMonthYear } from "@/lib/format";
import { calculateGoalRequirement, classifyFeasibility, emojiFor } from "@/lib/financial/goals";
import { parseAmount } from "@/lib/financial/parse";
import { addMonths } from "@/lib/financial/recurring";
import type { FinancialSnapshot } from "@/lib/financial/types";
import { useFinance, type NewGoalInput } from "@/lib/state/FinanceProvider";
import { FeasibilityExplainer } from "./FeasibilityExplainer";
import { Button, Row, Sheet } from "./ui";

function monthInputValue(iso: string): string {
  return iso.slice(0, 7);
}

export function GoalCreator({
  open,
  onClose,
  snapshot,
  initial,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: FinancialSnapshot;
  initial?: Partial<NewGoalInput>;
  onCreated?: () => void;
}) {
  const { addGoal } = useFinance();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial?.targetAmount ? String(initial.targetAmount) : "");
  const [month, setMonth] = useState(monthInputValue(initial?.targetDate ?? addMonths(todayIso, 7)));
  const [saved, setSaved] = useState(String(initial?.currentSavings ?? snapshot.unallocatedSavings ?? 0));

  const targetN = parseAmount(target);
  const savedN = Math.max(0, parseAmount(saved) || 0);
  const targetDate = month ? `${month}-${todayIso.slice(8, 10) > "28" ? "28" : todayIso.slice(8, 10)}` : undefined;
  const valid = name.trim().length > 0 && targetN > 0 && !!month;

  const preview = useMemo(() => {
    if (!(targetN > 0)) return null;
    const req = calculateGoalRequirement(targetN, savedN, targetDate);
    const available = snapshot.availableForNewGoals;
    return { ...req, available, flexibility: available - req.requiredMonthly, feasibility: classifyFeasibility(req.requiredMonthly, available) };
  }, [targetN, savedN, targetDate, snapshot.availableForNewGoals]);

  const submit = () => {
    if (!valid) return;
    addGoal({ name: name.trim(), targetAmount: targetN, currentSavings: Math.min(savedN, targetN), targetDate, emoji: emojiFor(name) });
    onCreated?.();
    onClose();
  };

  const field = "num mt-1 h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-[16px] outline-none transition focus:border-ink focus:bg-card";

  return (
    <Sheet open={open} onClose={onClose} title="New goal">
      <div className="space-y-4">
        <label className="block">
          <span className="text-[13px] font-medium text-muted">Goal name</span>
          <div className="relative">
            <span className="absolute top-1/2 left-4 mt-0.5 -translate-y-1/2 text-xl">{emojiFor(name || "")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="X-Bike" className={`${field} pl-12`} autoFocus />
          </div>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] font-medium text-muted">Target amount</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" placeholder="1,80,000" className={field} />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-muted">Target date</span>
            <input type="month" value={month} min={monthInputValue(addMonths(todayIso, 1))} onChange={(e) => setMonth(e.target.value)} className={field} />
          </label>
        </div>
        <label className="block">
          <span className="text-[13px] font-medium text-muted">Current savings for this goal</span>
          <input value={saved} onChange={(e) => setSaved(e.target.value)} inputMode="numeric" placeholder="0" className={field} />
          {snapshot.unallocatedSavings > 0 && <span className="mt-1 block text-[12px] text-subtle">You have {inr(snapshot.unallocatedSavings)} of unallocated savings.</span>}
        </label>

        {preview && (
          <div className="animate-fade rounded-3xl bg-canvas p-4">
            <Row label="Target" value={inr(targetN)} />
            <Row label="Current savings" value={inr(Math.min(savedN, targetN))} />
            <Row label="Remaining" value={inr(preview.remaining)} />
            <Row label="Months remaining" value={`${preview.monthsRemaining} (${formatMonthYear(targetDate)})`} />
            <div className="mt-1 border-t border-line pt-1">
              <Row label="Required / month" value={inr(preview.requiredMonthly)} strong />
            </div>
            <FeasibilityExplainer required={preview.requiredMonthly} available={preview.available} feasibility={preview.feasibility} remaining={preview.remaining} />
          </div>
        )}

        <Button className="w-full" onClick={submit} disabled={!valid}>
          Create goal
        </Button>
      </div>
    </Sheet>
  );
}
