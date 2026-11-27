import { cookies } from "next/headers";

/** httpOnly cookie carrying a participant's join token (EventSource cannot send custom headers). */
export function liveQuizCookieName(sessionId: string): string {
  return `pivora_lq_${sessionId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export const LIVE_QUIZ_COOKIE_MAX_AGE_SEC = 6 * 60 * 60;

export async function readLiveQuizJoinToken(sessionId: string): Promise<string | null> {
  const store = await cookies();
  return store.get(liveQuizCookieName(sessionId))?.value ?? null;
}
