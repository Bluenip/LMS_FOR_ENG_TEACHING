import ExcelJS from "exceljs";
import type { Assignment, Role, ScoreScale, ShowResultMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import { resolveUserClassRole, hasMinClassRole } from "@/lib/permissions";
import { createNotificationsBulk } from "./notificationService";
import { formatDateTime } from "@/lib/utils";

type Actor = { id: string; role: Role };

export async function listWorkbooks(ownerId: string, isAdmin = false) {
  return prisma.workbook.findMany({
    where: {
      deletedAt: null,
      ...(isAdmin ? {} : { ownerId }),
    },
    include: {
      owner: { select: { id: true, name: true } },
      items: {
        orderBy: { order: "asc" },
        include: {
          worksheet: {
            select: {
              id: true,
              title: true,
              subject: true,
              _count: { select: { fields: true } },
            },
          },
        },
      },
      assignments: {
        where: { class: { deletedAt: null } },
        select: {
          id: true,
          classId: true,
          workbookOrder: true,
          class: { select: { id: true, name: true } },
        },
        orderBy: [{ workbookOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getWorkbookById(workbookId: string, actor: Actor) {
  const wb = await prisma.workbook.findUnique({
    where: { id: workbookId },
    include: {
      owner: { select: { id: true, name: true } },
      items: {
        orderBy: { order: "asc" },
        include: {
          worksheet: {
            select: {
              id: true,
              title: true,
              subject: true,
              _count: { select: { fields: true } },
            },
          },
        },
      },
      assignments: {
        where: { class: { deletedAt: null } },
        select: {
          id: true,
          title: true,
          classId: true,
          workbookOrder: true,
          unlockAfterAssignmentId: true,
          class: { select: { id: true, name: true } },
        },
        orderBy: [{ workbookOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!wb || wb.deletedAt) {
    throw new AppError("Không tìm thấy workbook.", 404, "NOT_FOUND");
  }
  if (actor.role !== "ADMIN" && wb.ownerId !== actor.id) {
    throw new AppError("Bạn không có quyền chỉnh sửa workbook này.", 403, "FORBIDDEN");
  }
  return wb;
}

async function resolveUsableWorksheets(ownerId: string, isAdmin: boolean, worksheetIds: string[]) {
  const uniqueIds = Array.from(new Set(worksheetIds));
  if (uniqueIds.length === 0) return [];
  const found = await prisma.worksheet.findMany({
    where: {
      id: { in: uniqueIds },
      deletedAt: null,
      ...(isAdmin ? {} : { OR: [{ ownerId }, { isShared: true }] }),
    },
    select: { id: true },
  });
  if (found.length !== uniqueIds.length) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  return uniqueIds;
}

export async function createWorkbook(
  ownerId: string,
  isAdmin: boolean,
  input: { title: string; description?: string | null; worksheetIds: string[] }
) {
  const orderedIds = await resolveUsableWorksheets(ownerId, isAdmin, input.worksheetIds);
  return prisma.workbook.create({
    data: {
      ownerId,
      title: input.title,
      description: input.description ?? null,
      items: {
        create: orderedIds.map((worksheetId, idx) => ({ worksheetId, order: idx })),
      },
    },
    include: {
      owner: { select: { id: true, name: true } },
      items: {
        orderBy: { order: "asc" },
        include: {
          worksheet: {
            select: { id: true, title: true, subject: true, _count: { select: { fields: true } } },
          },
        },
      },
      assignments: {
        where: { class: { deletedAt: null } },
        select: { id: true, classId: true, workbookOrder: true, class: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function updateWorkbook(
  workbookId: string,
  actor: Actor,
  input: { title?: string; description?: string | null; worksheetIds?: string[] }
) {
  await getWorkbookById(workbookId, actor);
  const orderedIds =
    input.worksheetIds !== undefined
      ? await resolveUsableWorksheets(actor.id, actor.role === "ADMIN", input.worksheetIds)
      : undefined;

  return prisma.$transaction(async (tx) => {
    if (orderedIds !== undefined) {
      await tx.workbookItem.deleteMany({ where: { workbookId } });
      if (orderedIds.length > 0) {
        await tx.workbookItem.createMany({
          data: orderedIds.map((worksheetId, idx) => ({ workbookId, worksheetId, order: idx })),
        });
      }
    }
    return tx.workbook.update({
      where: { id: workbookId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: {
        owner: { select: { id: true, name: true } },
        items: {
          orderBy: { order: "asc" },
          include: {
            worksheet: {
              select: { id: true, title: true, subject: true, _count: { select: { fields: true } } },
            },
          },
        },
        assignments: {
          where: { class: { deletedAt: null } },
          select: { id: true, classId: true, workbookOrder: true, class: { select: { id: true, name: true } } },
        },
      },
    });
  });
}

export async function deleteWorkbook(workbookId: string, actor: Actor) {
  await getWorkbookById(workbookId, actor);
  await prisma.workbook.update({
    where: { id: workbookId },
    data: { deletedAt: new Date() },
  });
}

export async function assignWorkbookToClass(
  workbookId: string,
  actor: Actor,
  input: {
    classId: string;
    titlePrefix?: string | null;
    sequentialUnlock?: boolean;
    dueAt?: string | null;
    timeLimitMin?: number | null;
    maxAttempts?: number | null;
    showResult?: ShowResultMode;
    showAnswerKey?: boolean;
    scoreScale?: ScoreScale;
  }
) {
  const wb = await getWorkbookById(workbookId, actor);
  if (wb.items.length === 0) {
    throw new AppError("Workbook chưa có phiếu bài tập nào.", 400, "EMPTY_WORKBOOK");
  }

  const cls = await prisma.class.findUnique({
    where: { id: input.classId },
    include: {
      enrollments: {
        where: { status: "ACTIVE", student: { deletedAt: null } },
        select: { studentId: true },
      },
    },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }
  const role = await resolveUserClassRole(cls.id, actor.id, actor.role, cls.teacherId);
  if (!hasMinClassRole(role, "CO_TEACHER")) {
    throw new AppError("Bạn không có quyền quản lý lớp học này.", 403, "FORBIDDEN");
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const prefix = input.titlePrefix?.trim() || wb.title;

  const created = await prisma.$transaction(async (tx) => {
    const out: Assignment[] = [];
    let prevAssignmentId: string | null = null;
    for (let idx = 0; idx < wb.items.length; idx++) {
      const item = wb.items[idx]!;
      const assignment: Assignment = await tx.assignment.create({
        data: {
          classId: cls.id,
          worksheetId: item.worksheetId,
          workbookId: wb.id,
          workbookOrder: idx,
          unlockAfterAssignmentId: input.sequentialUnlock && prevAssignmentId ? prevAssignmentId : null,
          title: `${prefix} — ${item.worksheet.title}`,
          dueAt,
          timeLimitMin: input.timeLimitMin ?? null,
          maxAttempts: input.maxAttempts !== undefined ? input.maxAttempts : 1,
          showResult: input.showResult ?? "AFTER_SUBMIT",
          showAnswerKey: Boolean(input.showAnswerKey),
          scoreScale: input.scoreScale ?? "SCALE_10",
        },
      });
      prevAssignmentId = assignment.id;
      out.push(assignment);
    }
    return out;
  });

  if (cls.enrollments.length > 0 && created.length > 0) {
    const dueLabel = dueAt ? ` • Hạn nộp: ${formatDateTime(dueAt)}` : "";
    await createNotificationsBulk(
      cls.enrollments.map((e) => ({
        userId: e.studentId,
        type: "ASSIGNMENT_CREATED" as const,
        title: `Workbook mới: ${wb.title}`,
        body: `${created.length} bài tập trong lớp ${cls.name}${dueLabel}`,
        link: `/student/classes/${cls.id}?tab=assignments`,
      }))
    );
  }

  return created;
}

export async function getWorkbookMatrix(workbookId: string, classId: string) {
  const wb = await prisma.workbook.findUnique({
    where: { id: workbookId },
    select: { id: true, title: true, description: true, deletedAt: true },
  });
  if (!wb || wb.deletedAt) {
    throw new AppError("Không tìm thấy workbook.", 404, "NOT_FOUND");
  }

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      enrollments: {
        where: { status: "ACTIVE", student: { deletedAt: null } },
        include: {
          student: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const assignments = await prisma.assignment.findMany({
    where: { workbookId, classId },
    orderBy: [{ workbookOrder: "asc" }, { createdAt: "asc" }],
    include: {
      worksheet: { select: { id: true, title: true, _count: { select: { fields: true } } } },
      submissions: {
        orderBy: [{ attemptNo: "desc" }],
        select: {
          id: true,
          studentId: true,
          status: true,
          totalScore: true,
          autoScore: true,
          maxScore: true,
          submittedAt: true,
        },
      },
    },
  });

  const viCollator = new Intl.Collator("vi", { sensitivity: "base" });
  const sortedEnrollments = [...cls.enrollments].sort((a, b) =>
    viCollator.compare(a.student.name, b.student.name)
  );

  const rows = sortedEnrollments.map((enr) => {
    const cells = assignments.map((asg) => {
      const subs = asg.submissions.filter((s) => s.studentId === enr.studentId);
      const completed = subs.find((s) => s.status === "GRADED" || s.status === "SUBMITTED");
      const target = completed ?? subs[0] ?? null;
      const rawScore = target ? (target.totalScore ?? target.autoScore ?? null) : null;
      const maxScore = target?.maxScore ?? 0;
      const scoreScale10 =
        target && (target.status === "SUBMITTED" || target.status === "GRADED") && rawScore !== null && maxScore > 0
          ? Math.round((rawScore / maxScore) * 1000) / 100
          : null;
      return {
        assignmentId: asg.id,
        submissionId: target?.id ?? null,
        status: target?.status ?? ("NOT_STARTED" as const),
        score: rawScore,
        maxScore,
        scoreScale10,
      };
    });

    const gradedScores = cells
      .map((c) => c.scoreScale10)
      .filter((s): s is number => s !== null);
    const completedCount = cells.filter(
      (c) => c.status === "SUBMITTED" || c.status === "GRADED"
    ).length;
    const avgScore10 =
      gradedScores.length > 0
        ? Math.round((gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length) * 100) / 100
        : null;

    return {
      studentId: enr.student.id,
      studentName: enr.student.name,
      studentEmail: enr.student.email,
      cells,
      completedCount,
      totalCount: assignments.length,
      avgScore10,
    };
  });

  return {
    workbook: { id: wb.id, title: wb.title, description: wb.description },
    class: { id: cls.id, name: cls.name },
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      workbookOrder: a.workbookOrder,
      unlockAfterAssignmentId: a.unlockAfterAssignmentId,
      dueAt: a.dueAt?.toISOString() ?? null,
      worksheetTitle: a.worksheet.title,
      questionCount: a.worksheet._count.fields,
    })),
    rows,
  };
}

export async function exportWorkbookMatrixXlsx(
  workbookId: string,
  classId: string,
  locale: Locale = "vi"
): Promise<{ buffer: Buffer; filename: string }> {
  const matrix = await getWorkbookMatrix(workbookId, classId);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(locale === "en" ? "Workbook Matrix" : "Ma tran Workbook");

  const headerRow = [
    locale === "en" ? "#" : "STT",
    locale === "en" ? "Student" : "Học sinh",
    "Email",
    ...matrix.assignments.map((a, idx) => `#${idx + 1} ${a.worksheetTitle} (/10)`),
    locale === "en" ? "Completed" : "Hoàn thành",
    locale === "en" ? "Avg (/10)" : "TB (/10)",
  ];
  sheet.addRow(headerRow);
  sheet.getRow(1).font = { bold: true };

  matrix.rows.forEach((row, idx) => {
    sheet.addRow([
      idx + 1,
      row.studentName,
      row.studentEmail,
      ...row.cells.map((c) => (c.scoreScale10 !== null ? c.scoreScale10 : c.status === "RETURNED" ? "RETURNED" : "—")),
      `${row.completedCount}/${row.totalCount}`,
      row.avgScore10 !== null ? row.avgScore10 : "—",
    ]);
  });

  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const safeName = matrix.workbook.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "workbook";
  return {
    buffer: Buffer.from(arrayBuffer),
    filename: `matrix-${safeName}.xlsx`,
  };
}
