import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildExamVariants } from "@/lib/exam/variant-generator";

/**
 * Generates (or regenerates when no submissions exist yet) `variantCount` ExamVariant rows
 * for an assignment using sequential numeric codes (`101`, `102`, ...).
 */
export async function generateVariantsForAssignment(
  assignmentId: string,
  variantCount: number,
  startCode = 101
) {
  if (!Number.isFinite(variantCount) || variantCount <= 1) {
    return [];
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      worksheet: {
        select: {
          fields: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              placement: true,
              type: true,
              options: true,
            },
          },
        },
      },
    },
  });
  if (!assignment) return [];

  const generated = buildExamVariants(
    assignment.worksheet.fields.map((f) => ({
      id: f.id,
      placement: f.placement,
      type: f.type,
      options: f.options,
    })),
    variantCount,
    startCode
  );

  return prisma.$transaction(async (tx) => {
    const existingSubs = await tx.submission.count({ where: { assignmentId } });
    if (existingSubs > 0) {
      // Preserve variants once students have already started/submitted attempts
      return tx.examVariant.findMany({
        where: { assignmentId },
        orderBy: { code: "asc" },
      });
    }

    await tx.examVariant.deleteMany({ where: { assignmentId } });
    const created = [];
    for (const v of generated) {
      const row = await tx.examVariant.create({
        data: {
          assignmentId,
          code: v.code,
          questionOrder: v.questionOrder as unknown as Prisma.InputJsonValue,
          optionOrder: v.optionOrder as unknown as Prisma.InputJsonValue,
        },
      });
      created.push(row);
    }
    return created;
  });
}

/**
 * Assigns an ExamVariant round-robin (`existingSubmissionCount % variants.length`) when a
 * student starts a new submission on an assignment with pre-generated variants.
 */
export async function pickExamVariantForNewSubmission(assignmentId: string) {
  const variants = await prisma.examVariant.findMany({
    where: { assignmentId },
    orderBy: { code: "asc" },
  });
  if (variants.length === 0) return null;

  const existingCount = await prisma.submission.count({
    where: { assignmentId },
  });
  return variants[existingCount % variants.length]!;
}
