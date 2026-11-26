import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import { isManualFieldType, isPhotoUploadAnswer, isTrueFalseGroupAnswer } from "@/lib/grading";
import { convertScoreToScale, scoreScaleLabel } from "@/lib/score-scale";
import { compareQuestionLabels, formatDateTime } from "@/lib/utils";

export type WrongAnswerCode = "BLANK" | "TRUE" | "FALSE";

export interface CommonWrongAnswer {
  answer: string;
  code?: WrongAnswerCode;
  count: number;
}

const CODE_KEY_PREFIX = "__CODE__:";

function formatWrongAnswerKey(value: unknown, locale: Locale): string {
  if (value === null || value === undefined) return `${CODE_KEY_PREFIX}BLANK`;
  if (typeof value === "boolean") return `${CODE_KEY_PREFIX}${value ? "TRUE" : "FALSE"}`;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : `${CODE_KEY_PREFIX}BLANK`;
  }
  if (isPhotoUploadAnswer(value)) {
    return value.files.length > 0
      ? locale === "en"
        ? `${value.files.length} file(s)`
        : `${value.files.length} file`
      : `${CODE_KEY_PREFIX}BLANK`;
  }
  if (isTrueFalseGroupAnswer(value)) {
    const entries = Object.entries(value)
      .filter(([, v]) => typeof v === "boolean")
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return `${CODE_KEY_PREFIX}BLANK`;
    return entries
      .map(([k, v]) => `${k}:${v ? (locale === "en" ? "T" : "Đ") : locale === "en" ? "F" : "S"}`)
      .join(" ");
  }
  const str = String(value).trim();
  return str.length > 0 ? str : `${CODE_KEY_PREFIX}BLANK`;
}

function wrongAnswerLabel(code: WrongAnswerCode, locale: Locale): string {
  if (code === "BLANK") return locale === "en" ? "(Blank)" : "(Bỏ trống)";
  if (code === "TRUE") return locale === "en" ? "True / Yes" : "Đúng / Có";
  return locale === "en" ? "False / No" : "Sai / Không";
}

function hydrateWrongAnswer(rawKey: string, count: number, locale: Locale): CommonWrongAnswer {
  if (rawKey.startsWith(CODE_KEY_PREFIX)) {
    const code = rawKey.slice(CODE_KEY_PREFIX.length) as WrongAnswerCode;
    return { code, answer: wrongAnswerLabel(code, locale), count };
  }
  return { answer: rawKey, count };
}

