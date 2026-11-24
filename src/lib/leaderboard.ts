export interface LeaderboardCandidate {
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  durationMs: number;
  submittedAt: Date;
  correctCount: number;
  totalQuestions: number;
  flagged?: boolean;
}

export interface RankedLeaderboardEntry {
  rank: number;
  studentId: string;
  displayName: string;
  isCurrentUser: boolean;
  score: number;
  maxScore: number;
  scoreScale10: number;
  durationMs: number;
  submittedAt: string;
  correctCount: number;
  totalQuestions: number;
  trend: number | null; // positive = improved vs previous assignment
}

/**
 * Pure ranking helper matching PostgreSQL RANK() semantics (1, 2, 2, 4):
 * - Excludes flagged submissions
 * - Sorts by: score DESC -> durationMs ASC -> submittedAt ASC
 * - Equal (score, durationMs, submittedAt) share the exact same rank (1, 2, 2, 4)
 */
export function computeRankedLeaderboard(
  candidates: LeaderboardCandidate[],
  opts?: {
    currentUserId?: string;
    anonymize?: boolean;
    previousRanks?: Record<string, number>;
  }
): RankedLeaderboardEntry[] {
  const eligible = candidates.filter((c) => !c.flagged);

  const sorted = [...eligible].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
    return a.submittedAt.getTime() - b.submittedAt.getTime();
  });

  const results: RankedLeaderboardEntry[] = [];
  let prevKey: string | null = null;
  let currentRank = 0;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    const tieKey = `${item.score}|${item.durationMs}|${item.submittedAt.getTime()}`;
    if (tieKey !== prevKey) {
      currentRank = i + 1;
      prevKey = tieKey;
    }

    const isCurrentUser = Boolean(opts?.currentUserId && item.studentId === opts.currentUserId);
    const shouldHideName = Boolean(opts?.anonymize && currentRank > 3 && !isCurrentUser);
    const prevRank = opts?.previousRanks?.[item.studentId];
    const trend = prevRank !== undefined ? prevRank - currentRank : null;
    const scoreScale10 =
      item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 1000) / 100 : 0;

    results.push({
      rank: currentRank,
      studentId: shouldHideName ? `anon-${i + 1}` : item.studentId,
      displayName: shouldHideName ? `Học sinh #${i + 1}` : item.studentName,
      isCurrentUser,
      score: Math.round(item.score * 100) / 100,
      maxScore: Math.round(item.maxScore * 100) / 100,
      scoreScale10,
      durationMs: item.durationMs,
      submittedAt: item.submittedAt.toISOString(),
      correctCount: item.correctCount,
      totalQuestions: item.totalQuestions,
      trend,
    });
  }

  return results;
}
