"use client";

import { Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Handoff key read by <Chat />; sessionStorage keeps the question out of the URL and browser history. */
export const PENDING_QUESTION_KEY = "financial-xray:pending-question";

/** Home search bar: submitting opens the Ask tab and answers the question there. */
export function AskSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const submit = () => {
    const q = query.trim();
    if (q) {
      try {
        sessionStorage.setItem(PENDING_QUESTION_KEY, q.slice(0, 1000));
      } catch {
        /* storage unavailable: still open the chat */
      }
    }
    router.push("/ask");
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 rounded-[var(--radius-card)] bg-lime p-2 pl-4 transition focus-within:ring-2 focus-within:ring-ink/15"
    >
      <Sparkles size={20} className="shrink-0 text-ink/70" aria-hidden />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Can I afford a new bike?"
        className="h-12 min-w-0 flex-1 bg-transparent text-[16px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink/55"
        enterKeyHint="search"
        aria-label="Ask Financial X-Ray a question"
      />
      <button type="submit" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-lime transition active:scale-95" aria-label="Ask">
        <Search size={20} />
      </button>
    </form>
  );
}
