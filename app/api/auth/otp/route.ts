import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({ email: z.email().max(254), otp: z.string().regex(/^\d{4,8}$/) });

function otpMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Email + static OTP login. The code is compared against AUTH_STATIC_OTP (no email is sent).
 * On success the user is created if needed and a real Supabase session (JWT access + refresh token) is minted.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const staticOtp = process.env.AUTH_STATIC_OTP;
  if (!url || !anonKey || !serviceKey || !staticOtp) return NextResponse.json({ error: "Sign-in isn't configured on the server" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and code" }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  if (!otpMatches(parsed.data.otp, staticOtp)) return NextResponse.json({ error: "Incorrect code" }, { status: 401 });

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceKey, opts);

  // Silently create the account on first login (users only ever see "sign in"); an existing email is fine.
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && created.error.code !== "email_exists" && created.error.code !== "user_already_exists") {
    console.error("[auth/otp] createUser failed:", created.error.status, created.error.code, created.error.message);
    return NextResponse.json({ error: "Couldn't sign you in" }, { status: 500 });
  }

  // Mint a one-time token for this user and exchange it for a session.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) console.error("[auth/otp] generateLink failed:", link.error?.code, link.error?.message);
  if (link.error || !tokenHash) return NextResponse.json({ error: "Couldn't sign you in" }, { status: 500 });

  // Fresh per-request client so no session is shared between requests.
  const verified = await createClient(url, anonKey, opts).auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  const session = verified.data.session;
  if (verified.error || !session) console.error("[auth/otp] verifyOtp failed:", verified.error?.code, verified.error?.message);
  if (verified.error || !session) return NextResponse.json({ error: "Couldn't sign you in" }, { status: 500 });

  return NextResponse.json({ access_token: session.access_token, refresh_token: session.refresh_token });
}
