import { describe, expect, it } from "vitest";
import { computeRankedLeaderboard } from "@/lib/leaderboard";

describe("computeRankedLeaderboard", () => {
  it("handles ties using score DESC, durationMs ASC, submittedAt ASC and RANK() 1,2,2,4 semantics", () => {
    const t1 = new Date("2026-01-01T10:00:00Z");
    const t2 = new Date("2026-01-01T10:05:00Z");

    const ranked = computeRankedLeaderboard([
      {
        studentId: "s1",
        studentName: "Alice",
        score: 9,
        maxScore: 10,
        durationMs: 600_000,
        submittedAt: t1,
        correctCount: 9,
        totalQuestions: 10,
      },
      {
        studentId: "s2",
        studentName: "Bob",
        score: 9,
        maxScore: 10,
        durationMs: 600_000,
        submittedAt: t1, // exact tie with s1!
        correctCount: 9,
        totalQuestions: 10,
      },
      {
        studentId: "s3",
        studentName: "Charlie",
        score: 10,
        maxScore: 10,
        durationMs: 900_000,
        submittedAt: t2,
        correctCount: 10,
        totalQuestions: 10,
      },
      {
        studentId: "s4",
        studentName: "David",
        score: 8,
        maxScore: 10,
        durationMs: 300_000,
        submittedAt: t1,
        correctCount: 8,
        totalQuestions: 10,
      },
      {
        studentId: "s5",
        studentName: "Flagged Student",
        score: 10,
        maxScore: 10,
        durationMs: 100_000,
        submittedAt: t1,
        correctCount: 10,
        totalQuestions: 10,
        flagged: true, // MUST be excluded!
      },
    ]);

    expect(ranked.map((r) => ({ id: r.studentId, rank: r.rank }))).toEqual([
      { id: "s3", rank: 1 },
      { id: "s1", rank: 2 },
      { id: "s2", rank: 2 },
      { id: "s4", rank: 4 }, // 1, 2, 2, 4!
    ]);
  });

  it("breaks score ties by shorter duration first, then earlier submittedAt", () => {
    const tEarly = new Date("2026-01-01T09:00:00Z");
    const tLate = new Date("2026-01-01T10:00:00Z");

    const ranked = computeRankedLeaderboard([
      {
        studentId: "slow",
        studentName: "Slow",
        score: 9,
        maxScore: 10,
        durationMs: 900_000,
        submittedAt: tEarly,
        correctCount: 9,
        totalQuestions: 10,
      },
      {
        studentId: "fastLate",
        studentName: "Fast Late",
        score: 9,
        maxScore: 10,
        durationMs: 400_000,
        submittedAt: tLate,
        correctCount: 9,
        totalQuestions: 10,
      },
      {
        studentId: "fastEarly",
        studentName: "Fast Early",
        score: 9,
        maxScore: 10,
        durationMs: 400_000,
        submittedAt: tEarly,
        correctCount: 9,
        totalQuestions: 10,
      },
    ]);

    expect(ranked.map((r) => r.studentId)).toEqual(["fastEarly", "fastLate", "slow"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("anonymizes non-top-3 students except currentUser when anonymize=true", () => {
    const base = new Date("2026-01-01T10:00:00Z");
    const candidates = [10, 9, 8, 7, 6].map((score, i) => ({
      studentId: `st${i + 1}`,
      studentName: `Student ${i + 1}`,
      score,
      maxScore: 10,
      durationMs: 300_000 + i * 1000,
      submittedAt: base,
      correctCount: score,
      totalQuestions: 10,
    }));

    const ranked = computeRankedLeaderboard(candidates, {
      currentUserId: "st5",
      anonymize: true,
      previousRanks: { st5: 7 },
    });

    // Top 3 remain named
    expect(ranked[0]?.displayName).toBe("Student 1");
    expect(ranked[1]?.displayName).toBe("Student 2");
    expect(ranked[2]?.displayName).toBe("Student 3");
    // Rank 4 is anonymized
    expect(ranked[3]?.displayName).toBe("Học sinh #4");
    expect(ranked[3]?.studentId).not.toBe("st4");
    // Rank 5 is currentUser -> remains visible with trend +2
    expect(ranked[4]?.displayName).toBe("Student 5");
    expect(ranked[4]?.isCurrentUser).toBe(true);
    expect(ranked[4]?.trend).toBe(2);
  });
});
