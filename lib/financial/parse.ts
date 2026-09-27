import { toTransaction, type RawTransaction } from "./categorize";
import type { ParseResult, TransactionType } from "./types";

// ---------- primitives ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parses many common bank-statement date formats. Ambiguous a/b/yyyy is read as dd/mm (Indian convention). */
export function parseDate(input: string): string | null {
  const s = (input || "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // 2026-08-01, 2026/08/01, 2026-08-01T10:00
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return validYmd(+m[1], +m[2], +m[3]);
  // 01/08/2026, 01-08-26, 1.8.2026
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
    const a = +m[1], b = +m[2], y = +m[3];
    return b > 12 ? validYmd(y, a, b) : validYmd(y, b, a);
  }
  // 01 Aug 2026, 01-Aug-26, 1 August 2026
  if ((m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]*(\d{2,4})\b/))) {
    const mon = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mon ? validYmd(+m[3], mon, +m[1]) : null;
  }
  // Aug 01, 2026
  if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mon ? validYmd(+m[3], mon, +m[2]) : null;
  }
  return null;
}

/** "₹1,80,000.00", "Rs. 1,299", "(620)", "-620", "620 Dr" → number (sign preserved; NaN when not a number). */
export function parseAmount(input: string | undefined | null): number {
  if (input == null) return NaN;
  let s = String(input).trim();
  if (!s) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(s)) negative = true;
  s = s.replace(/\b(inr|rs\.?|dr\.?|cr\.?)\b/gi, "").replace(/[₹,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = parseFloat(s);
  return negative ? -n : n;
}

// ---------- CSV ----------

function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/** RFC-4180-ish CSV splitter with quote support. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES = {
  date: ["date", "txndate", "transactiondate", "valuedate", "postingdate", "posteddate", "tranDate".toLowerCase(), "bookingdate"],
  description: ["description", "narration", "details", "particulars", "remarks", "merchant", "name", "transactiondetails", "payee", "memo", "transactiondescription"],
  amount: ["amount", "amt", "transactionamount", "value", "inr", "amountinr", "amountrs"],
  debit: ["debit", "withdrawal", "withdrawalamt", "withdrawalamount", "debitamount", "dr", "debitamt", "moneyout", "paidout"],
  credit: ["credit", "deposit", "depositamt", "depositamount", "creditamount", "cr", "creditamt", "moneyin", "paidin"],
  type: ["type", "drcr", "crdr", "transactiontype", "txntype", "debitcredit", "direction"],
};

type Field = keyof typeof HEADER_ALIASES;

function normHeader(h: string): string {
  return h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");
}

function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const normalized = headers.map(normHeader);
  (Object.keys(HEADER_ALIASES) as Field[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field];
    let idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx === -1) idx = normalized.findIndex((h) => h && aliases.some((a) => a.length > 3 && h.includes(a)));
    if (idx !== -1 && !Object.values(map).includes(idx)) map[field] = idx;
  });
  return map;
}

function inferType(typeCell: string | undefined, signedAmount: number, description: string): TransactionType {
  const t = (typeCell || "").trim().toLowerCase();
  if (/^(cr|credit|c|deposit|in|income|received)/.test(t)) return "income";
  if (/^(dr|debit|d|withdrawal|out|expense|paid)/.test(t)) return "expense";
  if (signedAmount < 0) return "expense";
  if (/salary|refund|cashback|interest\s*credit|neft\s*cr|received/i.test(description)) return "income";
  return "expense";
}

export function parseCsv(text: string, source: string): ParseResult {
  const warnings: string[] = [];
  const clean = (text || "").replace(/^﻿/, "");
  if (!clean.trim()) return { transactions: [], warnings: [`${source}: file is empty`], skipped: 0 };

  const firstLine = clean.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const rows = splitCsv(clean, detectDelimiter(firstLine));

  // Header row may not be the first row (bank exports often have preamble lines).
  let headerIdx = -1;
  let map: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const m = mapHeaders(rows[i]);
    if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined)) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      transactions: [],
      warnings: [`${source}: couldn't find date and amount columns. Expected headers like "date, description, amount, type".`],
      skipped: rows.length,
    };
  }
  if (map.description === undefined) warnings.push(`${source}: no description column found; merchants will be generic.`);

  const raws: RawTransaction[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIdx + 1)) {
    const cell = (f: Field) => (map[f] !== undefined ? (row[map[f]!] ?? "").trim() : undefined);
    const date = parseDate(cell("date") ?? "");
    const description = cell("description") || "Unknown transaction";
    let signed = NaN;
    let typeHint = cell("type");

    const debit = parseAmount(cell("debit"));
    const credit = parseAmount(cell("credit"));
    if (!isNaN(debit) && Math.abs(debit) > 0) {
      signed = -Math.abs(debit);
      typeHint = typeHint || "dr";
    } else if (!isNaN(credit) && Math.abs(credit) > 0) {
      signed = Math.abs(credit);
      typeHint = typeHint || "cr";
    } else {
      signed = parseAmount(cell("amount"));
    }

    if (!date || isNaN(signed) || signed === 0) {
      skipped++;
      continue;
    }
    raws.push({ date, description, amount: Math.abs(signed), type: inferType(typeHint, signed, description), source });
  }

  if (skipped) warnings.push(`${source}: skipped ${skipped} row${skipped === 1 ? "" : "s"} with a missing/invalid date or amount.`);
  if (!raws.length) warnings.push(`${source}: no valid transactions found.`);
  return { transactions: raws.map(toTransaction), warnings, skipped };
}

// ---------- plain text (from PDF statements) ----------

const LINE_DATE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}[\s-,]*\d{2,4})/;
const MONEY = /(?:₹|rs\.?|inr)?\s*-?\(?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\)?(?:\s*(?:cr|dr)\b)?/gi;

/** Heuristic line parser for text extracted from PDF statements. Best effort by design. */
export function parseStatementText(text: string, source: string): ParseResult {
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const raws: RawTransaction[] = [];
  let skipped = 0;
  for (const line of lines) {
    const dm = line.match(LINE_DATE);
    if (!dm) continue;
    const date = parseDate(dm[1]);
    if (!date) {
      skipped++;
      continue;
    }
    const rest = line.slice(dm[0].length).trim();
    const moneyMatches = [...rest.matchAll(MONEY)].map((m) => m[0].trim()).filter((m) => /\d/.test(m) && /[.,]|₹|rs|inr|cr|dr/i.test(m));
    if (!moneyMatches.length) {
      skipped++;
      continue;
    }
    // Typical layout: description ... amount [balance]. Use the first money-looking token after the description.
    const amountToken = moneyMatches.length >= 2 ? moneyMatches[moneyMatches.length - 2] : moneyMatches[0];
    const amount = parseAmount(amountToken);
    if (isNaN(amount) || amount === 0) {
      skipped++;
      continue;
    }
    const firstMoneyIdx = rest.indexOf(moneyMatches[0]);
    const description = (firstMoneyIdx > 0 ? rest.slice(0, firstMoneyIdx) : rest).replace(/\s+/g, " ").trim() || "Unknown transaction";
    const typeHint = /\bcr\b/i.test(amountToken) ? "cr" : /\bdr\b/i.test(amountToken) ? "dr" : undefined;
    raws.push({ date, description, amount: Math.abs(amount), type: inferType(typeHint, amount, description), source });
  }
  const warnings: string[] = [];
  if (!raws.length) warnings.push(`${source}: couldn't find transactions in this PDF. Try exporting the statement as CSV.`);
  else warnings.push(`${source}: PDF parsing is best-effort — please review imported transactions.`);
  return { transactions: raws.map(toTransaction), warnings, skipped };
}
