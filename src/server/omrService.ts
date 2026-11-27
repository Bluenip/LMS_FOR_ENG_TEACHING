import crypto from "crypto";
import type { OmrSheetTemplate, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasMinClassRole } from "@/lib/class-roles";
import { detectImageMeta } from "@/lib/image-meta";
import { getStorageProvider } from "@/lib/storage";
import { asOptionList } from "@/lib/grading/types";
import {
  summarizeReadings,
  type BubbleGroupReading,
  type OmrResolvedAnswers,
} from "@/lib/omr/bubble-reader";
import {
  defaultPointsConfig,
  gradeOmrAnswers,
  type OmrAnswerKeyByVariant,
  type OmrPointsConfig,
  type OmrVariantKey,
} from "@/lib/omr/grader";
import { buildOmrSheetPdf } from "@/lib/omr/pdf-sheet-generator";
import { studentSbd } from "@/lib/omr/sbd";
import { MC_CHOICES, TF_STATEMENTS, getOmrTemplate } from "@/lib/omr/templates";
import { resolveUserClassRole } from "./classRoleHelper";
import { createNotificationsBulk } from "./notificationService";
import { createOfflineGradeColumn, saveOfflineGradeEntries } from "./offlineGradeService";

export interface OmrActor {
  id: string;
  role: Role;
}

export const OMR_SCAN_MAX_BYTES = 8 * 1024 * 1024;

async function requireClassRole(actor: OmrActor, classId: string, min: "ASSISTANT" | "CO_TEACHER" = "ASSISTANT") {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  const role = await resolveUserClassRole(cls.id, actor.id, actor.role, cls.teacherId);
  if (!hasMinClassRole(role, min)) {
    throw new AppError("Bạn không có quyền quản lý lớp học này.", 403, "FORBIDDEN");
  }
  return cls;
}

async function loadSheetForTeacher(sheetId: string, actor: OmrActor, min: "ASSISTANT" | "CO_TEACHER" = "ASSISTANT") {
  const sheet = await prisma.omrExamSheet.findUnique({ where: { id: sheetId } });
  if (!sheet) throw new AppError("Không tìm thấy bài chấm phiếu tô.", 404, "NOT_FOUND");
  const cls = await requireClassRole(actor, sheet.classId, min);
  return { sheet, cls };
}

function parseKeys(raw: unknown): OmrAnswerKeyByVariant {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as OmrAnswerKeyByVariant) : {};
}

/** Largest number of MC answers in any variant key (used for the default 10-point split). */
function keyedMcCount(keys: OmrAnswerKeyByVariant): number {
  return Math.max(0, ...Object.values(keys).map((k) => Object.keys(k.mc ?? {}).length));
}

function parsePointsOverrides(raw: Partial<OmrPointsConfig> | null | undefined): Partial<OmrPointsConfig> {
  const out: Partial<OmrPointsConfig> = {};
  for (const k of ["mcPoints", "tfPoints", "saPoints"] as const) {
    const v = raw?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

function parsePoints(raw: unknown, template: OmrSheetTemplate): OmrPointsConfig {
  const d = defaultPointsConfig(template);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<OmrPointsConfig>;
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fb);
  return { mcPoints: num(r.mcPoints, d.mcPoints), tfPoints: num(r.tfPoints, d.tfPoints), saPoints: num(r.saPoints, d.saPoints) };
}

/** Class roster with SBDs; an SBD shared by two students is marked ambiguous (no auto-match). */
async function classRoster(classId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE", student: { deletedAt: null } },
    orderBy: { student: { name: "asc" } },
    select: { student: { select: { id: true, name: true } } },
  });
  const rows = enrollments.map((e) => ({ ...e.student, sbd: studentSbd(classId, e.student.id) }));
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.sbd, (counts.get(r.sbd) ?? 0) + 1));
  return rows.map((r) => ({ ...r, sbdUnique: counts.get(r.sbd) === 1 }));
}

// ---------------------------------------------------------------------------
// Answer key extraction from an existing worksheet / assignment (Phase 22 variants)
// ---------------------------------------------------------------------------

interface KeyField {
  id: string;
  type: string;
  placement: string;
  options: unknown;
  answerKey: unknown;
}

