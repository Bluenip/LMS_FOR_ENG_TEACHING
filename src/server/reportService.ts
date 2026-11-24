import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { compareQuestionLabels } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";

function formatAnswerDisplay(value: unknown): string {
  if (value === null || value === undefined) return "(Bỏ trống)";
  if (typeof value === "boolean") return value ? "Đúng / Có" : "Sai / Không";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(Bỏ trống)";
  const str = String(value).trim();
  return str.length > 0 ? str : "(Bỏ trống)";
}

export async function getAssignmentReport(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: {
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: { student: { select: { id: true, name: true, email: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
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

  const totalStudents = assignment.class.enrollments.length;
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
  const sortedEnrollments = [...assignment.class.enrollments].sort((a, b) =>
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
      score: best ? (best.totalScore ?? best.autoScore ?? null) : null,
      maxScore: best?.maxScore ?? maxPossibleScore,
      scoreScale10:
        best && best.maxScore > 0 && (best.totalScore ?? best.autoScore) !== null
          ? Math.round(((best.totalScore ?? best.autoScore ?? 0) / best.maxScore) * 1000) / 100
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
        if (field.type !== "ESSAY") {
          graded++;
          wrongFreq.set("(Bỏ trống)", (wrongFreq.get("(Bỏ trống)") ?? 0) + 1);
        }
        continue;
      }
      if (ans.isCorrect === true) {
        correct++;
        graded++;
      } else if (ans.isCorrect === false) {
        graded++;
        const display = formatAnswerDisplay(ans.value);
        wrongFreq.set(display, (wrongFreq.get(display) ?? 0) + 1);
      }
    }

    const correctRate = graded > 0 ? Math.round((correct / graded) * 100) : 0;
    const commonWrongAnswers = Array.from(wrongFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([answer, count]) => ({ answer, count }));

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

export async function generateAssignmentGradebookExcel(assignmentId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const report = await getAssignmentReport(assignmentId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EngClass LMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Bảng điểm");
  sheet.columns = [
    { header: "STT", key: "stt", width: 6 },
    { header: "Họ và tên", key: "name", width: 28 },
    { header: "Email", key: "email", width: 30 },
    { header: "Trạng thái", key: "status", width: 18 },
    { header: "Nộp trễ", key: "isLate", width: 12 },
    { header: "Số câu đúng", key: "correct", width: 14 },
    { header: "Điểm", key: "score", width: 12 },
    { header: "Điểm tối đa", key: "maxScore", width: 14 },
    { header: "Quy đổi thang 10", key: "scale10", width: 18 },
    { header: "Vi phạm thi", key: "violations", width: 14 },
    { header: "Thời gian nộp", key: "submittedAt", width: 22 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };

  const statusLabels: Record<string, string> = {
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
      isLate: row.isLate ? "Trễ hạn" : "",
      correct: `${row.correctCount}/${row.totalQuestions}`,
      score: row.score ?? "",
      maxScore: row.maxScore,
      scale10: row.scoreScale10 ?? "",
      violations: row.violationCount,
      submittedAt: formatDateTime(row.submittedAt),
    });
  });

  // Second sheet: Question Analytics
  const qSheet = workbook.addWorksheet("Thống kê từng câu");
  qSheet.columns = [
    { header: "Câu", key: "label", width: 12 },
    { header: "Loại", key: "type", width: 18 },
    { header: "Kỹ năng", key: "skill", width: 15 },
    { header: "Điểm", key: "points", width: 10 },
    { header: "Số HS đúng", key: "correctCount", width: 14 },
    { header: "Tổng bài", key: "totalGraded", width: 12 },
    { header: "Tỉ lệ đúng (%)", key: "correctRate", width: 16 },
    { header: "Đáp án sai phổ biến", key: "wrong", width: 40 },
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
    filename: `Bang_diem_${safeName || assignmentId}.xlsx`,
  };
}
