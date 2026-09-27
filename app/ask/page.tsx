"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Chat } from "@/components/Chat";
import { PositionCard } from "@/components/PositionCard";
import { buildPosition } from "@/lib/financial/position";
import { useFinance } from "@/lib/state/FinanceProvider";

export default function AskPage() {
  const { snapshot } = useFinance();
  const position = useMemo(() => buildPosition(snapshot), [snapshot]);
  return (
    <AppShell className="pb-0 lg:pb-0">
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="min-w-0 lg:col-span-7 xl:col-span-8">
          <Chat />
        </div>
        {/* Desktop keeps the full position in view while you ask. On phones it appears inside the answers instead. */}
        <aside className="hidden lg:sticky lg:top-8 lg:col-span-5 lg:block xl:col-span-4">
          <p className="mb-2 px-1 text-[12px] font-semibold tracking-[0.14em] text-muted">YOUR POSITION TODAY</p>
          <PositionCard position={position} />
        </aside>
      </div>
    </AppShell>
  );
}
