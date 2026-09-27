"use client";

import { ArrowLeft, Download, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PrivacyNote } from "@/components/PrivacyNote";
import { ProcessingSteps } from "@/components/ProcessingSteps";
import { Button } from "@/components/ui";
import { fileKind, UploadBox, type UploadItem } from "@/components/UploadBox";
import { parseAmount, parseCsv, parseStatementText } from "@/lib/financial/parse";
import type { ParseResult, Transaction } from "@/lib/financial/types";
import { useFinance } from "@/lib/state/FinanceProvider";

async function parseFile(file: File): Promise<ParseResult> {
  const kind = fileKind(file);
  if (kind === "unsupported") return { transactions: [], warnings: ["Unsupported file type"], skipped: 0 };
  if (file.size === 0) return { transactions: [], warnings: ["File is empty"], skipped: 0 };
  if (kind === "csv") return parseCsv(await file.text(), file.name);

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/parse-pdf", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || !json.text) return { transactions: [], warnings: [json.error ?? "Couldn't read this PDF"], skipped: 0 };
  return parseStatementText(json.text, file.name);
}

export default function UploadPage() {
  const router = useRouter();
  const { hasData, hydrated, loadDemo, importTransactions } = useFinance();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [savings, setSavings] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(() => router.push("/home"), [router]);

  // Returning users land on Home; the import button on Home links here with ?import.
  useEffect(() => {
    if (hydrated && hasData && !processing && !/import/.test(window.location.search + window.location.hash)) router.replace("/home");
  }, [hydrated, hasData, processing, router]);

  const addFiles = (files: File[]) => {
    setError(null);
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        status: fileKind(file) === "unsupported" ? ("error" as const) : ("ready" as const),
        message: fileKind(file) === "unsupported" ? "Only CSV and PDF are supported" : undefined,
      })),
    ]);
  };

  const analyze = async () => {
    const queue = items.filter((i) => i.status !== "error" || i.message !== "Only CSV and PDF are supported");
    if (!queue.length) return;
    setBusy(true);
    setError(null);
    const all: Transaction[] = [];
    const names: string[] = [];
    for (const it of queue) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: "processing", message: undefined } : p)));
      let result: ParseResult;
      try {
        result = await parseFile(it.file);
      } catch {
        result = { transactions: [], warnings: ["Couldn't read this file"], skipped: 0 };
      }
      const ok = result.transactions.length > 0;
      if (ok) {
        all.push(...result.transactions);
        names.push(it.file.name);
      }
      setItems((prev) =>
        prev.map((p) =>
          p.id === it.id
            ? {
                ...p,
                status: ok ? "done" : "error",
                message: ok
                  ? `${result.transactions.length} transactions${result.skipped ? `, ${result.skipped} skipped` : ""}`
                  : (result.warnings[0] ?? "No transactions found").replace(`${it.file.name}: `, ""),
              }
            : p,
        ),
      );
    }
    setBusy(false);
    if (!all.length) {
      setError("We couldn't find any transactions in these files. Check the format or try the sample CSV.");
      return;
    }
    const s = parseAmount(savings);
    importTransactions(all, names, { savings: isNaN(s) ? undefined : Math.abs(s) });
    setProcessing(`${all.length} transactions from ${names.length} file${names.length === 1 ? "" : "s"}`);
  };

  const tryDemo = () => {
    loadDemo();
    setProcessing("6 months of demo transactions");
  };

  const readyCount = items.filter((i) => i.status === "ready" || i.status === "done").length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),16px)] pb-10 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:pt-8">
      {processing && <ProcessingSteps onDone={finish} summary={processing} />}

      <div className="flex h-12 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-ink text-[15px] font-bold text-lime">✕</span>
          <span className="text-[15px] font-semibold tracking-tight">Financial X-Ray</span>
        </div>
        {hydrated && hasData && (
          <Link href="/home" className="flex items-center gap-1 text-[14px] font-semibold text-muted hover:text-ink">
            <ArrowLeft size={16} /> Home
          </Link>
        )}
      </div>

      {/* Phones: one column. Desktop: the pitch and privacy on the left, the upload flow on the right. */}
      <div className="lg:mt-10 lg:grid lg:grid-cols-12 lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-8 lg:col-span-6">
          <section className="mt-8 animate-rise lg:mt-0">
            <p className="text-[12px] font-semibold tracking-[0.16em] text-muted">KNOW YOUR MONEY</p>
            <h1 className="mt-2 text-[32px] leading-[1.1] font-semibold tracking-tight text-balance lg:text-[44px]">Upload your financial documents</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Bank statements, credit cards and more. We&apos;ll turn them into a financial model that tells you what you can safely spend and which goals fit.
            </p>
          </section>
          <PrivacyNote className="mt-8 hidden lg:block" />
        </div>

        <div className="lg:col-span-6">
          <section className="mt-7 animate-rise [animation-delay:80ms] lg:mt-0">
            <UploadBox items={items} onAdd={addFiles} onRemove={(id) => setItems((p) => p.filter((i) => i.id !== id))} disabled={busy} />

            {items.length > 0 && (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-[13px] font-medium text-muted">Current savings (optional)</span>
                  <input
                    inputMode="numeric"
                    placeholder="e.g. 25,000"
                    value={savings}
                    onChange={(e) => setSavings(e.target.value)}
                    className="num mt-1 h-12 w-full rounded-2xl border border-line bg-card px-4 text-[16px] outline-none focus:border-ink"
                  />
                </label>
                <Button className="w-full" onClick={analyze} disabled={busy || readyCount === 0}>
                  {busy ? "Reading files…" : `Analyze ${readyCount} file${readyCount === 1 ? "" : "s"}`}
                </Button>
              </div>
            )}
            {error && <p className="mt-3 rounded-2xl bg-neg-bg px-4 py-3 text-[13.5px] text-neg">{error}</p>}
          </section>

          <div className="my-6 flex items-center gap-3 text-[12px] font-medium text-subtle">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <Button variant="lime" className="w-full" onClick={tryDemo} disabled={busy}>
            <Sparkles size={18} /> Try Demo Data
          </Button>
          <a href="/sample-statement.csv" download className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            <Download size={14} /> Download a sample CSV
          </a>

          <p className="mt-6 text-[12px] leading-relaxed text-subtle">
            CSV columns are detected automatically (e.g. date, description/narration, amount or debit/credit, type). PDF support is best-effort for text-based
            statements.
          </p>

          <PrivacyNote className="mt-6 lg:hidden" />
        </div>
      </div>
    </main>
  );
}
