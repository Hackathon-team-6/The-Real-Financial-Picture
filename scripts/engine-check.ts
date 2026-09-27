/* Sanity checks for the deterministic financial engine. Run: npm test */
import { buildDemoGoals, buildDemoTransactions, DEMO_PROFILE } from "../data/demo-transactions";
import { analyzeTransactions, buildSnapshot } from "../lib/financial/forecast";
import { generateInsights } from "../lib/financial/insights";
import { parseCsv } from "../lib/financial/parse";
import { simulatePurchase, simulateScenario } from "../lib/financial/simulator";
import { normalizeMerchant } from "../lib/financial/normalize";
import { decideReconcile } from "../lib/state/cloud";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}

const today = new Date("2026-09-27T10:00:00Z");
const data = analyzeTransactions(buildDemoTransactions(today));
const snap = buildSnapshot(data, buildDemoGoals(today), DEMO_PROFILE, today);

check("income", snap.monthlyIncome, 73000);
check("fixed", snap.fixedCommitments, 23634);
check("variable", snap.variableSpending, 17550);
check("safe to spend", snap.safeToSpend, 21816);
check("surplus", snap.monthlySurplus, 31816);
check("available for new goals", snap.availableForNewGoals, 26816);
check("recurring merchants", snap.recurring.map((r) => r.merchant).sort(), ["Car EMI", "Claude", "Mobile", "Personal Loan", "Salary", "Xbox"]);
check("claude amount", snap.recurring.find((r) => r.merchant === "Claude")?.monthlyAmount, 2400);

const bike = simulatePurchase(snap, { price: 180000, item: "bike" }, today);
check("bike months", bike.recommendedMonths, 7);
check("bike required", bike.requiredMonthly, 22143);
check("bike remaining", bike.remaining, 155000);
check("bike flexibility", bike.flexibility, 4673);

// Same bike as an existing goal (demo path: create goal first, then ask)
const goals = [...buildDemoGoals(today), { id: "g2", name: "X-Bike", emoji: "🏍️", targetAmount: 180000, currentSavings: 25000, targetDate: "2027-04-27", createdAt: "2026-09-27" }];
const snap2 = buildSnapshot(data, goals, { ...DEMO_PROFILE, unallocatedSavings: 0 }, today);
const bikeGoal = snap2.goals[1];
check("goal required", bikeGoal.requiredMonthly, 22143);
check("goal feasibility", bikeGoal.feasibility, "comfortable");
const bike2 = simulatePurchase(snap2, { price: 180000, item: "bike", goalId: "g2" }, today);
check("existing-goal sim required", bike2.requiredMonthly, 22143);
check("existing-goal sim flexibility", bike2.flexibility, 4673);

const sc = simulateScenario(snap, { fixedDelta: 5000, label: "rent" }, today);
check("scenario safe", sc.after.safeToSpend, 16816);

for (const d of ["AMAZON PAY INDIA", "AMAZON.IN", "AMZN MKTPLACE", "AMAZON"]) check(`normalize ${d}`, normalizeMerchant(d).merchant, "Amazon");

const csv = `date,description,amount,type
2026-08-01,SALARY CREDIT,73000,credit
2026-08-03,AMAZON,1299,debit
bad-date,SWIGGY,100,debit
2026-08-05,CLAUDE AI,2400,debit
2026-08-10,SWIGGY,,debit`;
const parsed = parseCsv(csv, "test.csv");
check("csv parsed", parsed.transactions.length, 3);
check("csv skipped", parsed.skipped, 2);
const alt = parseCsv(`Txn Date;Narration;Withdrawal Amt.;Deposit Amt.\n01/08/2026;UPI-UBER;340.00;\n02/08/2026;SAL CREDIT;;"73,000.00"`, "alt.csv");
check("alt csv", alt.transactions.map((t) => [t.date, t.merchant, t.type, t.amount]), [["2026-08-01", "Uber", "expense", 340], ["2026-08-02", "Salary", "income", 73000]]);
check("empty csv", parseCsv("", "e.csv").transactions.length, 0);

// Cloud sync decisions
const U = "user-a";
check("sync: first sign-in uploads local data", decideReconcile({ ownerId: null, updatedAt: "2026-09-27T10:00:00Z", hasContent: true }, null, U), "push");
check("sync: empty device, empty cloud", decideReconcile({ ownerId: null, updatedAt: null, hasContent: false }, null, U), "adopt");
check("sync: anonymous local never overwrites cloud", decideReconcile({ ownerId: null, updatedAt: "2026-09-28T10:00:00Z", hasContent: true }, "2026-09-27T10:00:00+00:00", U), "pull");
check("sync: newer local edits by same user win", decideReconcile({ ownerId: U, updatedAt: "2026-09-28T10:00:00.000Z", hasContent: true }, "2026-09-27T10:00:00+00:00", U), "push");
check("sync: newer cloud copy wins", decideReconcile({ ownerId: U, updatedAt: "2026-09-26T10:00:00.000Z", hasContent: true }, "2026-09-27T10:00:00+00:00", U), "pull");
check("sync: other account's data is not uploaded", decideReconcile({ ownerId: "user-b", updatedAt: "2026-09-28T10:00:00Z", hasContent: true }, null, U), "adopt");

console.log("\nInsights:");
for (const i of generateInsights(snap, data.transactions)) console.log(" -", i.title, "|", i.detail);
if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll engine checks passed");
