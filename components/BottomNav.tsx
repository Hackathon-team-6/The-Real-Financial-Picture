"use client";

import { Cloud, CloudOff, Home, ReceiptText, Sparkles, Target, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";
import { useFinance } from "@/lib/state/FinanceProvider";

export const TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/ask", label: "Ask", icon: Sparkles },
  { href: "/activity", label: "Activity", icon: ReceiptText },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

/** Phone and tablet navigation. Hidden on desktop, where the sidebar takes over. */
export function BottomNav() {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-safe lg:hidden" aria-label="Main">
      <div className="mx-3 mb-3 flex w-full max-w-md items-stretch justify-between rounded-[26px] border border-white/10 bg-ink/95 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)] backdrop-blur-xl md:max-w-2xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[20px] text-[11px] font-semibold transition",
                active ? "bg-white/10 text-lime" : "text-white/55 hover:text-white",
              )}
            >
              <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Desktop navigation: the same four destinations plus import and account, in a fixed left rail. */
export function Sidebar() {
  const isActive = useActive();
  const { cloud } = useFinance();
  const AccountIcon = !cloud.enabled ? UserRound : cloud.user ? Cloud : CloudOff;
  const item = (active: boolean) =>
    cn(
      "flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[14.5px] font-semibold transition",
      active ? "bg-white/10 text-lime" : "text-white/60 hover:bg-white/5 hover:text-white",
    );

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink px-4 py-6 text-white lg:flex" aria-label="Main">
      <Link href="/home" className="mb-8 flex items-center gap-2.5 px-2">
        <span className="grid size-9 place-items-center rounded-xl bg-lime text-[16px] font-bold text-ink">✕</span>
        <span className="text-[16px] font-semibold tracking-tight">Financial X-Ray</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={item(active)}>
              <Icon size={19} strokeWidth={active ? 2.3 : 1.9} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-4">
        <Link href="/?import=1" className={item(false)}>
          <Upload size={18} /> Import statements
        </Link>
        <Link href="/account" aria-current={isActive("/account") ? "page" : undefined} className={item(isActive("/account"))}>
          <span className="relative">
            <AccountIcon size={18} />
            {cloud.user && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ink",
                  cloud.status === "error" ? "bg-neg" : cloud.status === "syncing" ? "bg-warn" : "bg-pos",
                )}
              />
            )}
          </span>
          <span className="min-w-0 truncate">{cloud.user?.email ?? "Account & sync"}</span>
        </Link>
      </div>
    </aside>
  );
}
