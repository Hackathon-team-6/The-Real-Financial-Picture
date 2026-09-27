/* Sanity checks for the monthly report engine (lib/report). Run: npm test */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkAffordability } from "../lib/report/affordability";
import { emi } from "../lib/report/emi";
import { detectFindings } from "../lib/report/insights";
import { computeMetrics } from "../lib/report/metrics";
import { parseFinanceData, parseFinanceJson, type FinanceData } from "../lib/report/schema";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// Pinned "today" so daysRemaining is deterministic.
const today = new Date(2026, 8, 27, 12);

function loadSample(name: string): FinanceData {
  const r = parseFinanceJson(readFileSync(join(__dirname, "..", "public", "samples", `${name}.json`), "utf8"));
  if (!r.ok) throw new Error(`${name}.json invalid: ${JSON.stringify(r.errors)}`);
  check(`${name}.json has no warnings`, r.warnings, []);
  return r.data;
}

// ---------- emi() ----------
console.log("\n# emi()");
check("zero interest = P / n", emi(12000, 0, 12), 1000);
check("₹1,00,000 @ 12% for 12 months", round2(emi(100000, 12, 12)), 8884.88);
check("₹60,000 @ 14% for 6 months", Math.round(emi(60000, 14, 6)), 10412);
check("1 month = principal + one month's interest", round2(emi(10000, 12, 1)), 10100);
check("zero months → 0", emi(10000, 14, 0), 0);

// ---------- healthy.json ----------
console.log("\n# healthy.json");
const healthy = loadSample("healthy");
const hm = computeMetrics(healthy, today);
check("totalCredit", hm.totalCredit, 60800);
check("totalDebit", hm.totalDebit, 41600);
check("investedOut / In / net", [hm.investedOut, hm.investedIn, hm.netInvested], [7000, 400, 6600]);
check("netCashFlow", hm.netCashFlow, 12600);
check("savingsRatePct", hm.savingsRatePct, 30.7);
check("totalCommitments", hm.totalCommitments, 22500);
check("emiLoadPct", hm.emiLoadPct, 10);
check("fixedVsVariable", hm.fixedVsVariable, { fixed: 22500, variable: 19100 });
check("safeToSpend (raw)", [hm.safeToSpend, hm.safeToSpendRaw], [18400, 18400]);
check("daysRemaining / daily", [hm.daysRemaining, hm.dailySafeToSpend], [4, 4600]);
check("top category", hm.categoryBreakdown[0], { category: "rent", amount: 15000, pctOfIncome: 25 });
check("top debit", hm.topDebits[0].id, "h2");
check(
  "findings",
  detectFindings(hm, healthy).map((f) => `${f.id}:${f.severity}`),
  ["good_savings:positive", "investing_consistently:positive"],
);
const hl = checkAffordability({ item: "Laptop", amount: 60000 }, healthy, hm);
check("laptop: upfront now / earliest", [hl.canPayUpfrontNow, hl.earliestUpfrontMonth], [false, "2026-12"]);
check("laptop: 6-month EMI option", hl.emiOptions.find((o) => o.tenureMonths === 6), {
  tenureMonths: 6, monthlyEmi: 10412, totalInterest: 2474, fitsSafeToSpend: true, newEmiLoadPct: 27.4, risk: "low",
});
check("laptop: commitments ending soon", hl.commitmentsEndingSoon, [{ name: "Bike EMI", endDate: "2027-01", amount: 6000 }]);
check("small purchase is affordable now", checkAffordability({ item: "Headphones", amount: 5000 }, healthy, hm).earliestUpfrontMonth, "2026-09");

// ---------- stretched.json ----------
console.log("\n# stretched.json");
const stretched = loadSample("stretched");
const sm = computeMetrics(stretched, today);
check("totalCredit", sm.totalCredit, 51200);
check("totalDebit", sm.totalDebit, 61400);
check("investedOut", sm.investedOut, 0);
check("netCashFlow", sm.netCashFlow, -10200);
check("savingsRatePct", sm.savingsRatePct, -22.8);
check("emiLoadPct", sm.emiLoadPct, 45);
check("fixedVsVariable", sm.fixedVsVariable, { fixed: 33500, variable: 27900 });
check("safeToSpend floored, raw negative", [sm.safeToSpend, sm.safeToSpendRaw], [0, -11400]);
check("dailySafeToSpend", sm.dailySafeToSpend, 0);
check("shopping share", sm.categoryBreakdown.find((c) => c.category === "shopping"), { category: "shopping", amount: 16500, pctOfIncome: 33 });
check(
  "findings",
  detectFindings(sm, stretched).map((f) => `${f.id}:${f.severity}`),
  ["emi_load_high:high", "low_savings:high", "overspent:high", "category_heavy:medium", "large_transaction:medium", "no_investments:medium"],
);
const sl = checkAffordability({ item: "Laptop", amount: 60000, emiTenures: [6, 12], annualInterestRate: 16 }, stretched, sm);
check("laptop: rate not assumed", [sl.assumedInterestRate, sl.interestRateWasAssumed], [16, false]);
check("laptop: never affordable upfront within 24 months", sl.earliestUpfrontMonth, null);
check("laptop: every EMI option is high risk", sl.emiOptions.map((o) => o.risk), ["high", "high"]);
check("laptop: ending soon", sl.commitmentsEndingSoon.map((c) => c.name), ["Phone EMI", "Bike EMI"]);

// ---------- validation ----------
console.log("\n# validation");
const bad = (patch: (d: FinanceData) => unknown) => {
  const r = parseFinanceData(patch(structuredClone(healthy)));
  return r.ok ? "ok" : r.errors.map((e) => e.path).join(", ");
};
check("flow on a debit is rejected", bad((d) => ((d.transactions[1] as Record<string, unknown>).flow = "out", d)), "transactions[1]");
check("investment without flow is rejected", bad((d) => (delete (d.transactions[2] as Record<string, unknown>).flow, d)), "transactions[2].flow");
check("wrong category for type", bad((d) => ((d.transactions[0] as Record<string, unknown>).category = "rent", d)), "transactions[0].category");
check("negative amount", bad((d) => ((d.transactions[3].amount = -5), d)), "transactions[3].amount");
check("bad period", bad((d) => ((d.period = "2026-13"), d)), "period");
check("malformed JSON", parseFinanceJson("{ not json").ok, false);
const outside = parseFinanceData({ ...healthy, transactions: [{ ...healthy.transactions[0], date: "2026-10-01" }] });
check("out-of-period date warns, doesn't reject", outside.ok && outside.warnings.length, 1);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll report checks passed");
process.exit(failures ? 1 : 0);
