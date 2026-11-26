import type { AnswerValue } from "@/lib/grading/types";

export interface OfflineDraftPayload {
  attemptVersion: number;
  updatedAt: string;
  answers: Record<string, AnswerValue>;
}

const DRAFT_PREFIX = "pivora:draft:";
const FLAGS_PREFIX = "pivora:flags:";

export function saveOfflineDraft(
  submissionId: string,
  attemptVersion: number,
  answers: Record<string, AnswerValue>
): void {
  if (typeof window === "undefined" || !submissionId) return;
  try {
    const payload: OfflineDraftPayload = {
      attemptVersion,
      updatedAt: new Date().toISOString(),
      answers,
    };
    window.localStorage.setItem(`${DRAFT_PREFIX}${submissionId}`, JSON.stringify(payload));
  } catch {
    // Ignore quota / private-browsing storage errors
  }
}

export function loadOfflineDraft(
  submissionId: string,
  currentAttemptVersion: number
): OfflineDraftPayload | null {
  if (typeof window === "undefined" || !submissionId) return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${submissionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineDraftPayload>;
    if (
      typeof parsed.attemptVersion !== "number" ||
      parsed.attemptVersion !== currentAttemptVersion ||
      !parsed.answers ||
      typeof parsed.answers !== "object" ||
      Array.isArray(parsed.answers)
    ) {
      return null;
    }
    return {
      attemptVersion: parsed.attemptVersion,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      answers: parsed.answers,
    };
  } catch {
    return null;
  }
}

export function clearOfflineDraft(submissionId: string): void {
  if (typeof window === "undefined" || !submissionId) return;
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${submissionId}`);
  } catch {
    // ignore
  }
}

export function loadFlaggedFieldIds(submissionId: string): string[] {
  if (typeof window === "undefined" || !submissionId) return [];
  try {
    const raw = window.localStorage.getItem(`${FLAGS_PREFIX}${submissionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function saveFlaggedFieldIds(submissionId: string, fieldIds: string[]): void {
  if (typeof window === "undefined" || !submissionId) return;
  try {
    window.localStorage.setItem(
      `${FLAGS_PREFIX}${submissionId}`,
      JSON.stringify(Array.from(new Set(fieldIds)))
    );
  } catch {
    // ignore
  }
}
