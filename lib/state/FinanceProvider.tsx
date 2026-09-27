"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDemoGoals, buildDemoTransactions, DEMO_PROFILE } from "@/data/demo-transactions";
import { makeId } from "@/lib/financial/categorize";
import { analyzeTransactions, buildSnapshot, DEFAULT_SAFETY_BUFFER, type AnalyzedData } from "@/lib/financial/forecast";
import { emojiFor } from "@/lib/financial/goals";
import { generateInsights, type Insight } from "@/lib/financial/insights";
import type { FinancialSnapshot, Goal, Profile, Transaction } from "@/lib/financial/types";
import { cloudEnabled, getSupabase } from "@/lib/supabase/client";
import { decideReconcile, deleteRemote, fetchRemote, pushRemote } from "./cloud";

const STORAGE_KEY = "financial-xray:v1";
const CHAT_KEY = "financial-xray:chat";
const PUSH_DEBOUNCE_MS = 1200;

/** What gets saved (locally, and to the cloud when signed in). */
interface FinanceData {
  transactions: Transaction[];
  goals: Goal[];
  profile: Profile;
  source: "demo" | "upload" | null;
  files: string[];
}

interface PersistedState extends FinanceData {
  /** When the data last changed on this device (ISO). Used for last-write-wins sync. */
  updatedAt: string | null;
  /** The signed-in user this local copy belongs to, if any. */
  ownerId: string | null;
}

const EMPTY: PersistedState = {
  transactions: [],
  goals: [],
  profile: { unallocatedSavings: 0, safetyBuffer: DEFAULT_SAFETY_BUFFER },
  source: null,
  files: [],
  updatedAt: null,
  ownerId: null,
};

/** Defensive parse of stored/remote data so malformed JSON can never crash the app. */
function sanitize(raw: unknown): FinanceData {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<FinanceData>;
  return {
    transactions: Array.isArray(p.transactions) ? p.transactions : [],
    goals: Array.isArray(p.goals) ? p.goals : [],
    profile: { ...EMPTY.profile, ...(p.profile && typeof p.profile === "object" ? p.profile : {}) },
    source: p.source === "demo" || p.source === "upload" ? p.source : null,
    files: Array.isArray(p.files) ? p.files : [],
  };
}

function payloadOf(s: PersistedState): FinanceData {
  return { transactions: s.transactions, goals: s.goals, profile: s.profile, source: s.source, files: s.files };
}

function hasContent(s: FinanceData): boolean {
  return s.transactions.length > 0 || s.goals.length > 0;
}

export interface NewGoalInput {
  name: string;
  targetAmount: number;
  currentSavings: number;
  targetDate?: string;
  emoji?: string;
}

export type SyncStatus = "local" | "syncing" | "synced" | "error";

export interface CloudState {
  enabled: boolean;
  user: { id: string; email: string | null } | null;
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  signOut: () => Promise<void>;
  deleteCloudData: () => Promise<{ error?: string }>;
  syncNow: () => Promise<void>;
}

