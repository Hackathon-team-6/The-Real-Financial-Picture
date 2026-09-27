"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useFinance } from "@/lib/state/FinanceProvider";
import { cn } from "@/lib/format";
import { BottomNav, Sidebar } from "./BottomNav";
import { Button } from "./ui";

/**
 * The one page frame every screen uses. Phones: a single centred column with the bottom nav.
 * Tablets: a wider column. Desktop: a fixed sidebar and the same wide content area on every page.
 */
export function AppShell({ children, requireData = true, className }: { children: ReactNode; requireData?: boolean; className?: string }) {
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
      <Sidebar />
      <div className="lg:pl-64">
        <main
          className={cn(
            "mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),12px)] pb-32 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:pt-8 lg:pb-12",
            className,
          )}
        >
          {content}
        </main>
      </div>
      <BottomNav />
    </>
  );
}

/** Consistent page title block: small context line, title, optional actions on the right. */
export function PageHeader({ eyebrow, title, actions, back }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 pt-3 pb-5 lg:pt-0 lg:pb-8">
      <div className="flex min-w-0 items-center gap-2">
        {back}
        <div className="min-w-0">
          {eyebrow && <p className="text-[14px] text-muted">{eyebrow}</p>}
          <h1 className="mt-0.5 text-[26px] leading-tight font-semibold tracking-tight text-balance lg:text-[32px]">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
