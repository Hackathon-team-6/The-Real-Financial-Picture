"use client";

import { ArrowLeft, ArrowUp, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { localAssistant, STARTER_PROMPTS, type AssistantReply, type ChatMemory } from "@/lib/ai/assistant";
import type { Card as CardData } from "@/lib/ai/tools";
import type { GoalDraft } from "@/lib/financial/simulator";
import { cn } from "@/lib/format";
import { useFinance } from "@/lib/state/FinanceProvider";
import { ChatCard } from "./ChatCards";
import { useSpeechRecognition, VoiceButton } from "./VoiceButton";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: CardData[];
  suggestions?: string[];
  error?: boolean;
}

const SESSION_KEY = "financial-xray:chat";

function draftKey(d: GoalDraft) {
  return `${d.name}|${d.targetAmount}`;
}

function loadSession(): { messages: Message[]; memory: ChatMemory; created: string[] } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { messages: [], memory: {}, created: [] };
}

export function Chat() {
  const { snapshot, addGoal } = useFinance();
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<ChatMemory>({});
  const [created, setCreated] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const s = loadSession();
    setMessages(s.messages);
    setMemory(s.memory);
    setCreated(s.created);
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages: messages.slice(-30), memory, created }));
    } catch {
      /* ignore */
    }
  }, [messages, memory, created]);

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const say = useCallback(
    (text: string) => {
      if (!speak || !ttsSupported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/₹/g, "rupees ").replace(/\n+/g, " "));
      u.lang = "en-IN";
      u.rate = 1.03;
      window.speechSynthesis.speak(u);
    },
    [speak, ttsSupported],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;
      const userMsg: Message = { id: `u${Date.now()}`, role: "user", text };
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setLoading(true);
      let reply: AssistantReply;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, snapshot, memory, history }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        reply = (await res.json()) as AssistantReply;
      } catch {
        // Server unreachable (offline, static hosting): the rule-based assistant runs on the same engine in the browser.
        reply = localAssistant(text, snapshot, memory);
      }
      try {
        setMemory(reply.memory ?? {});
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", text: reply.text, cards: reply.cards, suggestions: reply.suggestions }]);
        say(reply.text);
      } catch {
        setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", text: "Sorry — something went wrong. Please try again.", error: true }]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, snapshot, memory, say],
  );

  const voice = useSpeechRecognition((t) => send(t));

  const createGoal = (draft: GoalDraft) => {
    addGoal({ name: draft.name, targetAmount: draft.targetAmount, currentSavings: draft.currentSavings, targetDate: draft.targetDate, emoji: draft.emoji });
    setCreated((c) => [...c, draftKey(draft)]);
    setMessages((m) => [
      ...m,
      { id: `c${Date.now()}`, role: "assistant", text: `Done! ${draft.emoji} ${draft.name} is now on your Home screen and Goals tab. I'll factor it into future answers.` },
    ]);
  };

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-180px)] flex-col">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-2 bg-canvas/85 px-4 pt-2 pb-3 backdrop-blur-xl">
        <Link href="/home" className="grid size-10 place-items-center rounded-full hover:bg-line-2" aria-label="Back to Home">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <p className="text-[16px] font-semibold tracking-tight">Financial X-Ray ✨</p>
          <p className="text-[12.5px] text-muted">Ask anything about your finances</p>
        </div>
        {ttsSupported && (
          <button
            onClick={() => {
              if (speak) window.speechSynthesis.cancel();
              setSpeak((s) => !s);
            }}
            className={cn("grid size-10 place-items-center rounded-full transition", speak ? "bg-ink text-lime" : "text-muted hover:bg-line-2")}
            aria-label={speak ? "Turn off spoken answers" : "Read answers aloud"}
            aria-pressed={speak}
          >
            {speak ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        )}
      </header>

      <div className="flex-1 space-y-4 pt-2 pb-36">
        {empty && (
          <div className="animate-rise pt-6">
            <div className="grid size-14 place-items-center rounded-2xl bg-ink text-2xl text-lime">✦</div>
            <h2 className="mt-4 text-[24px] leading-tight font-semibold tracking-tight">What are you thinking of buying or saving for?</h2>
            <p className="mt-2 text-[14.5px] text-muted">Answers are calculated from your actual income, commitments and spending — not guessed.</p>
            <div className="mt-5 flex flex-col gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button key={p} onClick={() => send(p)} className="rounded-2xl border border-line bg-card px-4 py-3.5 text-left text-[14.5px] font-medium transition hover:border-ink active:scale-[0.99]">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex animate-rise justify-end">
              <p className="max-w-[85%] rounded-[22px] rounded-br-md bg-ink px-4 py-3 text-[15px] leading-relaxed text-white">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="animate-rise">
              <div className={cn("rounded-[22px] rounded-bl-md border bg-card px-4 py-3.5", m.error ? "border-neg/30" : "border-line")}>
                <p className="mb-1 text-[12px] font-semibold text-muted">Financial X-Ray ✨</p>
                <div className="space-y-2.5 text-[15px] leading-relaxed whitespace-pre-line">{m.text}</div>
                {m.cards?.map((c, i) => (
                  <ChatCard
                    key={i}
                    card={c}
                    onCreateGoal={createGoal}
                    created={
                      (c.kind === "purchase" && !!c.data.goalDraft && created.includes(draftKey(c.data.goalDraft))) ||
                      (c.kind === "goalDraft" && created.includes(draftKey(c.data)))
                    }
                  />
                ))}
              </div>
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-card px-3.5 py-2 text-[13px] font-medium text-ink/80 hover:border-ink">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {loading && (
          <div className="flex w-fit items-center gap-1.5 rounded-[22px] rounded-bl-md border border-line bg-card px-4 py-4" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-subtle" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
      </div>

      {/* Composer, docked above the bottom navigation */}
      <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),0px)+84px)] z-30 flex justify-center px-3">
        <div className="w-full max-w-md md:max-w-xl">
          {voice.listening ? (
            <button
              onClick={voice.stop}
              className="flex w-full animate-fade items-center gap-3 rounded-[26px] border border-neg/20 bg-card p-3 pl-4 text-left shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]"
            >
              <span className="relative grid size-10 shrink-0 place-items-center">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-neg" />
                <span className="relative size-4 rounded-full bg-neg" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-neg">Listening…</span>
                <span className="block truncate text-[15px] text-ink">{voice.transcript ? `“${voice.transcript}”` : "Say something like “Can I afford a bike…”"}</span>
                <span className="block text-[12px] text-muted">Tap to stop</span>
              </span>
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 rounded-[26px] border border-line bg-card p-1.5 pl-4 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something…"
                className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-subtle"
                enterKeyHint="send"
                aria-label="Ask a question"
              />
              {input.trim() ? (
                <button type="submit" disabled={loading} className="grid size-12 place-items-center rounded-full bg-ink text-lime transition active:scale-95 disabled:opacity-40" aria-label="Send">
                  <ArrowUp size={20} />
                </button>
              ) : (
                <VoiceButton listening={false} onClick={voice.start} disabled={loading} />
              )}
            </form>
          )}
          {voice.error && (
            <button onClick={voice.clearError} className="mt-2 w-full rounded-2xl bg-neg-bg px-4 py-2 text-left text-[13px] text-neg">
              {voice.error}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
