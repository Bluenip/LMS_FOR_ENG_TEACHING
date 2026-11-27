export type AtRiskLevel = "HIGH" | "MEDIUM";
export type AtRiskSignal = "LOW_SCORES" | "DECLINING" | "MISSING_WORK" | "ABSENCES";

export interface StudentRiskStats {
  student: { id: string; name: string };
  /** Scores on a 0–10 scale, oldest → newest. */
  recentScores10: number[];
  /** Overdue assignments (last 30 days) the student never submitted. */
  missingCount: number;
  /** ABSENT attendance records in the last 30 days (null when the class has no attendance data). */
  absentCount: number | null;
}

export interface AtRiskConfig {
  scoreThreshold: number;
  missingCount: number;
  absentCount?: number;
}

export interface AtRiskReason {
  signal: AtRiskSignal;
  vi: string;
  en: string;
}

export interface AtRiskStudent {
  student: { id: string; name: string };
  level: AtRiskLevel;
  reasons: AtRiskReason[];
  avgRecent10: number | null;
  missingCount: number;
  absentCount: number | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Three early-warning signals (scores, missing work, absences). One signal = MEDIUM, two or more = HIGH.
 * A steady drop of ≥ 1.5 points over the last 3 scores counts as the score signal too.
 */
export function detectAtRiskStudents(stats: StudentRiskStats[], config: AtRiskConfig): AtRiskStudent[] {
  const absentLimit = config.absentCount ?? 2;
  const out: AtRiskStudent[] = [];
  for (const s of stats) {
    const reasons: AtRiskReason[] = [];
    const last3 = s.recentScores10.slice(-3);
    const avg = last3.length > 0 ? round1(last3.reduce((a, b) => a + b, 0) / last3.length) : null;
    if (avg !== null && avg < config.scoreThreshold) {
      reasons.push({
        signal: "LOW_SCORES",
        vi: `Điểm TB ${last3.length} bài gần nhất ${avg}/10 (dưới ${config.scoreThreshold})`,
        en: `Average of last ${last3.length} scores ${avg}/10 (below ${config.scoreThreshold})`,
      });
    } else if (last3.length === 3 && last3[0]! > last3[1]! && last3[1]! > last3[2]! && last3[0]! - last3[2]! >= 1.5) {
      reasons.push({
        signal: "DECLINING",
        vi: `Điểm giảm liên tục ${round1(last3[0]!)} → ${round1(last3[2]!)}`,
        en: `Scores dropping steadily ${round1(last3[0]!)} → ${round1(last3[2]!)}`,
      });
    }
    if (s.missingCount >= config.missingCount) {
      reasons.push({
        signal: "MISSING_WORK",
        vi: `Chưa nộp ${s.missingCount} bài quá hạn trong 30 ngày`,
        en: `${s.missingCount} overdue assignments not submitted in 30 days`,
      });
    }
    if (s.absentCount !== null && s.absentCount >= absentLimit) {
      reasons.push({
        signal: "ABSENCES",
        vi: `Vắng không phép ${s.absentCount} buổi trong 30 ngày`,
        en: `${s.absentCount} unexcused absences in 30 days`,
      });
    }
    if (reasons.length === 0) continue;
    out.push({
      student: s.student,
      level: reasons.length >= 2 ? "HIGH" : "MEDIUM",
      reasons,
      avgRecent10: avg,
      missingCount: s.missingCount,
      absentCount: s.absentCount,
    });
  }
  return out.sort((a, b) => (a.level === b.level ? b.reasons.length - a.reasons.length : a.level === "HIGH" ? -1 : 1));
}
