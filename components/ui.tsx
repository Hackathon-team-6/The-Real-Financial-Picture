"use client";

import { X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { Feasibility } from "@/lib/financial/types";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-card", className)}>{children}</div>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between px-1">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "lime";

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-ink text-white hover:bg-ink-2",
    secondary: "bg-card text-ink border border-line hover:bg-line-2",
    ghost: "text-ink hover:bg-line-2",
    lime: "bg-lime text-ink hover:brightness-95",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        styles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, className, tone = "ink" }: { value: number; className?: string; tone?: "ink" | "lime" | "pos" | "warn" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  const bar = { ink: "bg-ink", lime: "bg-lime", pos: "bg-pos", warn: "bg-warn" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-line-2", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const FEASIBILITY: Record<Feasibility, { label: string; cls: string }> = {
  comfortable: { label: "On track", cls: "bg-pos-bg text-pos" },
  tight: { label: "Tight", cls: "bg-warn-bg text-warn" },
  stretch: { label: "Stretch", cls: "bg-neg-bg text-neg" },
  "no-surplus": { label: "No surplus", cls: "bg-neg-bg text-neg" },
};

export function FeasibilityBadge({ value }: { value: Feasibility }) {
  const f = FEASIBILITY[value];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", f.cls)}>{f.label}</span>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-md animate-sheet overflow-y-auto rounded-t-[28px] bg-card pb-safe shadow-2xl sm:animate-rise sm:rounded-[28px]">
        <div className="sticky top-0 z-10 bg-card px-5 pt-3 pb-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <button onClick={onClose} className="grid size-10 place-items-center rounded-full bg-line-2 text-muted transition hover:text-ink" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: "pos" | "neg" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className={cn("text-[14px]", strong ? "font-semibold text-ink" : "text-muted")}>{label}</span>
      <span
        className={cn(
          "num text-[15px]",
          strong ? "font-semibold" : "font-medium",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </span>
    </div>
  );
}
