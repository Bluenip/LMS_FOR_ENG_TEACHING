"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to /api/live-quiz/[id]/stream and calls `onSignal` for every state-change event.
 * The stream carries no question content; callers refetch the state endpoint on each signal.
 */
export function useLiveQuizStream(
  sessionId: string | null,
  onSignal: (event: { kind: string; answerCount?: number; participantCount?: number }) => void,
  enabled = true
) {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onSignal);
  cb.current = onSignal;

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const es = new EventSource(`/api/live-quiz/${sessionId}/stream`);
    es.addEventListener("connected", () => setConnected(true));
    es.addEventListener("livequiz", (ev) => {
      try {
        cb.current(JSON.parse((ev as MessageEvent<string>).data));
      } catch {
        // ignore malformed event
      }
    });
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      setConnected(false);
    };
  }, [sessionId, enabled]);

  return connected;
}

/** Remaining whole seconds of the open question, corrected for client/server clock skew. */
export function useCountdown(
  startedAtIso: string | null,
  limitSec: number,
  serverNowIso: string | null,
  active: boolean
): number {
  const offsetRef = useRef(0);
  useEffect(() => {
    if (serverNowIso) offsetRef.current = new Date(serverNowIso).getTime() - Date.now();
  }, [serverNowIso]);

  const compute = () => {
    if (!startedAtIso) return limitSec;
    const elapsed = Date.now() + offsetRef.current - new Date(startedAtIso).getTime();
    return Math.max(0, Math.ceil(limitSec - elapsed / 1000));
  };
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    if (!active) {
      setRemaining(compute());
      return;
    }
    setRemaining(compute());
    const t = setInterval(() => setRemaining(compute()), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compute only depends on these inputs
  }, [startedAtIso, limitSec, active, serverNowIso]);

  return remaining;
}

export const OPTION_COLORS = [
  "bg-rose-500 hover:bg-rose-600 text-white",
  "bg-sky-500 hover:bg-sky-600 text-white",
  "bg-amber-500 hover:bg-amber-600 text-white",
  "bg-emerald-500 hover:bg-emerald-600 text-white",
  "bg-violet-500 hover:bg-violet-600 text-white",
  "bg-slate-600 hover:bg-slate-700 text-white",
];

export const OPTION_BAR_COLORS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-slate-500"];

export interface LiveQuizQuestionDTO {
  id: string;
  type: "MULTIPLE_CHOICE" | "MULTI_SELECT" | "TRUE_FALSE" | "TEXT" | "NUMBER";
  prompt: string;
  options: Array<{ id: string; text: string }> | null;
  imageKey: string | null;
  timeLimitSec: number;
}

export interface LiveQuizSessionHeaderDTO {
  id: string;
  title: string;
  pinCode: string;
  mode: "HOST_PACED" | "SELF_PACED";
  status: "LOBBY" | "QUESTION_OPEN" | "QUESTION_CLOSED" | "FINISHED";
  currentIndex: number;
  questionCount: number;
  questionStartedAt: string | null;
  questionLimitSec: number;
  isExitTicket: boolean;
  classId: string | null;
  serverNow: string;
}

export interface LiveQuizLeaderRow {
  rank: number;
  id: string;
  displayName: string;
  totalScore: number;
  correctCount: number;
}

/** Human readable form of a revealed answer key. */
export function formatCorrectAnswer(
  q: LiveQuizQuestionDTO,
  key: unknown,
  tr: (vi: string, en: string) => string
): string | null {
  if (!key || typeof key !== "object") return null;
  const k = key as { correct?: unknown; accepted?: unknown; value?: unknown };
  const optText = (id: string) => q.options?.find((o) => o.id === id)?.text ?? id;
  if (q.type === "MULTIPLE_CHOICE" && typeof k.correct === "string") return optText(k.correct);
  if (q.type === "MULTI_SELECT" && Array.isArray(k.correct)) return k.correct.map((c) => optText(String(c))).join(", ");
  if (q.type === "TRUE_FALSE" && typeof k.correct === "boolean") return k.correct ? tr("Đúng", "True") : tr("Sai", "False");
  if (q.type === "TEXT" && Array.isArray(k.accepted)) return k.accepted.join(" / ");
  if (q.type === "NUMBER" && k.value !== undefined) return String(k.value);
  return null;
}