export async function getAssignmentReport(assignmentId: string, locale: Locale = "vi") {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: {
        include: {
          enrollments: {
            where: { status: "ACTIVE", student: { deletedAt: null } },
            include: { student: { select: { id: true, name: true, email: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
      targets: { select: { studentId: true } },
      overrides: true,
      worksheet: {
        include: {
          fields: { orderBy: { order: "asc" } },
        },
      },
      submissions: {
        orderBy: [{ attemptNo: "desc" }],
        include: {
          student: { select: { id: true, name: true, email: true } },
          answers: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const targetSet =
    assignment.targets.length > 0
      ? new Set(assignment.targets.map((t) => t.studentId))
      : null;
  const scopedEnrollments = targetSet
    ? assignment.class.enrollments.filter((e) => targetSet.has(e.studentId))
    : assignment.class.enrollments;
  const overrideByStudent = new Map(assignment.overrides.map((o) => [o.studentId, o]));

  const totalStudents = scopedEnrollments.length;
  const fields = assignment.worksheet.fields;
  const maxPossibleScore = fields.reduce((s, f) => s + f.points, 0);

  // Group submissions by student (latest & best)
  const subsByStudent = new Map<string, (typeof assignment.submissions)[number][]>();
  for (const sub of assignment.submissions) {
    const arr = subsByStudent.get(sub.studentId) ?? [];
    arr.push(sub);
    subsByStudent.set(sub.studentId, arr);
  }

  const viCollator = new Intl.Collator("vi", { sensitivity: "base" });
  const sortedEnrollments = [...scopedEnrollments].sort((a, b) =>
    viCollator.compare(a.student.name, b.student.name)
  );
  const studentRows = sortedEnrollments.map((enr) => {
    const list = subsByStudent.get(enr.studentId) ?? [];
    const latest = list[0] ?? null;
    const completed = list.filter((s) => s.status !== "IN_PROGRESS");
    const best =
      completed.length > 0
        ? completed.reduce((b, cur) =>
            (cur.totalScore ?? cur.autoScore ?? 0) > (b.totalScore ?? b.autoScore ?? 0) ? cur : b
          )
        : latest;

    const correctCount = best
      ? best.answers.filter((a) => a.isCorrect === true).length
      : 0;
    const durationMs =
      best && best.submittedAt
        ? Math.max(0, best.submittedAt.getTime() - best.startedAt.getTime())
        : null;
    const ov = overrideByStudent.get(enr.studentId) ?? null;
    const rawScore = best ? (best.totalScore ?? best.autoScore ?? null) : null;
    const rowMax = best?.maxScore ?? maxPossibleScore;

    return {
      studentId: enr.student.id,
      studentName: enr.student.name,
      studentEmail: enr.student.email,
      submissionId: best?.id ?? null,
      attemptCount: list.length,
      attemptNo: best?.attemptNo ?? null,
      status: best ? best.status : ("NOT_STARTED" as const),
      isLate: best?.isLate ?? false,
      flagged: best?.flagged ?? false,
      lockedAt: best?.lockedAt?.toISOString() ?? null,
      violationCount: best?.violationCount ?? 0,
      score: rawScore,
      maxScore: rowMax,
      scoreScale10:
        best && rowMax > 0 && rawScore !== null
          ? Math.round((rawScore / rowMax) * 1000) / 100
          : null,
      scaledScore:
        rawScore !== null
          ? convertScoreToScale(rawScore, rowMax, assignment.scoreScale)
          : null,
      override: ov
        ? {
            extraAttempts: ov.extraAttempts,
            dueAt: ov.dueAt?.toISOString() ?? null,
            timeLimitMin: ov.timeLimitMin,
            note: ov.note,
          }
        : null,
      correctCount,
      totalQuestions: fields.length,
      durationMs,
      submittedAt: best?.submittedAt?.toISOString() ?? null,
    };
  });

  const submittedRows = studentRows.filter(
    (r) => r.status === "SUBMITTED" || r.status === "GRADED"
  );
  // Score statistics only use fully graded submissions: a SUBMITTED one still has an
  // ungraded essay, so its score is provisional and would drag the class average down.
  const scores10 = submittedRows
    .filter((r) => r.status === "GRADED" && !r.flagged)
    .map((r) => r.scoreScale10)
    .filter((v): v is number => v !== null);

  const avgScore10 =
    scores10.length > 0
      ? Math.round((scores10.reduce((a, b) => a + b, 0) / scores10.length) * 100) / 100
      : 0;
  const highestScore10 = scores10.length > 0 ? Math.max(...scores10) : 0;
  const lowestScore10 = scores10.length > 0 ? Math.min(...scores10) : 0;
  const variance =
    scores10.length > 0
      ? scores10.reduce((sum, s) => sum + (s - avgScore10) ** 2, 0) / scores10.length
      : 0;
  const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;

  // Per-question analytics using each student's best completed submission
  const bestSubmissionIds = new Set(
    submittedRows.map((r) => r.submissionId).filter((id): id is string => Boolean(id))
  );
  const analyzedSubs = assignment.submissions.filter((s) => bestSubmissionIds.has(s.id));

  const questionAnalytics = [...fields]
    .sort((a, b) => compareQuestionLabels(a.label, b.label))
    .map((field) => {
    let correct = 0;
    let graded = 0;
    const wrongFreq = new Map<string, number>();

    for (const sub of analyzedSubs) {
      const ans = sub.answers.find((a) => a.fieldId === field.id);
      if (!ans) {
        if (!isManualFieldType(field.type)) {
          graded++;
          const blankKey = `${CODE_KEY_PREFIX}BLANK`;
          wrongFreq.set(blankKey, (wrongFreq.get(blankKey) ?? 0) + 1);
        }
        continue;
      }
      if (ans.isCorrect === true) {
        correct++;
        graded++;
      } else if (ans.isCorrect === false) {
        graded++;
        const displayKey = formatWrongAnswerKey(ans.value, locale);
        wrongFreq.set(displayKey, (wrongFreq.get(displayKey) ?? 0) + 1);
      }
    }

    const correctRate = graded > 0 ? Math.round((correct / graded) * 100) : 0;
    const commonWrongAnswers = Array.from(wrongFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([rawKey, count]) => hydrateWrongAnswer(rawKey, count, locale));

    return {
      fieldId: field.id,
      label: field.label,
      type: field.type,
      skillTag: field.skillTag,
      points: field.points,
      correctCount: correct,
      totalGraded: graded,
      correctRate,
      commonWrongAnswers,
    };
  });

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      classId: assignment.class.id,
      className: assignment.class.name,
      worksheetId: assignment.worksheet.id,
      worksheetTitle: assignment.worksheet.title,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      proctorMode: assignment.proctorMode,
      scoreScale: assignment.scoreScale,
      weight: assignment.weight,
      isTargeted: assignment.targets.length > 0,
      targetCount: assignment.targets.length,
      totalQuestions: fields.length,
      maxScore: Math.round(maxPossibleScore * 100) / 100,
    },
    summary: {
      totalStudents,
      submittedCount: submittedRows.length,
      pendingManualCount: studentRows.filter((r) => r.status === "SUBMITTED").length,
      avgScore10,
      highestScore10,
      lowestScore10,
      stdDev,
    },
    studentRows,
    questionAnalytics,
  };
}

export async function generateAssignmentGradebookExcel(
  assignmentId: string,
  locale: Locale = "vi"
): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const report = await getAssignmentReport(assignmentId, locale);
  const isEn = locale === "en";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pivora";
  workbook.created = new Date();

  const scale = report.assignment.scoreScale;
  const trFn = (viText: string, enText: string) => (isEn ? enText : viText);
  const sheet = workbook.addWorksheet(isEn ? "Gradebook" : "Bảng điểm");
  sheet.columns = [
    { header: isEn ? "#" : "STT", key: "stt", width: 6 },
    { header: isEn ? "Full name" : "Họ và tên", key: "name", width: 28 },
    { header: "Email", key: "email", width: 30 },
    { header: isEn ? "Status" : "Trạng thái", key: "status", width: 18 },
    { header: isEn ? "Late" : "Nộp trễ", key: "isLate", width: 12 },
    { header: isEn ? "Correct" : "Số câu đúng", key: "correct", width: 14 },
    { header: isEn ? "Score" : "Điểm", key: "score", width: 12 },
    { header: isEn ? "Max score" : "Điểm tối đa", key: "maxScore", width: 14 },
    { header: isEn ? "Scale 10" : "Quy đổi thang 10", key: "scale10", width: 18 },
    ...(scale !== "SCALE_10"
      ? [{ header: scoreScaleLabel(scale, trFn), key: "scaled", width: 18 }]
      : []),
    { header: isEn ? "Violations" : "Vi phạm thi", key: "violations", width: 14 },
    { header: isEn ? "Submitted at" : "Thời gian nộp", key: "submittedAt", width: 22 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };

  const statusLabels: Record<string, string> = isEn
    ? {
        NOT_STARTED: "Not started",
        IN_PROGRESS: "In progress",
        SUBMITTED: "Awaiting essay grading",
        GRADED: "Graded",
      }
    : {
        NOT_STARTED: "Chưa làm",
        IN_PROGRESS: "Đang làm",
        SUBMITTED: "Chờ chấm tự luận",
        GRADED: "Đã chấm",
      };

  report.studentRows.forEach((row, idx) => {
    sheet.addRow({
      stt: idx + 1,
      name: row.studentName,
      email: row.studentEmail,
      status: statusLabels[row.status] ?? row.status,
      isLate: row.isLate ? (isEn ? "Late" : "Trễ hạn") : "",
      correct: `${row.correctCount}/${row.totalQuestions}`,
      score: row.score ?? "",
      maxScore: row.maxScore,
      scale10: row.scoreScale10 ?? "",
      ...(scale !== "SCALE_10" ? { scaled: row.scaledScore?.formatted ?? "" } : {}),
      violations: row.violationCount,
      submittedAt: formatDateTime(row.submittedAt, locale),
    });
  });

  // Second sheet: Question Analytics
  const qSheet = workbook.addWorksheet(isEn ? "Question Analytics" : "Thống kê từng câu");
  qSheet.columns = [
    { header: isEn ? "Question" : "Câu", key: "label", width: 12 },
    { header: isEn ? "Type" : "Loại", key: "type", width: 18 },
    { header: isEn ? "Skill" : "Kỹ năng", key: "skill", width: 15 },
    { header: isEn ? "Points" : "Điểm", key: "points", width: 10 },
    { header: isEn ? "Correct count" : "Số HS đúng", key: "correctCount", width: 14 },
    { header: isEn ? "Total graded" : "Tổng bài", key: "totalGraded", width: 12 },
    { header: isEn ? "Correct rate (%)" : "Tỉ lệ đúng (%)", key: "correctRate", width: 16 },
    { header: isEn ? "Common wrong answers" : "Đáp án sai phổ biến", key: "wrong", width: 40 },
  ];
  const qHeader = qSheet.getRow(1);
  qHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  qHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF005338" },
  };
  for (const q of report.questionAnalytics) {
    qSheet.addRow({
      label: q.label,
      type: q.type,
      skill: q.skillTag ?? "",
      points: q.points,
      correctCount: q.correctCount,
      totalGraded: q.totalGraded,
      correctRate: q.correctRate,
      wrong: q.commonWrongAnswers.map((w) => `${w.answer} (${w.count})`).join("; "),
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const safeName = report.assignment.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 60);

  return {
    buffer: Buffer.from(arrayBuffer),
    filename: `${isEn ? "Gradebook" : "Bang_diem"}_${safeName || assignmentId}.xlsx`,
  };
}

/**
 * Loads submissions grouped for a single question (Grade-by-Question workflow).
 */
export async function getAssignmentQuestionGradingData(
  assignmentId: string,
  requestedFieldId?: string
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: { select: { id: true, name: true } },
      targets: { select: { studentId: true } },
      worksheet: {
        include: {
          fields: { orderBy: { order: "asc" } },
          audios: { orderBy: { order: "asc" } },
        },
      },
      submissions: {
        where: { status: { in: ["SUBMITTED", "GRADED"] } },
        orderBy: [{ attemptNo: "desc" }],
        include: {
          student: { select: { id: true, name: true, email: true } },
          answers: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const targetSet =
    assignment.targets.length > 0
      ? new Set(assignment.targets.map((t) => t.studentId))
      : null;

  // One latest completed submission per student
  const latestByStudent = new Map<string, (typeof assignment.submissions)[number]>();
  for (const sub of assignment.submissions) {
    if (targetSet && !targetSet.has(sub.studentId)) continue;
    if (!latestByStudent.has(sub.studentId)) {
      latestByStudent.set(sub.studentId, sub);
    }
  }
  const subs = Array.from(latestByStudent.values());

  const fieldsMeta = assignment.worksheet.fields.map((f) => {
    let ungradedCount = 0;
    for (const s of subs) {
      const ans = s.answers.find((a) => a.fieldId === f.id);
      if (isManualFieldType(f.type) && (ans?.score === null || ans?.score === undefined)) {
        ungradedCount++;
      }
    }
    return {
      id: f.id,
      label: f.label,
      type: f.type,
      prompt: f.prompt,
      points: f.points,
      rubric: f.rubric,
      options: f.options,
      answerKey: f.answerKey,
      ungradedCount,
    };
  });

  const selectedField =
    (requestedFieldId ? fieldsMeta.find((f) => f.id === requestedFieldId) : null) ??
    fieldsMeta.find((f) => f.ungradedCount > 0) ??
    fieldsMeta[0] ??
    null;

  const viCollator = new Intl.Collator("vi", { sensitivity: "base" });
  const orderedSubs = [...subs].sort((a, b) => viCollator.compare(a.student.name, b.student.name));

  const items = selectedField
    ? orderedSubs.map((s) => {
        const ans = s.answers.find((a) => a.fieldId === selectedField.id) ?? null;
        return {
          submissionId: s.id,
          attemptNo: s.attemptNo,
          status: s.status,
          submittedAt: s.submittedAt?.toISOString() ?? null,
          student: s.student,
          answer: ans
            ? {
                value: ans.value,
                score: ans.score,
                isCorrect: ans.isCorrect,
                teacherNote: ans.teacherNote,
                rubricScores: ans.rubricScores,
                annotations: ans.annotations,
              }
            : null,
        };
      })
    : [];

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      classId: assignment.class.id,
      className: assignment.class.name,
      scoreScale: assignment.scoreScale,
    },
    fields: fieldsMeta,
    selectedField,
    items,
  };
}
