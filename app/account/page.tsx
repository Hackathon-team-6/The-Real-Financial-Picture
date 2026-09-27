"use client";

import { ArrowLeft, CheckCircle2, Cloud, CloudOff, Loader2, LogOut, Mail, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmailOtpForm } from "@/components/EmailOtpForm";
import { PrivacyNote } from "@/components/PrivacyNote";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/format";
import { useFinance, type SyncStatus } from "@/lib/state/FinanceProvider";

const STATUS: Record<SyncStatus, { label: string; cls: string }> = {
  local: { label: "On this device only", cls: "bg-line-2 text-muted" },
  syncing: { label: "Syncing…", cls: "bg-warn-bg text-warn" },
  synced: { label: "Synced", cls: "bg-pos-bg text-pos" },
  error: { label: "Sync failed", cls: "bg-neg-bg text-neg" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function AccountPage() {
  const { cloud, hasData } = useFinance();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const field = "mt-1 h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-[16px] outline-none transition focus:border-ink focus:bg-card";

  const status = STATUS[cloud.status];

  return (
    <AppShell requireData={false}>
      <PageHeader
        eyebrow="Sign in & sync"
        title="Account"
        back={
          <Link href="/home" className="grid size-10 place-items-center rounded-full hover:bg-line-2 lg:hidden" aria-label="Back to Home">
            <ArrowLeft size={20} />
          </Link>
        }
      />
      <div className="lg:max-w-xl">
        {!cloud.enabled ? (
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <CloudOff size={18} className="text-muted" />
              <h2 className="text-[16px] font-semibold tracking-tight">Cloud sync isn&apos;t set up</h2>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Your data is saved in this browser only. To enable sign-in and sync across devices, add{" "}
              <code className="rounded bg-line-2 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-line-2 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see the README).
            </p>
          </Card>
        ) : cloud.user ? (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-ink text-lime">
                  <Cloud size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-muted">Signed in as</p>
                  <p className="truncate text-[16px] font-semibold">{cloud.user.email ?? "Your account"}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-canvas p-3">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", status.cls)}>
                  {cloud.status === "syncing" ? <Loader2 size={12} className="animate-spin" /> : cloud.status === "synced" ? <CheckCircle2 size={12} /> : null}
                  {status.label}
                </span>
                <span className="text-[12.5px] text-muted">{cloud.status === "synced" && cloud.lastSyncedAt ? timeAgo(cloud.lastSyncedAt) : ""}</span>
              </div>
              {(cloud.error || message) && <p className="mt-2 text-[13px] text-neg">{cloud.error ?? message}</p>}
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Your transactions, goals and savings sync to your account. Sign in on another device with the same email to see them there.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => cloud.syncNow()} disabled={cloud.status === "syncing"}>
                  <RefreshCw size={16} /> Sync now
                </Button>
                <Button variant="secondary" onClick={() => cloud.signOut()}>
                  <LogOut size={16} /> Sign out
                </Button>
              </div>
              <p className="mt-2 text-[12px] text-subtle">Signing out removes your data from this device. It stays in your account.</p>
            </Card>

            <Card className="p-5">
              <h2 className="text-[15px] font-semibold tracking-tight">Delete synced data</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Permanently removes your financial data from the cloud and signs you out on this device.
              </p>
              {confirmDelete ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-neg hover:bg-neg"
                    onClick={async () => {
                      const res = await cloud.deleteCloudData();
                      if (res.error) setMessage(res.error);
                      setConfirmDelete(false);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" className="mt-2 w-full text-neg" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={16} /> Delete my synced data
                </Button>
              )}
            </Card>
          </div>
        ) : (
          <Card className="p-5">
            <div className="grid size-12 place-items-center rounded-2xl bg-ink text-lime">
              <Mail size={22} />
            </div>
            <h2 className="mt-4 text-[20px] font-semibold tracking-tight">Sign in to sync</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              Keep your financial picture across devices. No password: sign in with your email and a one-time code.
              {hasData && " If your account already has data, it replaces what's on this device; otherwise this device's data is saved to your account."}
            </p>

            <div className="mt-4">
              <EmailOtpForm fieldClassName={field} autoFocusEmail={false} />
            </div>
          </Card>
        )}
        <PrivacyNote className="mt-4" />
      </div>
    </AppShell>
  );
}
