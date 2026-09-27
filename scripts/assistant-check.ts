import { buildDemoGoals, buildDemoTransactions, DEMO_PROFILE } from "../data/demo-transactions";
import { analyzeTransactions, buildSnapshot } from "../lib/financial/forecast";
import { localAssistant, type ChatMemory } from "../lib/ai/assistant";
const today = new Date("2026-09-27T10:00:00Z");
const data = analyzeTransactions(buildDemoTransactions(today));
const snap = buildSnapshot(data, buildDemoGoals(today), DEMO_PROFILE, today);
const goals2 = [...buildDemoGoals(today), { id: "g2", name: "X-Bike", emoji: "🏍️", targetAmount: 180000, currentSavings: 25000, targetDate: "2027-04-27", createdAt: "2026-09-27" }];
const snap2 = buildSnapshot(data, goals2, { ...DEMO_PROFILE, unallocatedSavings: 0 }, today);
let mem: ChatMemory = {};
const qs: [string, typeof snap][] = [
  ["I want to buy a bike for ₹1,80,000. Can I afford it?", snap],
  ["Can I buy an iPhone for ₹90,000?", snap],
  ["When can I afford a car?", snap],
  ["8 lakh", snap],
  ["Help me save ₹2 lakh.", snap],
  ["I want to buy a bike. Help me with the plan.", snap],
  ["I want to save ₹1 lakh for an emergency fund.", snap],
  ["What if my rent increases by ₹5,000?", snap],
  ["What if I save ₹20,000 every month?", snap],
  ["What if I reduce food spending by ₹3,000?", snap],
  ["When will I reach ₹5 lakh?", snap],
  ["Can I buy this bike without affecting my current commitments?", snap2],
  ["How long will it take me to buy this bike?", snap2],
  ["What are my subscriptions?", snap],
  ["How much can I spend?", snap],
  ["hello", snap],
];
for (const [q, s] of qs) {
  const r = localAssistant(q, s, mem, today);
  mem = r.memory;
  console.log("\n>>", q, "\n", r.text.replace(/\n\n/g, " | "), "\n   cards:", r.cards.map((c) => c.kind + (c.kind === "purchase" ? `(${c.data.item},${c.data.price},${c.data.recommendedMonths}m,${c.data.requiredMonthly},draft=${!!c.data.goalDraft})` : "")).join(","), "mem:", JSON.stringify(mem));
}