interface FinanceContextValue {
  hydrated: boolean;
  hasData: boolean;
  source: PersistedState["source"];
  files: string[];
  transactions: Transaction[];
  analyzed: AnalyzedData;
  snapshot: FinancialSnapshot;
  insights: Insight[];
  goals: Goal[];
  profile: Profile;
  cloud: CloudState;
  loadDemo: () => void;
  importTransactions: (txs: Transaction[], fileNames: string[], opts?: { replace?: boolean; savings?: number }) => void;
  addGoal: (input: NewGoalInput) => Goal;
  deleteGoal: (id: string) => void;
  contributeToGoal: (id: string, amount: number) => void;
  updateProfile: (p: Partial<Profile>) => void;
  reset: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

function dedupe(txs: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  return txs.filter((t) => {
    const k = `${t.date}|${t.amount}|${t.type}|${t.originalDescription.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return "Something went wrong";
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);


export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // ----- cloud sync state -----
  const [user, setUser] = useState<CloudState["user"]>(null);
  const [status, setStatus] = useState<SyncStatus>("local");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** updatedAt value the cloud is known to hold; a differing local value means there's something to push. */
  const syncedVersion = useRef<string | null>(null);
  /** User id whose initial reconcile has completed; pushes wait until then. */
  const reconciledFor = useRef<string | null>(null);

  /** Applies a change and stamps it so sync knows the local copy is newer. */
  const mutate = useCallback((fn: (s: PersistedState) => PersistedState) => {
    setState((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        setState({
          ...sanitize(parsed),
          updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
          ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : null,
        });
      }
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked — the app keeps working in memory.
    }
  }, [state, hydrated]);

  // ----- auth session -----
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const toUser = (u: { id: string; email?: string | null } | null | undefined) => (u ? { id: u.id, email: u.email ?? null } : null);
    sb.auth.getSession().then(({ data }) => setUser(toUser(data.session?.user)));
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => {
        const next = toUser(session?.user);
        return prev?.id === next?.id ? prev : next;
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /** Pull-or-push on sign-in: the cloud copy wins unless this device holds newer edits by the same user. */
  const reconcile = useCallback(async (userId: string) => {
    const sb = getSupabase();
    if (!sb) return;
    setStatus("syncing");
    setSyncError(null);
    try {
      const remote = await fetchRemote<FinanceData>(sb, userId);
      let local = stateRef.current;
      const action = decideReconcile({ ownerId: local.ownerId, updatedAt: local.updatedAt, hasContent: hasContent(local) }, remote?.updated_at ?? null, userId);
      // Another account's data on this device is never uploaded or kept.
      if (local.ownerId && local.ownerId !== userId) local = { ...EMPTY };

      if (action === "push") {
        const version = local.updatedAt ?? new Date().toISOString();
        await pushRemote(sb, userId, payloadOf(local), version);
        syncedVersion.current = version;
        setState({ ...local, ownerId: userId, updatedAt: version });
      } else if (action === "pull" && remote) {
        const next: PersistedState = { ...sanitize(remote.data), ownerId: userId, updatedAt: remote.updated_at };
        syncedVersion.current = next.updatedAt;
        setState(next);
      } else {
        syncedVersion.current = local.updatedAt;
        setState({ ...local, ownerId: userId });
      }
      reconciledFor.current = userId;
      setStatus("synced");
      setLastSyncedAt(new Date().toISOString());
    } catch (e) {
      setStatus("error");
      setSyncError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !user) {
      reconciledFor.current = null;
      if (!user) setStatus("local");
      return;
    }
    if (reconciledFor.current !== user.id) void reconcile(user.id);
  }, [hydrated, user, reconcile]);

  // Push local changes (debounced) once the initial reconcile is done.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user || reconciledFor.current !== user.id) return;
    if (!state.updatedAt || state.updatedAt === syncedVersion.current) return;
    const version = state.updatedAt;
    const payload = payloadOf(state);
    setStatus("syncing");
    const t = setTimeout(async () => {
      try {
        await pushRemote(sb, user.id, payload, version);
        syncedVersion.current = version;
        if (stateRef.current.ownerId !== user.id) setState((s) => ({ ...s, ownerId: user.id }));
        setStatus("synced");
        setSyncError(null);
        setLastSyncedAt(new Date().toISOString());
      } catch (e) {
        setStatus("error");
        setSyncError(errorMessage(e));
      }
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, user]);

  // Pick up changes made on another device when the user comes back to this tab.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || reconciledFor.current !== user.id) return;
      if (stateRef.current.updatedAt !== syncedVersion.current) return; // local edits pending; the push will win
      try {
        const remote = await fetchRemote<FinanceData>(sb, user.id);
        if (remote && time(remote.updated_at) > time(stateRef.current.updatedAt)) {
          syncedVersion.current = remote.updated_at;
          setState({ ...sanitize(remote.data), ownerId: user.id, updatedAt: remote.updated_at });
          setLastSyncedAt(new Date().toISOString());
        }
      } catch {
        // Offline or transient: the next change or visit retries.
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user]);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    // Signing out removes the data from this device; it stays in the account.
    reconciledFor.current = null;
    syncedVersion.current = null;
    setUser(null);
    setState(EMPTY);
    setLastSyncedAt(null);
    try {
      sessionStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const deleteCloudData = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return { error: "Not signed in" };
    try {
      await deleteRemote(sb, user.id);
      await signOut();
      return {};
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [user, signOut]);

  const syncNow = useCallback(async () => {
    if (user) {
      reconciledFor.current = null;
      await reconcile(user.id);
    }
  }, [user, reconcile]);

  // ----- derived model -----
  const analyzed = useMemo(() => analyzeTransactions(state.transactions), [state.transactions]);
  const snapshot = useMemo(() => buildSnapshot(analyzed, state.goals, state.profile), [analyzed, state.goals, state.profile]);
  const insights = useMemo(() => generateInsights(snapshot, analyzed.transactions), [snapshot, analyzed.transactions]);

  // ----- actions -----
  const loadDemo = useCallback(() => {
    mutate((s) => ({
      ...s,
      transactions: buildDemoTransactions(),
      goals: buildDemoGoals(),
      profile: { ...DEMO_PROFILE },
      source: "demo",
      files: ["Demo statement"],
    }));
  }, [mutate]);

  const importTransactions = useCallback<FinanceContextValue["importTransactions"]>(
    (txs, fileNames, opts) => {
      mutate((s) => {
        const base = opts?.replace || s.source === "demo" ? [] : s.transactions;
        return {
          ...s,
          transactions: dedupe([...base, ...txs]),
          goals: s.source === "demo" && opts?.replace !== false ? [] : s.goals,
          profile: opts?.savings !== undefined ? { ...s.profile, unallocatedSavings: opts.savings } : s.source === "demo" ? { ...EMPTY.profile } : s.profile,
          source: "upload",
          files: [...(s.source === "demo" ? [] : s.files), ...fileNames],
        };
      });
    },
    [mutate],
  );

  const addGoal = useCallback(
    (input: NewGoalInput): Goal => {
      const goal: Goal = {
        id: makeId("goal"),
        name: input.name.trim() || "Savings goal",
        emoji: input.emoji || emojiFor(input.name),
        targetAmount: Math.max(0, Math.round(input.targetAmount)),
        currentSavings: Math.max(0, Math.round(input.currentSavings)),
        targetDate: input.targetDate,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      mutate((s) => ({
        ...s,
        goals: [...s.goals, goal],
        // Savings put towards the goal come out of the unallocated pool so they're never double-counted.
        profile: { ...s.profile, unallocatedSavings: Math.max(0, s.profile.unallocatedSavings - goal.currentSavings) },
      }));
      return goal;
    },
    [mutate],
  );

  const deleteGoal = useCallback(
    (id: string) => {
      mutate((s) => {
        const goal = s.goals.find((g) => g.id === id);
        return {
          ...s,
          goals: s.goals.filter((g) => g.id !== id),
          profile: goal ? { ...s.profile, unallocatedSavings: s.profile.unallocatedSavings + goal.currentSavings } : s.profile,
        };
      });
    },
    [mutate],
  );

  const contributeToGoal = useCallback(
    (id: string, amount: number) => {
      if (!isFinite(amount) || amount <= 0) return;
      mutate((s) => ({
        ...s,
        goals: s.goals.map((g) => (g.id === id ? { ...g, currentSavings: Math.round(g.currentSavings + amount) } : g)),
      }));
    },
    [mutate],
  );

  const updateProfile = useCallback(
    (p: Partial<Profile>) => {
      mutate((s) => ({ ...s, profile: { ...s.profile, ...p } }));
    },
    [mutate],
  );

  const reset = useCallback(() => mutate((s) => ({ ...EMPTY, ownerId: s.ownerId })), [mutate]);

  const cloud: CloudState = {
    enabled: cloudEnabled,
    user,
    status,
    lastSyncedAt,
    error: syncError,
    signOut,
    deleteCloudData,
    syncNow,
  };

  const value: FinanceContextValue = {
    hydrated,
    hasData: state.transactions.length > 0,
    source: state.source,
    files: state.files,
    transactions: analyzed.transactions,
    analyzed,
    snapshot,
    insights,
    goals: state.goals,
    profile: state.profile,
    cloud,
    loadDemo,
    importTransactions,
    addGoal,
    deleteGoal,
    contributeToGoal,
    updateProfile,
    reset,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}