function variantKeyFromFields(
  template: OmrSheetTemplate,
  fields: KeyField[],
  optionOrder: Record<string, string[]> = {}
): OmrVariantKey {
  const t = getOmrTemplate(template);
  const key: Required<OmrVariantKey> = { mc: {}, tf: {}, sa: {} };
  let mcN = 0;
  let tfN = 0;
  let saN = 0;
  for (const f of fields) {
    const ak = (f.answerKey ?? {}) as Record<string, unknown>;
    if (f.type === "MULTIPLE_CHOICE" && mcN < t.mcCount) {
      const ids = optionOrder[f.id] ?? asOptionList(f.options).map((o) => o.id);
      const idx = typeof ak.correct === "string" ? ids.indexOf(ak.correct) : -1;
      mcN++;
      if (idx >= 0 && idx < MC_CHOICES.length) key.mc[String(mcN)] = MC_CHOICES[idx]!;
    } else if (f.type === "TRUE_FALSE_GROUP" && tfN < t.tfCount) {
      tfN++;
      const stmts = asOptionList(f.options).slice(0, 4);
      const correct = (ak.correct ?? {}) as Record<string, unknown>;
      const map: Record<string, boolean> = {};
      stmts.forEach((s, i) => {
        if (typeof correct[s.id] === "boolean") map[TF_STATEMENTS[i]!] = correct[s.id] as boolean;
      });
      if (Object.keys(map).length > 0) key.tf[String(tfN)] = map;
    } else if ((f.type === "TEXT" || f.type === "NUMBER") && saN < t.saCount) {
      saN++;
      const v =
        f.type === "NUMBER"
          ? typeof ak.value === "number" || typeof ak.value === "string"
            ? String(ak.value).replace(".", ",")
            : null
          : Array.isArray(ak.accepted) && typeof ak.accepted[0] === "string"
            ? ak.accepted[0]
            : null;
      if (v && v.length <= 4) key.sa[String(saN)] = v;
    }
  }
  return key;
}

