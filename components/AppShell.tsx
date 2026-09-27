"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useFinance } from "@/lib/state/FinanceProvider";
import { cn } from "@/lib/format";
import { BottomNav } from "./BottomNav";
import { Button } from "./ui";

/** Mobile-first page frame: centred column, bottom nav, and a data/hydration guard. */
export function AppShell({ children, wide, requireData = true, className }: { children: ReactNode; wide?: boolean; requireData?: boolean; className?: string }) {
  const { hydrated, hasData, loadDemo } = useFinance();

  let content = children;
  if (!hydrated) {
    content = (
      <div className="space-y-4 pt-6">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-line" />
        <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-line" />
        <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-line" />
      </div>
    );
  } else if (requireData && !hasData) {
    content = (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <div className="mb-5 grid size-16 place-items-center rounded-3xl bg-ink text-lime">
          <Upload size={26} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">No financial data yet</h1>
        <p className="mt-2 max-w-xs text-[15px] text-muted">Upload a bank statement or try the demo to see your financial picture.</p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          <Link href="/?import=1" className="contents">
            <Button className="w-full">Upload statement</Button>
          </Link>
          <Button variant="secondary" className="w-full" onClick={loadDemo}>
            Try demo data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className={cn("mx-auto w-full px-4 pt-[max(env(safe-area-inset-top),12px)] pb-32", wide ? "max-w-md md:max-w-3xl" : "max-w-md md:max-w-xl", className)}>
        {content}
      </main>
      <BottomNav />
    </>
  );
}
