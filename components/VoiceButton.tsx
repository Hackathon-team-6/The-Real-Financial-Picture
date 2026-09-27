"use client";

import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

// Minimal typings for the Web Speech API (not in lib.dom for all TS versions).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Speech-to-text via the browser's speech recognition. Calls onFinal with the transcript when the user stops. */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => setSupported(getRecognitionCtor() !== null), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser — try Chrome, Edge or Safari, or type your question.");
      return;
    }
    setError(null);
    setTranscript("");
    finalRef.current = "";
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Microphone access was blocked. Allow it in your browser settings.");
      else if (e.error === "no-speech") setError("I didn't catch that — try again.");
      else if (e.error !== "aborted") setError("Voice input isn't working right now. You can type instead.");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const text = finalRef.current.trim();
      if (text) onFinalRef.current(text);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone.");
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    // Promote the latest interim text so "tap to stop" sends what the user saw.
    setTranscript((t) => {
      if (t && t.length > finalRef.current.length) finalRef.current = t;
      return t;
    });
    rec.stop();
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, transcript, error, start, stop, clearError: () => setError(null) };
}

export function VoiceButton({ listening, onClick, disabled }: { listening: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? "Stop listening" : "Speak your question"}
      aria-pressed={listening}
      className={cn(
        "relative grid size-12 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-40",
        listening ? "bg-neg text-white" : "bg-ink text-lime hover:bg-ink-2",
      )}
    >
      {listening && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-neg" />}
      <span className="relative">{listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}</span>
    </button>
  );
}
