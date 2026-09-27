"use client";

import { Banknote, Car, CreditCard, Home as HomeIcon, Landmark, Repeat, Shield, Smartphone, Zap } from "lucide-react";
import { daysFromToday, formatDate, inr } from "@/lib/format";
import { upcomingDate } from "@/lib/financial/recurring";
import type { RecurringSeries } from "@/lib/financial/types";
import { Card } from "./ui";

export function iconFor(r: Pick<RecurringSeries, "merchant" | "category" | "isEmi">) {
  if (/car/i.test(r.merchant)) return Car;
  if (r.isEmi || r.category === "EMI / Debt") return Landmark;
  if (r.category === "Housing") return HomeIcon;
  if (r.category === "Insurance") return Shield;
  if (/mobile/i.test(r.merchant)) return Smartphone;
  if (r.category === "Utilities") return Zap;
  if (r.category === "Income") return Banknote;
  if (r.category === "Subscriptions") return Repeat;
  return CreditCard;
}

function dueLabel(iso: string): string {
  const d = daysFromToday(iso);
  if (d <= 0) return "due today";
  if (d === 1) return "due tomorrow";
  if (d <= 14) return `in ${d} days · ${formatDate(iso)}`;
  return formatDate(iso);
}

export function CommitmentList({
  series,
  limit,
  showFrequency,
  sortBy = "amount",
}: {
  series: RecurringSeries[];
  limit?: number;
  showFrequency?: boolean;
  sortBy?: "amount" | "date";
}) {
  const items = series
    .filter((s) => s.type === "expense")
    .map((s) => ({ ...s, nextDate: upcomingDate(s) }))
    .sort((a, b) => (sortBy === "date" ? a.nextDate.localeCompare(b.nextDate) || b.monthlyAmount - a.monthlyAmount : b.monthlyAmount - a.monthlyAmount))
    .slice(0, limit ?? Infinity);

  if (!items.length) {
    return (
      <Card className="p-5 text-[14px] text-muted">No recurring commitments detected yet. They appear once a payment shows up in at least two months.</Card>
    );
  }

  return (
    <Card className="divide-y divide-line-2 px-4">
      {items.map((r) => {
        const Icon = iconFor(r);
        return (
          <div key={r.id} className="flex items-center gap-3 py-3.5">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-line-2 text-ink">
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{r.merchant}</p>
              <p className="truncate text-[12.5px] text-muted">
                {r.isEmi ? "EMI" : r.category} · {showFrequency ? `${r.frequency}, ` : ""}
                {dueLabel(r.nextDate)}
              </p>
            </div>
            <div className="text-right">
              <p className="num text-[15px] font-semibold">{inr(r.amount)}</p>
              {r.frequency !== "monthly" && <p className="num text-[11px] text-subtle">{inr(r.monthlyAmount)}/mo</p>}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
