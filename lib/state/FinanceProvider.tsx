"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildDemoGoals, buildDemoTransactions, DEMO_PROFILE } from "@/data/demo-transactions";
import { makeId } from "@/lib/financial/categorize";
import { analyzeTransactions, buildSnapshot, DEFAULT_SAFETY_BUFFER, type AnalyzedData } from "@/lib/financial/forecast";
import { emojiFor } from "@/lib/financial/goals";
import { generateInsights, type Insight } from "@/lib/financial/insights";
import type { FinancialSnapshot, Goal, Profile, Transaction } from "@/lib/financial/types";

const STORAGE_KEY = "financial-xray:v1";

interface PersistedState {
  transactions: Transaction[];
  goals: Goal[];
  profile: Profile;
  source: "demo" | "upload" | null;
  files: string[];
}

const EMPTY: PersistedState = {
  transactions: [],
  goals: [],
  profile: { unallocatedSavings: 0, safetyBuffer: DEFAULT_SAFETY_BUFFER },
  source: null,
  files: [],
};

export interface NewGoalInput {
  name: string;
  targetAmount: number;
  currentSavings: number;
  targetDate?: string;
  emoji?: string;
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

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        setState({
          ...EMPTY,
          ...parsed,
          profile: { ...EMPTY.profile, ...(parsed.profile ?? {}) },
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          goals: Array.isArray(parsed.goals) ? parsed.goals : [],
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

  const analyzed = useMemo(() => analyzeTransactions(state.transactions), [state.transactions]);
  const snapshot = useMemo(() => buildSnapshot(analyzed, state.goals, state.profile), [analyzed, state.goals, state.profile]);
  const insights = useMemo(() => generateInsights(snapshot, analyzed.transactions), [snapshot, analyzed.transactions]);

  const loadDemo = useCallback(() => {
    setState({
      transactions: buildDemoTransactions(),
      goals: buildDemoGoals(),
      profile: { ...DEMO_PROFILE },
      source: "demo",
      files: ["Demo statement"],
    });
  }, []);

  const importTransactions = useCallback<FinanceContextValue["importTransactions"]>((txs, fileNames, opts) => {
    setState((s) => {
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
  }, []);

  const addGoal = useCallback((input: NewGoalInput): Goal => {
    const goal: Goal = {
      id: makeId("goal"),
      name: input.name.trim() || "Savings goal",
      emoji: input.emoji || emojiFor(input.name),
      targetAmount: Math.max(0, Math.round(input.targetAmount)),
      currentSavings: Math.max(0, Math.round(input.currentSavings)),
      targetDate: input.targetDate,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setState((s) => ({
      ...s,
      goals: [...s.goals, goal],
      // Savings put towards the goal come out of the unallocated pool so they're never double-counted.
      profile: { ...s.profile, unallocatedSavings: Math.max(0, s.profile.unallocatedSavings - goal.currentSavings) },
    }));
    return goal;
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setState((s) => {
      const goal = s.goals.find((g) => g.id === id);
      return {
        ...s,
        goals: s.goals.filter((g) => g.id !== id),
        profile: goal ? { ...s.profile, unallocatedSavings: s.profile.unallocatedSavings + goal.currentSavings } : s.profile,
      };
    });
  }, []);

  const contributeToGoal = useCallback((id: string, amount: number) => {
    if (!isFinite(amount) || amount <= 0) return;
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === id ? { ...g, currentSavings: Math.round(g.currentSavings + amount) } : g)),
    }));
  }, []);

  const updateProfile = useCallback((p: Partial<Profile>) => {
    setState((s) => ({ ...s, profile: { ...s.profile, ...p } }));
  }, []);

  const reset = useCallback(() => setState(EMPTY), []);

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
