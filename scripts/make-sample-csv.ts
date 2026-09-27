/* Writes public/sample-statement.csv from the demo generator (so the CSV upload path can be demoed). */
import { writeFileSync } from "node:fs";
import { buildDemoRaw } from "../data/demo-transactions";

const rows = buildDemoRaw(new Date()).sort((a, b) => a.date.localeCompare(b.date));
const esc = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = ["date,description,amount,type", ...rows.map((r) => [r.date, esc(r.description), r.amount, r.type === "income" ? "credit" : "debit"].join(","))].join("\n");
writeFileSync("public/sample-statement.csv", csv + "\n");
console.log(`wrote ${rows.length} rows`);
