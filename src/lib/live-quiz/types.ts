import type { FieldOption, GradingOptions } from "@/lib/grading/types";

/** Field types a live quiz can auto-grade instantly. */
export const LIVE_QUIZ_FIELD_TYPES = [
  "MULTIPLE_CHOICE",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "TEXT",
  "NUMBER",
] as const;

export type LiveQuizFieldType = (typeof LIVE_QUIZ_FIELD_TYPES)[number];

export function isLiveQuizFieldType(type: string): type is LiveQuizFieldType {
  return (LIVE_QUIZ_FIELD_TYPES as readonly string[]).includes(type);
}

/** Frozen question stored in `LiveQuizSession.questionsSnapshot` (contains the answer key: server-only). */
export interface LiveQuizSnapshotQuestion {
  id: string;
  type: LiveQuizFieldType;
  prompt: string;
  options: FieldOption[] | null;
  imageKey: string | null;
  timeLimitSec: number;
  answerKey: unknown;
  gradingOpts: GradingOptions | null;
}

/** What a player may see while a question is open. */
export interface LiveQuizPlayerQuestion {
  id: string;
  type: LiveQuizFieldType;
  prompt: string;
  options: FieldOption[] | null;
  imageKey: string | null;
  timeLimitSec: number;
}

export type LiveQuizEventKind =
  | "LOBBY_UPDATE"
  | "QUESTION_START"
  | "ANSWER_COUNT"
  | "QUESTION_REVEAL"
  | "SESSION_END";

export interface LiveQuizEvent {
  kind: LiveQuizEventKind;
  sessionId: string;
  at: string;
  participantCount?: number;
  answerCount?: number;
  questionIndex?: number;
}

export function parseSnapshot(raw: unknown): LiveQuizSnapshotQuestion[] {
  return Array.isArray(raw) ? (raw as LiveQuizSnapshotQuestion[]) : [];
}
