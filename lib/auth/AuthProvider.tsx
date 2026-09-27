"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";

interface AuthContextValue {
  /** False when NEXT_PUBLIC_SUPABASE_* env vars are missing. */
  configured: boolean;
  /** True once the persisted session has been restored. */
  ready: boolean;
  user: User | null;
  session: Session | null;
  /** Verifies the email OTP (creating the account on first login) and stores the resulting session. */
  verifyEmailOtp: (email: string, otp: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Current (auto-refreshed) access token JWT, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED = "Sign-in isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const verifyEmailOtp = useCallback<AuthContextValue["verifyEmailOtp"]>(
    async (email, otp) => {
      if (!supabase) return { error: NOT_CONFIGURED };
      const res = await fetch("/api/auth/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp }) }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
      if (!res?.ok || !json.access_token || !json.refresh_token) return { error: json.error ?? "Couldn't sign you in. Try again." };
      const { error } = await supabase.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token });
      return error ? { error: error.message } : {};
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, [supabase]);

  const getAccessToken = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({ configured: !!supabase, ready, user: session?.user ?? null, session, verifyEmailOtp, signOut, getAccessToken }),
    [supabase, ready, session, verifyEmailOtp, signOut, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
