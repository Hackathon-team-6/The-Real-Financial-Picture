"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "./ui";

const OTP_LENGTH = 6;

/**
 * Two-step email + OTP sign-in used by the upload popup and the Account page.
 * Step 1 takes the email, step 2 the code. Accounts are created silently by the server on first login.
 */
export function EmailOtpForm({
  onSuccess,
  submitLabel = "Verify & sign in",
  fieldClassName,
  autoFocusEmail = true,
}: {
  onSuccess?: () => void;
  submitLabel?: string;
  fieldClassName?: string;
  /** Off on full pages so phones don't open the keyboard on load. */
  autoFocusEmail?: boolean;
}) {
  const { verifyEmailOtp } = useAuth();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = fieldClassName ?? "mt-1 h-12 w-full rounded-2xl border border-line bg-card px-4 text-[16px] outline-none focus:border-ink";

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    setStep("otp");
  };

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.length !== OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code.`);
    setBusy(true);
    const res = await verifyEmailOtp(email.trim(), otp);
    setBusy(false);
    if (res.error) return setError(res.error);
    onSuccess?.();
  };

  const errorBox = error && <p className="rounded-2xl bg-neg-bg px-4 py-3 text-[13.5px] text-neg">{error}</p>;

  if (step === "email") {
    return (
      <form onSubmit={submitEmail} className="space-y-3">
        <label className="block">
          <span className="text-[13px] font-medium text-muted">Email</span>
          <input type="email" required autoFocus={autoFocusEmail} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
        </label>
        {errorBox}
        <Button type="submit" className="w-full" disabled={!email.trim()}>
          Continue
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitOtp} className="space-y-3">
      <p className="text-[14px] leading-relaxed text-muted">
        Enter the {OTP_LENGTH}-digit code for <span className="font-semibold text-ink">{email.trim()}</span>.
      </p>
      <label className="block">
        <span className="text-[13px] font-medium text-muted">One-time code</span>
        <input
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
          className={`${field} num text-center text-[22px] tracking-[0.5em]`}
          placeholder={"•".repeat(OTP_LENGTH)}
        />
      </label>
      {errorBox}
      <Button type="submit" className="w-full" disabled={busy || otp.length !== OTP_LENGTH}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        {submitLabel}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setOtp("");
          setError(null);
        }}
        className="flex w-full items-center justify-center gap-1.5 py-1 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> Use a different email
      </button>
    </form>
  );
}
