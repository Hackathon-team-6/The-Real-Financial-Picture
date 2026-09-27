"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/format";
import { parseAmount } from "@/lib/financial/parse";
import { CATEGORIES, type Transaction } from "@/lib/financial/types";
import { useFinance, type TransactionInput } from "@/lib/state/FinanceProvider";
import { Button, Sheet } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

function initialInput(tx?: Transaction): TransactionInput {
  if (!tx) return { date: today(), merchant: "", amount: 0, type: "expense", category: "auto", repeatsMonthly: false };
  return {
    date: tx.date,
    merchant: tx.merchant,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    repeatsMonthly: tx.userRecurring === "monthly" || (tx.recurring && tx.recurringFrequency === "monthly"),
  };
}

/**
 * Add a transaction by hand, or edit/delete an existing one (manual or imported).
 * Mount with a fresh `key` per open so the form starts from the right values.
 */
export function TransactionEditor({ open, onClose, transaction }: { open: boolean; onClose: () => void; transaction?: Transaction }) {
  const { addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const init = initialInput(transaction);
  const [type, setType] = useState(init.type);
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : "");
  const [merchant, setMerchant] = useState(init.merchant);
  const [date, setDate] = useState(init.date);
  const [category, setCategory] = useState<string>(init.category);
  const [repeats, setRepeats] = useState(init.repeatsMonthly);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(transaction);
  const amountN = Math.abs(parseAmount(amount));

  const save = () => {
    if (!(amountN > 0)) return setError("Enter an amount greater than zero.");
    if (!merchant.trim()) return setError("Add a name, like Rent or Swiggy.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date.");
    const input: TransactionInput = { date, merchant: merchant.trim(), amount: amountN, type, category, repeatsMonthly: repeats };
    if (transaction) updateTransaction(transaction.id, input);
    else addTransaction(input);
    onClose();
  };

  const field = "mt-1 h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-[16px] outline-none transition focus:border-ink focus:bg-card";
  const categories = type === "income" ? ["Income", "Other"] : CATEGORIES.filter((c) => c !== "Income");

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit entry" : "Add entry"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1" role="radiogroup" aria-label="Type">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => {
                setType(t);
                // A category from the other side no longer applies.
                if (category !== "auto" && (t === "income") !== (category === "Income")) setCategory("auto");
              }}
              className={cn("h-11 rounded-xl text-[14.5px] font-semibold transition", type === t ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink")}
            >
              {t === "expense" ? "Money out" : "Money in"}
            </button>
          ))}
        </div>

        <label className="block" htmlFor="tx-amount">
          <span className="text-[13px] font-medium text-muted">Amount</span>
          <div className="relative">
            <span className="num absolute top-1/2 left-4 mt-0.5 -translate-y-1/2 text-[16px] text-muted">₹</span>
            <input id="tx-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className={cn(field, "num pl-9")} autoFocus={!editing} />
          </div>
        </label>

        <label className="block" htmlFor="tx-name">
          <span className="text-[13px] font-medium text-muted">{type === "income" ? "Source" : "What was it?"}</span>
          <input
            id="tx-name"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder={type === "income" ? "Salary, freelance, rent received…" : "Rent, Swiggy, electricity…"}
            className={field}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block" htmlFor="tx-date">
            <span className="text-[13px] font-medium text-muted">Date</span>
            <input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="block" htmlFor="tx-category">
            <span className="text-[13px] font-medium text-muted">Category</span>
            <select id="tx-category" value={category} onChange={(e) => setCategory(e.target.value)} className={cn(field, "appearance-none")}>
              <option value="auto">Auto-detect</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-canvas p-3.5" htmlFor="tx-repeats">
          <input id="tx-repeats" type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-ink)]" />
          <span>
            <span className="block text-[14.5px] font-semibold">Repeats every month</span>
            <span className="block text-[12.5px] leading-relaxed text-muted">
              {type === "income" ? "Counts as expected monthly income." : "Counts as a fixed commitment, like rent or an EMI, in safe-to-spend and plans."}
            </span>
          </span>
        </label>

        {error && <p className="rounded-2xl bg-neg-bg px-4 py-3 text-[13.5px] text-neg">{error}</p>}

        <Button type="submit" className="w-full">
          {editing ? "Save changes" : "Add entry"}
        </Button>

        {editing &&
          (confirmDelete ? (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button
                type="button"
                className="bg-neg hover:bg-neg"
                onClick={() => {
                  deleteTransaction(transaction!.id);
                  onClose();
                }}
              >
                Delete
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="w-full text-neg" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Delete entry
            </Button>
          ))}
        {editing && transaction && !transaction.manual && (
          <p className="text-center text-[12px] text-subtle">Imported from {transaction.source} as “{transaction.originalDescription}”.</p>
        )}
      </form>
    </Sheet>
  );
}
