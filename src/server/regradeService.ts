import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gradeField, type AnswerValue, type GradingOptions } from "@/lib/grading";
import { invalidateLeaderboardCache } from "./leaderboardService";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Re-grades every finalized submission (SUBMITTED / GRADED) of a worksheet after the teacher
 * changed answer keys or points. Teacher-overridden answers and ESSAY scores are kept as-is.
 */
export async function regradeWorksheetSubmissions(worksheetId: string): Promise<number> {
  const fields = await prisma.field.findMany({
    where: { worksheetId },
    orderBy: { order: "asc" },
  });
  const submissions = await prisma.submission.findMany({
    where: {
      assignment: { worksheetId },
      status: { in: ["SUBMITTED", "GRADED"] },
    },
    include: { answers: true, assignment: { select: { classId: true } } },
  });

  const classIds = new Set<string>();
  for (const sub of submissions) {
    const answerByField = new Map(sub.answers.map((a) => [a.fieldId, a]));
    let autoScore = 0;
    let manualScore = 0;
    let maxScore = 0;
    let hasUngradedEssay = false;
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const f of fields) {
      maxScore += f.points;
      const ans = answerByField.get(f.id);
      if (f.type === "ESSAY") {
        if (ans?.score === null || ans?.score === undefined) {
          hasUngradedEssay = true;
        } else {
          manualScore += Math.min(ans.score, f.points);
        }
        continue;
      }
      if (ans?.isOverridden) {
        autoScore += Math.min(ans.score ?? 0, f.points);
        continue;
      }
      const res = gradeField(
        {
          id: f.id,
          type: f.type,
          points: f.points,
          answerKey: f.answerKey,
          gradingOpts: (f.gradingOpts as GradingOptions | null) ?? null,
        },
        (ans?.value ?? undefined) as AnswerValue
      );
      autoScore += res.score ?? 0;
      updates.push(
        prisma.answer.upsert({
          where: { submissionId_fieldId: { submissionId: sub.id, fieldId: f.id } },
          create: {
            submissionId: sub.id,
            fieldId: f.id,
            value: "",
            isCorrect: res.isCorrect,
            score: res.score,
          },
          update: { isCorrect: res.isCorrect, score: res.score },
        })
      );
    }

    updates.push(
      prisma.submission.update({
        where: { id: sub.id },
        data: {
          autoScore: round2(autoScore),
          manualScore: hasUngradedEssay ? null : round2(manualScore),
          totalScore: round2(autoScore + manualScore),
          maxScore: round2(maxScore),
          status: hasUngradedEssay ? "SUBMITTED" : "GRADED",
        },
      })
    );
    await prisma.$transaction(updates);
    classIds.add(sub.assignment.classId);
  }

  for (const id of classIds) invalidateLeaderboardCache(id);
  return submissions.length;
}
