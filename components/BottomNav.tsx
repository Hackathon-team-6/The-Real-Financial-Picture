"use client";

import { Home, ReceiptText, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/ask", label: "Ask", icon: Sparkles },
  { href: "/activity", label: "Activity", icon: ReceiptText },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-safe" aria-label="Main">
      <div className="mx-3 mb-3 flex w-full max-w-md items-stretch justify-between rounded-[26px] border border-white/10 bg-ink/95 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)] backdrop-blur-xl md:max-w-lg">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
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
