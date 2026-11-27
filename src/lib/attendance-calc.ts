import type { AttendanceStatus } from "@prisma/client";

export interface AttendanceWeights {
  PRESENT: number;
  LATE: number;
  EXCUSED: number;
  ABSENT: number;
}

export const DEFAULT_ATTENDANCE_WEIGHTS: AttendanceWeights = {
  PRESENT: 1,
  LATE: 0.8,
  EXCUSED: 0.5,
  ABSENT: 0,
};

export interface AttendanceSummary {
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  absentCount: number;
  totalMarked: number;
  attendanceRatePct: number | null;
}

/**
 * Computes weighted attendance rate percentage (0–100, 1 decimal place):
 *   (present * 1 + late * 0.8 + excused * 0.5) / totalMarked * 100
 * Returns `attendanceRatePct: null` when no sessions have been marked yet.
 */
export function computeAttendanceSummary(
  statuses: readonly AttendanceStatus[],
  weights: AttendanceWeights = DEFAULT_ATTENDANCE_WEIGHTS
): AttendanceSummary {
  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let absentCount = 0;

  for (const st of statuses) {
    if (st === "PRESENT") presentCount++;
    else if (st === "LATE") lateCount++;
    else if (st === "EXCUSED") excusedCount++;
    else if (st === "ABSENT") absentCount++;
  }

  const totalMarked = presentCount + lateCount + excusedCount + absentCount;
  if (totalMarked === 0) {
    return {
      presentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      absentCount: 0,
      totalMarked: 0,
      attendanceRatePct: null,
    };
  }

  const earned =
    presentCount * weights.PRESENT +
    lateCount * weights.LATE +
    excusedCount * weights.EXCUSED +
    absentCount * weights.ABSENT;
  const pct = Math.max(0, Math.min(100, (earned / totalMarked) * 100));
  return {
    presentCount,
    lateCount,
    excusedCount,
    absentCount,
    totalMarked,
    attendanceRatePct: Math.round(pct * 10) / 10,
  };
}
