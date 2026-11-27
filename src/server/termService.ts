import JSZip from "jszip";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import { logAudit } from "./auditService";
import { exportClassGradebookExcel, exportStudentReportCardPdf } from "./gradebookService";

function termDTO(t: { id: string; name: string; startsAt: Date; endsAt: Date; isLocked: boolean; isActive: boolean; _count?: { classes: number } }) {
  return {
    id: t.id,
    name: t.name,
    startsAt: t.startsAt.toISOString(),
    endsAt: t.endsAt.toISOString(),
    isLocked: t.isLocked,
    isActive: t.isActive,
    classCount: t._count?.classes ?? 0,
  };
}

export async function listTerms() {
  const rows = await prisma.academicTerm.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { classes: true } } } });
  return rows.map(termDTO);
}

export async function saveTerm(
  actorId: string,
  input: { id?: string; name: string; startsAt: string; endsAt: string; isActive?: boolean; isLocked?: boolean; classIds?: string[] }
) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(endsAt > startsAt)) throw new AppError("Ngày kết thúc phải sau ngày bắt đầu.", 400, "VALIDATION_ERROR");
  const data = {
    name: input.name.trim().slice(0, 100),
    startsAt,
    endsAt,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
  };
  const term = input.id
    ? await prisma.academicTerm.update({ where: { id: input.id }, data })
    : await prisma.academicTerm.create({ data });
  if (input.classIds) {
    await prisma.class.updateMany({ where: { id: { in: input.classIds } }, data: { termId: term.id } });
  }
  await logAudit({
    actorId,
    action: "TERM_SAVED",
    targetType: "SYSTEM",
    targetId: term.id,
    summary: `Lưu học kỳ ${term.name}`,
    summaryEn: `Saved term ${term.name}`,
  });
  return termDTO({ ...term, _count: { classes: await prisma.class.count({ where: { termId: term.id } }) } });
}

/** Teachers (owner / co-teacher) lock at term end; only an admin can unlock. */
export async function setGradebookLock(classId: string, actor: { id: string; role: Role }, lock: boolean) {
  if (!lock && actor.role !== "ADMIN") {
    throw new AppError("Chỉ quản trị viên mới mở khoá sổ điểm.", 403, "FORBIDDEN");
  }
  const cls = await prisma.class.update({
    where: { id: classId },
    data: lock ? { gradebookLockedAt: new Date(), gradebookLockedById: actor.id } : { gradebookLockedAt: null, gradebookLockedById: null },
    select: { name: true, gradebookLockedAt: true },
  });
  await logAudit({
    actorId: actor.id,
    action: lock ? "GRADEBOOK_LOCKED" : "GRADEBOOK_UNLOCKED",
    targetType: "CLASS",
    targetId: classId,
    summary: `${lock ? "Khoá" : "Mở khoá"} sổ điểm lớp ${cls.name}`,
    summaryEn: `${lock ? "Locked" : "Unlocked"} the gradebook of ${cls.name}`,
  });
  return { gradebookLockedAt: cls.gradebookLockedAt?.toISOString() ?? null };
}

/** End-of-term archive: gradebook Excel + one PDF report card per active student, zipped. */
export async function buildTermArchiveZip(classId: string, locale: Locale = "vi") {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
  if (!cls) throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  const zip = new JSZip();
  const excel = await exportClassGradebookExcel(classId, undefined, locale);
  zip.file(excel.filename, excel.buffer);
  const students = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    orderBy: { student: { name: "asc" } },
    select: { studentId: true, student: { select: { name: true } } },
  });
  const folder = zip.folder(locale === "en" ? "report-cards" : "phieu-bao-diem")!;
  for (const [i, s] of students.entries()) {
    const pdf = await exportStudentReportCardPdf(classId, s.studentId, undefined, locale);
    const safe = s.student.name.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9 _-]/g, "").trim() || s.studentId;
    folder.file(`${String(i + 1).padStart(2, "0")}-${safe}.pdf`, pdf.buffer);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safeClass = cls.name.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9 _-]/g, "").trim() || "lop";
  return { buffer, filename: `tong-ket-${safeClass}.zip` };
}
