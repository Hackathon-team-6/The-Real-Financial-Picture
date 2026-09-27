"use client";

import { Lock } from "lucide-react";
import { EmailOtpForm } from "./EmailOtpForm";
import { Sheet } from "./ui";

/** Sign-in popup shown before analyzing uploads. Calls onSuccess once a session exists. */
export function AuthDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Sign in to continue">
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-line-2 p-3 text-[13px] leading-relaxed text-muted">
        <Lock size={16} className="mt-0.5 shrink-0 text-ink" />
        Sign in with your email to analyze your statements.
      </div>
      {/* Sheet unmounts when closed, so the form starts fresh each time. */}
      <EmailOtpForm onSuccess={onSuccess} submitLabel="Verify & analyze" />
    </Sheet>
  );
}