async function keysFromSource(
  actor: OmrActor,
  classId: string,
  template: OmrSheetTemplate,
  src: { worksheetId?: string | null; assignmentId?: string | null }
): Promise<{ keys: OmrAnswerKeyByVariant; worksheetId: string | null }> {
  let worksheetId = src.worksheetId ?? null;
  let variants: Array<{ code: string; questionOrder: unknown; optionOrder: unknown }> = [];
  if (src.assignmentId) {
    const a = await prisma.assignment.findUnique({
      where: { id: src.assignmentId },
      select: { classId: true, worksheetId: true, examVariants: { orderBy: { code: "asc" } } },
    });
    if (!a || a.classId !== classId) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
    worksheetId = a.worksheetId;
    variants = a.examVariants;
  }
  if (!worksheetId) return { keys: {}, worksheetId: null };

  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: {
      ownerId: true,
      isShared: true,
      deletedAt: true,
      fields: {
        orderBy: { order: "asc" },
        select: { id: true, type: true, placement: true, options: true, answerKey: true },
      },
    },
  });
  if (!ws || ws.deletedAt) throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  if (!src.assignmentId && actor.role !== "ADMIN" && ws.ownerId !== actor.id && !ws.isShared) {
    throw new AppError("Bạn không có quyền dùng phiếu bài tập này.", 403, "FORBIDDEN");
  }

  if (variants.length === 0) {
    return { keys: { default: variantKeyFromFields(template, ws.fields) }, worksheetId };
  }
  const keys: OmrAnswerKeyByVariant = {};
  const byId = new Map<string, KeyField>(ws.fields.map((f) => [f.id, f]));
  for (const v of variants) {
    const order = Array.isArray(v.questionOrder) ? (v.questionOrder as string[]) : [];
    const ordered = [
      ...order.map((id) => byId.get(id)).filter((f): f is KeyField => f !== undefined),
      ...ws.fields.filter((f) => !order.includes(f.id)),
    ];
    keys[v.code] = variantKeyFromFields(template, ordered, (v.optionOrder ?? {}) as Record<string, string[]>);
  }
  return { keys, worksheetId };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export async function createOmrExamSheet(
  actor: OmrActor,
  input: {
    classId: string;
    title: string;
    template: OmrSheetTemplate;
    worksheetId?: string | null;
    assignmentId?: string | null;
    answerKeyByVariant?: OmrAnswerKeyByVariant | null;
    pointsConfig?: Partial<OmrPointsConfig> | null;
  }
) {
  await requireClassRole(actor, input.classId, "CO_TEACHER");
  let keys: OmrAnswerKeyByVariant = input.answerKeyByVariant ?? {};
  if (input.worksheetId || input.assignmentId) {
    keys = (await keysFromSource(actor, input.classId, input.template, input)).keys;
  }
  const sheet = await prisma.omrExamSheet.create({
    data: {
      ownerId: actor.id,
      classId: input.classId,
      assignmentId: input.assignmentId ?? null,
      title: input.title.trim().slice(0, 200),
      template: input.template,
      answerKeyByVariant: keys as Prisma.InputJsonValue,
      pointsConfig: {
        ...defaultPointsConfig(input.template, keyedMcCount(keys)),
        ...parsePointsOverrides(input.pointsConfig),
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return { id: sheet.id };
}

export async function listOmrSheets(actor: OmrActor, classId: string) {
  await requireClassRole(actor, classId);
  const rows = await prisma.omrExamSheet.findMany({
    where: { classId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      template: true,
      createdAt: true,
      offlineColumnId: true,
      _count: { select: { scans: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    template: r.template,
    scanCount: r._count.scans,
    synced: Boolean(r.offlineColumnId),
    createdAt: r.createdAt.toISOString(),
  }));
}

function scanDTO(s: {
  id: string;
  studentId: string | null;
  detectedSbd: string | null;
  variantCode: string | null;
  scanImageKey: string;
  score: number;
  maxScore: number;
  confidence: number;
  needsReview: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
  student?: { name: string } | null;
}) {
  return {
    id: s.id,
    studentId: s.studentId,
    studentName: s.student?.name ?? null,
    detectedSbd: s.detectedSbd,
    variantCode: s.variantCode,
    imageUrl: `/api/files/${s.scanImageKey}`,
    score: s.score,
    maxScore: s.maxScore,
    confidence: s.confidence,
    needsReview: s.needsReview,
    confirmedAt: s.confirmedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function getOmrSheetDetail(sheetId: string, actor: OmrActor) {
  const { sheet, cls } = await loadSheetForTeacher(sheetId, actor);
  const [scans, roster] = await Promise.all([
    prisma.omrScanResult.findMany({
      where: { sheetId },
      orderBy: { createdAt: "desc" },
      include: { student: { select: { name: true } } },
    }),
    classRoster(sheet.classId),
  ]);
  const keys = parseKeys(sheet.answerKeyByVariant);
  const points = parsePoints(sheet.pointsConfig, sheet.template);

  // Per-question correct rate over all scans
  const stats = new Map<string, { correct: number; total: number }>();
  for (const s of scans) {
    const answers = s.resolvedAnswers as unknown as OmrResolvedAnswers;
    const g = gradeOmrAnswers(sheet.template, answers, keys, points);
    for (const q of g.perQuestion) {
      const st = stats.get(q.key) ?? { correct: 0, total: 0 };
      st.total++;
      if (q.correct) st.correct++;
      stats.set(q.key, st);
    }
  }

  return {
    sheet: {
      id: sheet.id,
      classId: sheet.classId,
      className: cls.name,
      title: sheet.title,
      template: sheet.template,
      answerKeyByVariant: keys,
      pointsConfig: points,
      offlineColumnId: sheet.offlineColumnId,
      createdAt: sheet.createdAt.toISOString(),
    },
    roster: roster.map((r) => ({ id: r.id, name: r.name, sbd: r.sbd, sbdUnique: r.sbdUnique })),
    scans: scans.map(scanDTO),
    questionStats: Array.from(stats.entries()).map(([key, v]) => ({
      key,
      correct: v.correct,
      total: v.total,
      ratePct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    })),
  };
}

async function regradeSheetScans(sheetId: string) {
  const sheet = await prisma.omrExamSheet.findUniqueOrThrow({ where: { id: sheetId } });
  const keys = parseKeys(sheet.answerKeyByVariant);
  const points = parsePoints(sheet.pointsConfig, sheet.template);
  const scans = await prisma.omrScanResult.findMany({ where: { sheetId }, select: { id: true, resolvedAnswers: true } });
  for (const s of scans) {
    const g = gradeOmrAnswers(sheet.template, s.resolvedAnswers as unknown as OmrResolvedAnswers, keys, points);
    await prisma.omrScanResult.update({ where: { id: s.id }, data: { score: g.score, maxScore: g.maxScore } });
  }
}

export async function updateOmrSheet(
  sheetId: string,
  actor: OmrActor,
  input: { title?: string; answerKeyByVariant?: OmrAnswerKeyByVariant; pointsConfig?: Partial<OmrPointsConfig> }
) {
  const { sheet } = await loadSheetForTeacher(sheetId, actor, "CO_TEACHER");
  await prisma.omrExamSheet.update({
    where: { id: sheetId },
    data: {
      ...(input.title ? { title: input.title.trim().slice(0, 200) } : {}),
      ...(input.answerKeyByVariant ? { answerKeyByVariant: input.answerKeyByVariant as Prisma.InputJsonValue } : {}),
      ...(input.pointsConfig
        ? {
            pointsConfig: {
              ...parsePoints(sheet.pointsConfig, sheet.template),
              ...parsePointsOverrides(input.pointsConfig),
            } as unknown as Prisma.InputJsonValue,
          }
        : input.answerKeyByVariant && sheet.template !== "THPT_2025"
          ? {
              // a new MC key re-splits the 10 points over the keyed questions
              pointsConfig: defaultPointsConfig(sheet.template, keyedMcCount(input.answerKeyByVariant)) as unknown as Prisma.InputJsonValue,
            }
          : {}),
    },
  });
  if (input.answerKeyByVariant || input.pointsConfig) await regradeSheetScans(sheetId);
  return { ok: true };
}

export async function deleteOmrSheet(sheetId: string, actor: OmrActor) {
  await loadSheetForTeacher(sheetId, actor, "CO_TEACHER");
  const scans = await prisma.omrScanResult.findMany({ where: { sheetId }, select: { scanImageKey: true } });
  await prisma.omrExamSheet.delete({ where: { id: sheetId } });
  const storage = getStorageProvider();
  await Promise.all(scans.map((s) => storage.delete(s.scanImageKey).catch(() => undefined)));
  return { ok: true };
}

export async function generateOmrPdf(sheetId: string, actor: OmrActor, opts: { prefillStudents?: boolean }) {
  const { sheet, cls } = await loadSheetForTeacher(sheetId, actor);
  const students = opts.prefillStudents
    ? (await classRoster(sheet.classId)).map((r) => ({ name: r.name, sbd: r.sbd }))
    : [];
  const pdf = await buildOmrSheetPdf({ template: sheet.template, title: sheet.title, className: cls.name, students });
  const safe = sheet.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "omr";
  return { buffer: Buffer.from(pdf), filename: `${safe}.pdf` };
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

const READING_STATUSES = new Set(["OK", "BLANK", "FAINT", "MULTI"]);

/** Keeps only readings that belong to the template, with sane values (never trusts the client shape). */
function sanitizeReadings(template: OmrSheetTemplate, raw: unknown): BubbleGroupReading[] {
  const t = getOmrTemplate(template);
  const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const byKey = new Map(list.map((r) => [String(r?.key ?? ""), r]));
  return t.groups.map((g) => {
    const r = byKey.get(g.key);
    const allowed = new Set(g.bubbles.map((b) => b.value));
    const value = typeof r?.value === "string" && allowed.has(r.value) ? r.value : null;
    const status = typeof r?.status === "string" && READING_STATUSES.has(r.status) ? (r.status as BubbleGroupReading["status"]) : value ? "OK" : "BLANK";
    const fills = Array.isArray(r?.fills)
      ? (r.fills as unknown[]).slice(0, g.bubbles.length).map((f) => (typeof f === "number" && Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0))
      : [];
    return { key: g.key, value: status === "MULTI" ? null : value, status, fills };
  });
}

async function evaluateScan(
  sheet: { id: string; classId: string; template: OmrSheetTemplate; answerKeyByVariant: unknown; pointsConfig: unknown },
  readings: BubbleGroupReading[],
  studentOverride?: string | null
) {
  const summary = summarizeReadings(sheet.template, readings);
  const grade = gradeOmrAnswers(
    sheet.template,
    summary.answers,
    parseKeys(sheet.answerKeyByVariant),
    parsePoints(sheet.pointsConfig, sheet.template)
  );
  let studentId: string | null = null;
  if (studentOverride !== undefined) {
    studentId = studentOverride;
  } else if (summary.answers.sbd && !summary.answers.sbd.includes("?")) {
    const match = (await classRoster(sheet.classId)).find((r) => r.sbd === summary.answers.sbd && r.sbdUnique);
    studentId = match?.id ?? null;
  }
  return {
    summary,
    grade,
    studentId,
    needsReview: summary.reviewKeys.length > 0 || !studentId || grade.variantUsed === null,
  };
}

export async function saveOmrScanResult(
  sheetId: string,
  actor: OmrActor,
  input: { scanImageBuffer: Buffer; rawBubbles: unknown }
) {
  const { sheet } = await loadSheetForTeacher(sheetId, actor);
  if (input.scanImageBuffer.length === 0 || input.scanImageBuffer.length > OMR_SCAN_MAX_BYTES) {
    throw new AppError("Ảnh phiếu tối đa 8MB.", 400, "OMR_IMAGE_TOO_LARGE");
  }
  const meta = detectImageMeta(input.scanImageBuffer);
  if (!meta || meta.mime === "image/webp") {
    throw new AppError("Chỉ nhận ảnh phiếu JPG hoặc PNG.", 400, "OMR_IMAGE_INVALID");
  }

  const readings = sanitizeReadings(sheet.template, input.rawBubbles);
  const ev = await evaluateScan(sheet, readings);

  const key = `omr/${sheetId}/${crypto.randomUUID()}${meta.ext}`;
  await getStorageProvider().put(key, input.scanImageBuffer, meta.mime, {
    ownerId: actor.id,
    kind: "SUBMISSION_FILE",
    classId: sheet.classId,
    fileName: key.split("/").pop(),
  });

  const scan = await prisma.omrScanResult.create({
    data: {
      sheetId,
      studentId: ev.studentId,
      detectedSbd: ev.summary.answers.sbd,
      variantCode: ev.summary.answers.variantCode,
      scanImageKey: key,
      rawBubbles: readings as unknown as Prisma.InputJsonValue,
      resolvedAnswers: ev.summary.answers as unknown as Prisma.InputJsonValue,
      score: ev.grade.score,
      maxScore: ev.grade.maxScore,
      confidence: ev.summary.confidence,
      needsReview: ev.needsReview,
    },
    include: { student: { select: { name: true } } },
  });
  return { scan: scanDTO(scan), reviewKeys: ev.summary.reviewKeys };
}

async function loadScanForTeacher(scanId: string, actor: OmrActor) {
  const scan = await prisma.omrScanResult.findUnique({ where: { id: scanId }, include: { sheet: true } });
  if (!scan) throw new AppError("Không tìm thấy phiếu đã quét.", 404, "NOT_FOUND");
  await requireClassRole(actor, scan.sheet.classId);
  return scan;
}

/** Teacher fixes: edit flagged bubbles ({ "mc:5": "B" }, null = blank) and/or assign the student. */
export async function updateOmrScan(
  scanId: string,
  actor: OmrActor,
  input: { edits?: Record<string, string | null>; studentId?: string | null }
) {
  const scan = await loadScanForTeacher(scanId, actor);
  const t = getOmrTemplate(scan.sheet.template);
  const readings = sanitizeReadings(scan.sheet.template, scan.rawBubbles);
  for (const [k, v] of Object.entries(input.edits ?? {})) {
    const g = t.groups.find((x) => x.key === k);
    const r = readings.find((x) => x.key === k);
    if (!g || !r) throw new AppError("Câu trả lời không hợp lệ.", 400, "VALIDATION_ERROR");
    if (v !== null && !g.bubbles.some((b) => b.value === v)) {
      throw new AppError("Câu trả lời không hợp lệ.", 400, "VALIDATION_ERROR");
    }
    r.value = v;
    r.status = v === null ? "BLANK" : "OK";
  }

  let studentOverride: string | null | undefined = undefined;
  if (input.studentId !== undefined) {
    if (input.studentId !== null) {
      const enr = await prisma.enrollment.findUnique({
        where: { classId_studentId: { classId: scan.sheet.classId, studentId: input.studentId } },
        select: { status: true, student: { select: { deletedAt: true } } },
      });
      if (!enr || enr.status !== "ACTIVE" || enr.student.deletedAt) {
        throw new AppError("Học sinh không thuộc lớp này.", 400, "OMR_STUDENT_NOT_IN_CLASS");
      }
    }
    studentOverride = input.studentId;
  } else {
    studentOverride = scan.studentId;
  }

  const ev = await evaluateScan(scan.sheet, readings, studentOverride);
  const updated = await prisma.omrScanResult.update({
    where: { id: scanId },
    data: {
      studentId: ev.studentId,
      detectedSbd: ev.summary.answers.sbd,
      variantCode: ev.summary.answers.variantCode,
      rawBubbles: readings as unknown as Prisma.InputJsonValue,
      resolvedAnswers: ev.summary.answers as unknown as Prisma.InputJsonValue,
      score: ev.grade.score,
      maxScore: ev.grade.maxScore,
      confidence: ev.summary.confidence,
      needsReview: ev.needsReview,
    },
    include: { student: { select: { name: true } } },
  });
  return { scan: scanDTO(updated), reviewKeys: ev.summary.reviewKeys };
}

export async function deleteOmrScan(scanId: string, actor: OmrActor) {
  const scan = await loadScanForTeacher(scanId, actor);
  await prisma.omrScanResult.delete({ where: { id: scanId } });
  await getStorageProvider().delete(scan.scanImageKey).catch(() => undefined);
  return { ok: true };
}

/**
 * Pushes the latest reviewed scan of each student into an offline gradebook column (created once,
 * then updated) and notifies students + verified parents the first time a scan is confirmed.
 */
export async function confirmAndSyncOmrToGradebook(sheetId: string, actor: OmrActor) {
  const { sheet } = await loadSheetForTeacher(sheetId, actor, "CO_TEACHER");
  const scans = await prisma.omrScanResult.findMany({
    where: { sheetId, studentId: { not: null }, needsReview: false },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<string, (typeof scans)[number]>();
  for (const s of scans) if (!latest.has(s.studentId!)) latest.set(s.studentId!, s);
  const pending = await prisma.omrScanResult.count({ where: { sheetId, OR: [{ needsReview: true }, { studentId: null }] } });
  if (latest.size === 0) {
    throw new AppError("Chưa có phiếu nào đã duyệt để đẩy điểm.", 400, "OMR_NOTHING_TO_SYNC");
  }

  const maxScore = Math.max(...Array.from(latest.values()).map((s) => s.maxScore), 1);
  let columnId = sheet.offlineColumnId;
  if (columnId) {
    const exists = await prisma.offlineGradeColumn.findFirst({ where: { id: columnId, classId: sheet.classId } });
    if (exists) {
      await prisma.offlineGradeColumn.update({ where: { id: columnId }, data: { title: sheet.title.slice(0, 120), maxScore } });
    } else {
      columnId = null;
    }
  }
  if (!columnId) {
    const col = await createOfflineGradeColumn(sheet.classId, actor.id, {
      title: sheet.title.slice(0, 120),
      maxScore,
      note: "OMR",
    });
    columnId = col.id;
    await prisma.omrExamSheet.update({ where: { id: sheetId }, data: { offlineColumnId: columnId } });
  }

  await saveOfflineGradeEntries(
    sheet.classId,
    columnId,
    Array.from(latest.values()).map((s) => ({ studentId: s.studentId!, score: s.score }))
  );

  const newlyConfirmed = Array.from(latest.values()).filter((s) => !s.confirmedAt);
  const now = new Date();
  await prisma.omrScanResult.updateMany({
    where: { id: { in: Array.from(latest.values()).map((s) => s.id) } },
    data: { confirmedAt: now, confirmedById: actor.id },
  });

  if (newlyConfirmed.length > 0) {
    const studentIds = newlyConfirmed.map((s) => s.studentId!);
    const parents = await prisma.parentLink.findMany({
      where: { studentId: { in: studentIds }, verifiedAt: { not: null } },
      select: { parentId: true, studentId: true, student: { select: { name: true } } },
    });
    const scoreOf = new Map(newlyConfirmed.map((s) => [s.studentId!, s]));
    await createNotificationsBulk([
      ...newlyConfirmed.map((s) => ({
        userId: s.studentId!,
        type: "SUBMISSION_GRADED" as const,
        title: `Đã có điểm bài kiểm tra giấy: ${sheet.title}`.slice(0, 200),
        body: `Điểm: ${s.score}/${s.maxScore}. Bấm để xem lại phiếu tô đã chấm.`,
        link: `/student/classes/${sheet.classId}?omrScan=${s.id}`,
      })),
      ...parents.map((p) => {
        const s = scoreOf.get(p.studentId)!;
        return {
          userId: p.parentId,
          type: "SUBMISSION_GRADED" as const,
          title: `${p.student.name}: điểm bài kiểm tra giấy ${sheet.title}`.slice(0, 200),
          body: `Điểm: ${s.score}/${s.maxScore}. Bấm để xem ảnh phiếu tô đã chấm.`,
          link: `/parent?childId=${p.studentId}&omrScan=${s.id}`,
        };
      }),
    ]);
  }

  return { columnId, syncedCount: latest.size, skippedCount: pending };
}

// ---------------------------------------------------------------------------
// Viewing (teacher / owning student / verified parent)
// ---------------------------------------------------------------------------

async function canViewScan(
  user: OmrActor,
  scan: { studentId: string | null; confirmedAt: Date | null; sheet: { classId: string } }
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "TEACHER") {
    const cls = await prisma.class.findUnique({ where: { id: scan.sheet.classId }, select: { teacherId: true, deletedAt: true } });
    if (!cls || cls.deletedAt) return false;
    const role = await resolveUserClassRole(scan.sheet.classId, user.id, user.role, cls.teacherId);
    return hasMinClassRole(role, "ASSISTANT");
  }
  if (!scan.confirmedAt || !scan.studentId) return false;
  if (user.role === "STUDENT") return scan.studentId === user.id;
  if (user.role === "PARENT") {
    const link = await prisma.parentLink.findUnique({
      where: { parentId_studentId: { parentId: user.id, studentId: scan.studentId } },
      select: { verifiedAt: true },
    });
    return Boolean(link?.verifiedAt);
  }
  return false;
}

/** Authorizes /api/files/omr/{sheetId}/{uuid}.{jpg|png}. */
export async function authorizeOmrFile(user: OmrActor, fileKey: string): Promise<boolean> {
  const scan = await prisma.omrScanResult.findFirst({
    where: { scanImageKey: fileKey },
    select: { studentId: true, confirmedAt: true, sheet: { select: { classId: true } } },
  });
  if (!scan) return false;
  return canViewScan(user, scan);
}

export async function getOmrScanView(scanId: string, user: OmrActor) {
  const scan = await prisma.omrScanResult.findUnique({
    where: { id: scanId },
    include: { sheet: true, student: { select: { name: true } } },
  });
  if (!scan || !(await canViewScan(user, scan))) {
    throw new AppError("Không tìm thấy phiếu đã quét.", 404, "NOT_FOUND");
  }
  const answers = scan.resolvedAnswers as unknown as OmrResolvedAnswers;
  const grade = gradeOmrAnswers(
    scan.sheet.template,
    answers,
    parseKeys(scan.sheet.answerKeyByVariant),
    parsePoints(scan.sheet.pointsConfig, scan.sheet.template)
  );
  const isStaff = user.role === "ADMIN" || user.role === "TEACHER";
  return {
    scan: scanDTO(scan),
    sheet: { id: scan.sheet.id, title: scan.sheet.title, template: scan.sheet.template, classId: scan.sheet.classId },
    readings: scan.rawBubbles as unknown as BubbleGroupReading[],
    answers,
    perQuestion: grade.perQuestion,
    // the expected answers are only shown to staff (students see correct / wrong marks)
    expected: isStaff ? (parseKeys(scan.sheet.answerKeyByVariant)[grade.variantUsed ?? ""] ?? null) : null,
  };
}

export async function listMyOmrScans(user: OmrActor, opts: { studentId?: string | null; classId?: string | null }) {
  let studentId: string;
  if (user.role === "STUDENT") {
    studentId = user.id;
  } else if (user.role === "PARENT" && opts.studentId) {
    const link = await prisma.parentLink.findUnique({
      where: { parentId_studentId: { parentId: user.id, studentId: opts.studentId } },
      select: { verifiedAt: true },
    });
    if (!link?.verifiedAt) throw new AppError("Bạn không có quyền xem thông tin học sinh này.", 403, "FORBIDDEN");
    studentId = opts.studentId;
  } else {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }
  const rows = await prisma.omrScanResult.findMany({
    where: {
      studentId,
      confirmedAt: { not: null },
      ...(opts.classId ? { sheet: { classId: opts.classId } } : {}),
    },
    orderBy: { confirmedAt: "desc" },
    take: 50,
    include: { sheet: { select: { title: true, classId: true, offlineColumnId: true, class: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.sheet.title,
    className: r.sheet.class.name,
    classId: r.sheet.classId,
    offlineColumnId: r.sheet.offlineColumnId,
    score: r.score,
    maxScore: r.maxScore,
    confirmedAt: r.confirmedAt!.toISOString(),
  }));
}
