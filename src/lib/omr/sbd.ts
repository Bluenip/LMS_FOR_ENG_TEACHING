import crypto from "crypto";

/**
 * Stable 6-digit "số báo danh" for a student inside one class (server-only).
 * Derived from the ids so no extra column is needed; printed on pre-filled sheets and listed
 * on the OMR page. Collisions inside one class are detected by the caller (no auto-match then).
 */
export function studentSbd(classId: string, studentId: string): string {
  const hash = crypto.createHash("sha256").update(`${classId}:${studentId}`).digest();
  return String(hash.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
