import { z } from "zod";

/** Monthly report data model. Both the JSON upload and the manual form validate through `financeDataSchema`. */

export const DEBIT_CATEGORIES = ["rent", "transport", "shopping", "groceries", "emi", "education", "loan", "utilities", "food", "insurance", "other"] as const;
export const CREDIT_CATEGORIES = ["salary", "refund", "freelance", "other"] as const;
export const INVESTMENT_CATEGORIES = ["sip", "stocks", "fd", "dividend", "redemption", "other"] as const;

export type DebitCategory = (typeof DEBIT_CATEGORIES)[number];
export type CreditCategory = (typeof CREDIT_CATEGORIES)[number];
export type InvestmentCategory = (typeof INVESTMENT_CATEGORIES)[number];

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be YYYY-MM");
const isoDate = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, "Must be a real date in YYYY-MM-DD format");
const amount = z.number().finite().positive("Must be greater than 0");

const txBase = {
  id: z.string().min(1, "Required"),
  date: isoDate,
  amount,
  description: z.string().max(200).default(""),
};

export const debitSchema = z.object({ ...txBase, type: z.literal("debit"), category: z.enum(DEBIT_CATEGORIES) }).strict();
export const creditSchema = z.object({ ...txBase, type: z.literal("credit"), category: z.enum(CREDIT_CATEGORIES) }).strict();
// `.strict()` makes `flow` forbidden on debit/credit and required here.
export const investmentSchema = z
  .object({ ...txBase, type: z.literal("investment"), flow: z.enum(["out", "in"]), category: z.enum(INVESTMENT_CATEGORIES) })
  .strict();

export const transactionSchema = z.discriminatedUnion("type", [debitSchema, creditSchema, investmentSchema]);

export const commitmentSchema = z
  .object({
    name: z.string().min(1, "Required"),
    category: z.enum(DEBIT_CATEGORIES),
    amount,
    dueDay: z.number().int().min(1).max(31),
    endDate: yearMonth.nullable(),
  })
  .strict();

export const userSchema = z
  .object({
    name: z.string().min(1, "Required"),
    currency: z.literal("INR"),
    monthlyIncome: amount,
    salaryDay: z.number().int().min(1).max(31),
  })
  .strict();

export const financeDataSchema = z
  .object({
    user: userSchema,
    period: yearMonth,
    commitments: z.array(commitmentSchema),
    transactions: z.array(transactionSchema),
  })
  .strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.transactions.forEach((t, i) => {
      if (seen.has(t.id)) ctx.addIssue({ code: "custom", path: ["transactions", i, "id"], message: `Duplicate id "${t.id}"` });
      seen.add(t.id);
    });
  });

export type FinanceData = z.infer<typeof financeDataSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type DebitTransaction = z.infer<typeof debitSchema>;
export type Commitment = z.infer<typeof commitmentSchema>;

export interface FieldError {
  path: string;
  message: string;
}

/** Flattens Zod issues into readable "transactions[3].category" style paths. */
export function formatIssues(error: z.ZodError): FieldError[] {
  return error.issues.map((i) => ({
    path: i.path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "") || "(root)",
    message: i.message,
  }));
}

/** Non-fatal problems: transactions dated outside the period. */
export function dataWarnings(data: FinanceData): string[] {
  return data.transactions
    .filter((t) => !t.date.startsWith(data.period))
    .map((t) => `Transaction ${t.id} (${t.date}) is outside the period ${data.period}`);
}

export type ParseOutcome = { ok: true; data: FinanceData; warnings: string[] } | { ok: false; errors: FieldError[] };

export function parseFinanceData(input: unknown): ParseOutcome {
  const r = financeDataSchema.safeParse(input);
  if (!r.success) return { ok: false, errors: formatIssues(r.error) };
  return { ok: true, data: r.data, warnings: dataWarnings(r.data) };
}

/** Parses raw file text; JSON syntax errors come back as a field error instead of throwing. */
export function parseFinanceJson(text: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: "(file)", message: `Not valid JSON: ${(e as Error).message}` }] };
  }
  return parseFinanceData(raw);
}
