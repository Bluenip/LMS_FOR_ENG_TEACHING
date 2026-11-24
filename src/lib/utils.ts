import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME?.trim() || "EngClass";
}

export function getHomeForRole(role: "ADMIN" | "TEACHER" | "STUDENT" | "PARENT"): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "TEACHER":
      return "/teacher";
    case "PARENT":
      return "/parent";
    case "STUDENT":
    default:
      return "/student";
  }
}

// Excludes easily confused characters: 0, O, 1, I
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateJoinCode(length = 6): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    const idx = (bytes[i] ?? 0) % JOIN_CODE_ALPHABET.length;
    code += JOIN_CODE_ALPHABET[idx];
  }
  return code;
}

export function generateParentInviteCode(): string {
  return generateJoinCode(8);
}

export function formatDateTime(
  date: Date | string | null | undefined,
  locale: "vi" | "en" = "vi"
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatScore(score: number | null | undefined, maxScore?: number): string {
  if (score === null || score === undefined) return "—";
  const rounded = Math.round(score * 100) / 100;
  if (maxScore !== undefined) {
    const roundedMax = Math.round(maxScore * 100) / 100;
    return `${rounded} / ${roundedMax}`;
  }
  return String(rounded);
}

export function formatSecondsMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || durationMs < 0) return "—";
  return formatSecondsMMSS(Math.round(durationMs / 1000));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return `${first}${last}`.toUpperCase();
}

/** Natural compare for question labels ("2" < "9" < "10", "1a" < "1b"), Vietnamese-aware. */
const labelCollator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });
export function compareQuestionLabels(a: string, b: string): number {
  return labelCollator.compare(a, b);
}

/**
 * Formats an attempt counter/limit, supporting null (unlimited attempts).
 * Examples:
 *  - formatAttemptsLimit(null, tr) -> "Không giới hạn lượt" / "Unlimited attempts"
 *  - formatAttemptsLimit(3, tr)    -> "3 lượt làm" / "3 attempt(s)"
 *  - formatAttemptsProgress(2, null) -> "2/∞"
 *  - formatAttemptsProgress(2, 3)    -> "2/3"
 */
export function formatAttemptsLimit(
  maxAttempts: number | null | undefined,
  tr: (viText: string, enText: string) => string = (v) => v
): string {
  if (maxAttempts === null || maxAttempts === undefined) {
    return tr("Không giới hạn lượt", "Unlimited attempts");
  }
  return tr(`${maxAttempts} lượt làm`, `${maxAttempts} attempt(s)`);
}

export function formatAttemptsProgress(
  used: number,
  maxAttempts: number | null | undefined
): string {
  if (maxAttempts === null || maxAttempts === undefined) {
    return `${used}/∞`;
  }
  return `${used}/${maxAttempts}`;
}
