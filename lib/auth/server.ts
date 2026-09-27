import { createClient, type JwtPayload, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

let client: SupabaseClient | null | undefined;

function getSupabaseServer(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

export type AuthResult = { ok: true; claims: JwtPayload } | { ok: false; response: NextResponse };

/**
 * Verifies the Supabase access token (JWT) sent as `Authorization: Bearer <token>`.
 * Signature and expiry are checked by Supabase (locally via JWKS for asymmetric keys, otherwise by the Auth server).
 */
export async function requireUser(req: Request): Promise<AuthResult> {
  const supabase = getSupabaseServer();
  if (!supabase) return { ok: false, response: NextResponse.json({ error: "Authentication isn't configured on the server" }, { status: 503 }) };

  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, response: NextResponse.json({ error: "Please sign in to continue" }, { status: 401 }) };

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return { ok: false, response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) };
  return { ok: true, claims: data.claims };
}
