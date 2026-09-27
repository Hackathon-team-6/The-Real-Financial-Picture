import { z } from "zod";
import { financeDataSchema } from "./schema";

/** Optional client-local date so "days remaining" follows the user's timezone, not the server's. */
const todaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

/** `count` asks Gemini for exactly that many cards (the dashboard wants a fixed number); omitted = one per finding. */
export const insightsRequestSchema = z.object({ data: financeDataSchema, today: todaySchema, count: z.number().int().min(1).max(12).optional() });

export const chatRequestSchema = z.object({
  data: financeDataSchema,
  today: todaySchema,
  insights: z.array(z.unknown()).max(20).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be from the user"),
});

/** "2026-09-27" → a Date at local noon that day; defaults to now. */
export function resolveToday(today?: string): Date {
  if (!today) return new Date();
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return isNaN(date.getTime()) ? new Date() : date;
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
