"use client";

import { AppShell } from "@/components/AppShell";
import { Chat } from "@/components/Chat";

export default function AskPage() {
  return (
    <AppShell className="pb-0">
      <Chat />
    </AppShell>
  );
}
