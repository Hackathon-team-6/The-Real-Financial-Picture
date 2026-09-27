import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "user_data";

export interface RemoteRow<T> {
  data: T;
  updated_at: string;
}

export async function fetchRemote<T>(sb: SupabaseClient, userId: string): Promise<RemoteRow<T> | null> {
  const { data, error } = await sb.from(TABLE).select("data, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as RemoteRow<T> | null) ?? null;
}

export async function pushRemote<T>(sb: SupabaseClient, userId: string, payload: T, updatedAt: string): Promise<void> {
  const { error } = await sb.from(TABLE).upsert({ user_id: userId, data: payload, updated_at: updatedAt }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function deleteRemote(sb: SupabaseClient, userId: string): Promise<void> {
  const { error } = await sb.from(TABLE).delete().eq("user_id", userId);
  if (error) throw error;
}

export interface LocalCopy {
  ownerId: string | null;
  updatedAt: string | null;
  hasContent: boolean;
}

/**
 * Decides what to do when a user signs in on this device:
 * - "push": upload this device's data (cloud is empty, or this device has newer edits by the same user)
 * - "pull": replace this device's data with the cloud copy
 * - "adopt": nothing to transfer; just mark the local copy as belonging to the user
 * Data from a different account, or anonymous data, never overwrites an existing cloud copy.
 */
export function decideReconcile(local: LocalCopy, remoteUpdatedAt: string | null, userId: string): "push" | "pull" | "adopt" {
  const foreign = local.ownerId !== null && local.ownerId !== userId;
  const hasLocal = local.hasContent && !foreign;
  if (remoteUpdatedAt === null) return hasLocal ? "push" : "adopt";
  const t = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);
  if (local.ownerId === userId && hasLocal && t(local.updatedAt) > t(remoteUpdatedAt)) return "push";
  return "pull";
}
