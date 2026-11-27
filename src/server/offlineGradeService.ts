import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertGradebookUnlocked } from "./gradebookLock";

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;

function parseColumnDate(dateStr: string | null | undefined): Date | undefined {
  if (dateStr === undefined) return undefined;
  if (dateStr === null || dateStr.trim() === "") return new Date();
  const trimmed = dateStr.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00.000Z` : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Ngày kiểm tra không hợp lệ.", 400, "VALIDATION_ERROR");
  }
  return parsed;
}

export async function listOfflineGradeColumns(classId: string) {
  const columns = await prisma.offlineGradeColumn.findMany({
    where: { classId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      createdBy: { select: { id: true, name: true } },
      entries: {
        select: {
          id: true,
          studentId: true,
          score: true,
          note: true,
          updatedAt: true,
        },
      },
    },
  });

  return columns.map((col) => ({
    ...col,
    date: col.date.toISOString(),
    createdAt: col.createdAt.toISOString(),
    updatedAt: col.updatedAt.toISOString(),
    entries: col.entries.map((e) => ({
      ...e,
      updatedAt: e.updatedAt.toISOString(),
    })),
  }));
}

export async function createOfflineGradeColumn(
  classId: string,
  createdById: string,
  input: {
    title: string;
    date?: string | null;
    maxScore?: number;
    weight?: number;
    note?: string | null;
  }
) {
  await assertGradebookUnlocked(classId);
  const date = parseColumnDate(input.date) ?? new Date();
  const col = await prisma.offlineGradeColumn.create({
    data: {
      classId,
      createdById,
      title: input.title,
      date,
      maxScore: input.maxScore ?? 10,
      weight: input.weight ?? 1,
      note: input.note ?? null,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      entries: true,
    },
  });

  return {
    ...col,
    date: col.date.toISOString(),
    createdAt: col.createdAt.toISOString(),
    updatedAt: col.updatedAt.toISOString(),
    entries: [],
  };
}

export async function updateOfflineGradeColumn(
  classId: string,
  columnId: string,
  input: {
    title?: string;
    date?: string | null;
    maxScore?: number;
    weight?: number;
    note?: string | null;
  }
) {
  await assertGradebookUnlocked(classId);
  const existing = await prisma.offlineGradeColumn.findFirst({
    where: { id: columnId, classId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy cột điểm giấy.", 404, "NOT_FOUND");
  }

  const parsedDate = input.date !== undefined ? parseColumnDate(input.date) : undefined;
  const updated = await prisma.offlineGradeColumn.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(parsedDate !== undefined ? { date: parsedDate } : {}),
      ...(input.maxScore !== undefined ? { maxScore: input.maxScore } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  return {
    ...updated,
    date: updated.date.toISOString(),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteOfflineGradeColumn(classId: string, columnId: string) {
  await assertGradebookUnlocked(classId);
  const existing = await prisma.offlineGradeColumn.findFirst({
    where: { id: columnId, classId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("Không tìm thấy cột điểm giấy.", 404, "NOT_FOUND");
  }
  await prisma.offlineGradeColumn.delete({ where: { id: existing.id } });
  return { ok: true };
}

export async function saveOfflineGradeEntries(
  classId: string,
  columnId: string,
  entries: Array<{ studentId: string; score: number | null; note?: string | null }>
) {
  await assertGradebookUnlocked(classId);
  const col = await prisma.offlineGradeColumn.findFirst({
    where: { id: columnId, classId },
    select: { id: true, maxScore: true },
  });
  if (!col) {
    throw new AppError("Không tìm thấy cột điểm giấy.", 404, "NOT_FOUND");
  }

  const activeEnrollments = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    select: { studentId: true },
  });
  const activeStudentIds = new Set(activeEnrollments.map((e) => e.studentId));

  // Deduplicate by studentId (latest entry wins) while validating every item
  const deduped = new Map<
    string,
    { studentId: string; score: number | null; note?: string | null }
  >();
  for (const item of entries) {
    if (!activeStudentIds.has(item.studentId)) {
      throw new AppError(
        "Học sinh không thuộc lớp học này hoặc tài khoản đang bị xoá.",
        400,
        "STUDENT_NOT_IN_CLASS"
      );
    }
    if (
      item.score !== null &&
      (!Number.isFinite(item.score) || item.score < 0 || item.score > col.maxScore)
    ) {
      throw new AppError(
        `Điểm phải nằm trong khoảng 0 đến ${col.maxScore}.`,
        400,
        "INVALID_SCORE"
      );
    }
    deduped.set(item.studentId, item);
  }

  const items = Array.from(deduped.values());
  const saved = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const item of items) {
      const entry = await tx.offlineGradeEntry.upsert({
        where: {
          columnId_studentId: { columnId: col.id, studentId: item.studentId },
        },
        create: {
          columnId: col.id,
          studentId: item.studentId,
          score: item.score,
          note: item.note ?? null,
        },
        update: {
          score: item.score,
          ...(item.note !== undefined ? { note: item.note } : {}),
        },
      });
      out.push(entry);
    }
    return out;
  });

  return saved.map((e) => ({
    ...e,
    updatedAt: e.updatedAt.toISOString(),
  }));
}

function readCellText(cell: ExcelJS.Cell): string {
  const val = cell.value;
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if ("text" in val && typeof val.text === "string") return val.text.trim();
    if ("result" in val && val.result !== undefined) return String(val.result).trim();
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join("").trim();
    }
  }
  return String(cell.text ?? val).trim();
}

export interface OfflineGradeImportMatchedRow {
  rowNumber: number;
  studentId: string;
  studentName: string;
  studentEmail: string;
  score: number;
  note: string | null;
}

export interface OfflineGradeImportErrorRow {
  rowNumber: number;
  identifier: string;
  reason: string;
}

/**
 * Parses an uploaded .xlsx file and matches rows against enrolled students by email or exact name.
 * Supports header-based columns (Email / Name / Score / Note) or headerless 2–3 column layouts.
 */
export async function importOfflineGradesFromExcel(
  classId: string,
  columnId: string,
  buffer: Buffer,
  opts?: { commit?: boolean }
) {
  await assertGradebookUnlocked(classId);
  const col = await prisma.offlineGradeColumn.findFirst({
    where: { id: columnId, classId },
    select: { id: true, title: true, maxScore: true },
  });
  if (!col) {
    throw new AppError("Không tìm thấy cột điểm giấy.", 404, "NOT_FOUND");
  }
  if (buffer.byteLength <= 0 || buffer.byteLength > MAX_EXCEL_BYTES) {
    throw new AppError("File Excel không được vượt quá 5MB.", 400, "INVALID_FILE_SIZE");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new AppError("File không phải định dạng Excel (.xlsx) hợp lệ.", 400, "INVALID_EXCEL");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError("File Excel không có trang tính nào.", 400, "EMPTY_EXCEL");
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    select: {
      student: { select: { id: true, name: true, email: true } },
    },
  });

  const byEmail = new Map<string, { id: string; name: string; email: string }>();
  const byName = new Map<string, Array<{ id: string; name: string; email: string }>>();
  for (const e of enrollments) {
    byEmail.set(e.student.email.trim().toLowerCase(), e.student);
    const normName = e.student.name.trim().toLowerCase();
    const list = byName.get(normName) ?? [];
    list.push(e.student);
    byName.set(normName, list);
  }

  // Detect column mapping from row 1 if it contains recognizable headers
  const row1 = sheet.getRow(1);
  let emailCol = -1;
  let nameCol = -1;
  let scoreCol = -1;
  let noteCol = -1;
  const maxCol = Math.min(20, Math.max(4, row1.cellCount));
  for (let c = 1; c <= maxCol; c++) {
    const hdr = readCellText(row1.getCell(c)).toLowerCase();
    if (!hdr) continue;
    if (emailCol < 0 && /(email|e-mail|thư)/.test(hdr)) emailCol = c;
    else if (nameCol < 0 && /(họ.*tên|học sinh|student|name|tên)/.test(hdr)) nameCol = c;
    else if (scoreCol < 0 && /(điểm|score|grade|mark)/.test(hdr)) scoreCol = c;
    else if (noteCol < 0 && /(ghi chú|nhận xét|note|comment)/.test(hdr)) noteCol = c;
  }

  const hasHeader = scoreCol > 0 || emailCol > 0 || nameCol > 0;
  if (!hasHeader) {
    emailCol = 1;
    scoreCol = 2;
    noteCol = 3;
  } else if (scoreCol < 0) {
    // Header existed without explicit score column: choose next non-id column
    const used = new Set([emailCol, nameCol, noteCol].filter((n) => n > 0));
    for (let c = 1; c <= maxCol; c++) {
      if (!used.has(c)) {
        scoreCol = c;
        break;
      }
    }
  }

  const matchedMap = new Map<string, OfflineGradeImportMatchedRow>();
  const errors: OfflineGradeImportErrorRow[] = [];
  let totalRows = 0;

  sheet.eachRow((row, rowNumber) => {
    if (hasHeader && rowNumber === 1) return;

    const rawEmail = emailCol > 0 ? readCellText(row.getCell(emailCol)) : "";
    const rawName = nameCol > 0 ? readCellText(row.getCell(nameCol)) : "";
    const rawScore = scoreCol > 0 ? readCellText(row.getCell(scoreCol)) : "";
    const rawNote = noteCol > 0 ? readCellText(row.getCell(noteCol)) : "";

    if (!rawEmail && !rawName && !rawScore && !rawNote) return;
    totalRows++;

    const identifier = rawEmail || rawName || `Dòng ${rowNumber}`;
    let matchedStudent: { id: string; name: string; email: string } | undefined;

    if (rawEmail && rawEmail.includes("@")) {
      matchedStudent = byEmail.get(rawEmail.trim().toLowerCase());
    }
    if (!matchedStudent && !rawEmail.includes("@") && rawEmail) {
      // Headerless column 1 might contain student full name
      const candidates = byName.get(rawEmail.trim().toLowerCase()) ?? [];
      if (candidates.length === 1) {
        matchedStudent = candidates[0];
      } else if (candidates.length > 1) {
        errors.push({
          rowNumber,
          identifier,
          reason: "Trùng họ tên trong lớp, vui lòng dùng email.",
        });
        return;
      }
    }
    if (!matchedStudent && rawName) {
      const candidates = byName.get(rawName.trim().toLowerCase()) ?? [];
      if (candidates.length === 1) {
        matchedStudent = candidates[0];
      } else if (candidates.length > 1) {
        errors.push({
          rowNumber,
          identifier,
          reason: "Trùng họ tên trong lớp, vui lòng dùng email.",
        });
        return;
      }
    }

    if (!matchedStudent) {
      errors.push({
        rowNumber,
        identifier,
        reason: "Không tìm thấy học sinh trong lớp.",
      });
      return;
    }

    const numericStr = rawScore.replace(",", ".");
    const score = Number(numericStr);
    if (!rawScore || !Number.isFinite(score) || score < 0 || score > col.maxScore) {
      errors.push({
        rowNumber,
        identifier: matchedStudent.email,
        reason: `Điểm không hợp lệ (phải từ 0 đến ${col.maxScore}).`,
      });
      return;
    }

    matchedMap.set(matchedStudent.id, {
      rowNumber,
      studentId: matchedStudent.id,
      studentName: matchedStudent.name,
      studentEmail: matchedStudent.email,
      score,
      note: rawNote || null,
    });
  });

  const matched = Array.from(matchedMap.values());
  const shouldCommit = opts?.commit !== false;
  if (shouldCommit && matched.length > 0) {
    await saveOfflineGradeEntries(
      classId,
      col.id,
      matched.map((m) => ({ studentId: m.studentId, score: m.score, note: m.note }))
    );
  }

  return {
    columnId: col.id,
    columnTitle: col.title,
    maxScore: col.maxScore,
    totalRows,
    matched,
    errors,
    savedCount: shouldCommit ? matched.length : 0,
  };
}
