import { isEmiDescription, normalizeMerchant } from "./normalize";
import type { Transaction, TransactionType } from "./types";

let idCounter = 0;
export function makeId(prefix = "tx"): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface RawTransaction {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  source: string;
}

/** Turns a raw parsed row into the canonical Transaction model. */
export function toTransaction(raw: RawTransaction): Transaction {
  const { merchant, category, matched } = normalizeMerchant(raw.description);
  let finalCategory = category;
  const finalMerchant = merchant;

  if (raw.type === "income") {
    // Credits are income unless they look like refunds/reversals.
    finalCategory = /refund|reversal|cashback/i.test(raw.description) ? "Other" : "Income";
  } else if (category === "Income") {
    // A debit that matched an income rule (rare) – don't count it as income.
    finalCategory = "Other";
  }

  const emi = raw.type === "expense" && isEmiDescription(raw.description);
  if (emi) finalCategory = "EMI / Debt";

  return {
    id: makeId(),
    date: raw.date,
    merchant: finalMerchant,
    originalDescription: raw.description,
    amount: Math.round(Math.abs(raw.amount) * 100) / 100,
    type: raw.type,
    category: finalCategory,
    source: raw.source,
    recurring: emi, // EMIs are recurring by definition; others are decided by detectRecurring()
    recurringFrequency: emi ? "monthly" : undefined,
    confidence: matched ? 0.95 : 0.6,
  };
}
