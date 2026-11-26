import ExcelJS from "exceljs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  computeSubmissionRatePct,
  computeWeightedAvg10,
  isWithinDateRange,
  normalizeToScale10,
  round2,
  type GradebookDateRange,
  type GradebookScoreItem,
} from "@/lib/gradebook-calc";
import { loadNotoFonts, wrapText } from "@/lib/pdf/export-printable-pdf";
import { formatDateTime } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/config";

export interface GradebookOnlineColumnDTO {
  id: string;
  title: string;
  date: string;
  maxScore: number;
  weight: number;
  isQuickTextbook: boolean;
  classAvg10: number | null;
}

export interface GradebookOfflineColumnDTO {
  id: string;
  title: string;
  date: string;
  maxScore: number;
  weight: number;
  note: string | null;
  classAvg10: number | null;
}

export interface GradebookOnlineCellDTO {
  score: number | null;
  maxScore: number;
  score10: number | null;
  status: "GRADED" | "SUBMITTED" | "MISSING" | "NOT_TARGETED";
  submittedAt: string | null;
  teacherComment: string | null;
}

export interface GradebookOfflineCellDTO {
  score: number | null;
  maxScore: number;
  score10: number | null;
  note: string | null;
}

export async function getClassGradebook(classId: string, range?: GradebookDateRange) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      teacher: { select: { id: true, name: true } },
    },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const [enrollments, assignments, offlineColumns] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId, status: "ACTIVE", student: { deletedAt: null } },
      orderBy: { student: { name: "asc" } },
      select: {
        student: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.assignment.findMany({
      where: { classId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        dueAt: true,
        createdAt: true,
        weight: true,
        isQuickTextbook: true,
        targets: { select: { studentId: true } },
        worksheet: {
          select: {
            fields: { select: { points: true } },
          },
        },
        submissions: {
          where: { status: { in: ["SUBMITTED", "GRADED"] } },
          select: {
            id: true,
            studentId: true,
            status: true,
            totalScore: true,
            autoScore: true,
            maxScore: true,
            submittedAt: true,
            teacherComment: true,
            attemptNo: true,
          },
        },
      },
    }),
    prisma.offlineGradeColumn.findMany({
      where: { classId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        entries: {
          select: { studentId: true, score: true, note: true },
        },
      },
    }),
  ]);

  const filteredAssignments = assignments.filter((a) =>
    isWithinDateRange(a.dueAt ?? a.createdAt, range)
  );
  const filteredOffline = offlineColumns.filter((c) => isWithinDateRange(c.date, range));

  const onlineAcc = new Map<string, number[]>();
  const offlineAcc = new Map<string, number[]>();
  for (const a of filteredAssignments) onlineAcc.set(a.id, []);
  for (const c of filteredOffline) offlineAcc.set(c.id, []);

  // Pre-compute best completed submission per assignment/student and online targets
  const bestSubByAsg = new Map<
    string,
    Map<string, (typeof filteredAssignments)[number]["submissions"][number]>
  >();
  const targetSetByAsg = new Map<string, Set<string> | null>();
  const defaultMaxByAsg = new Map<string, number>();

  for (const a of filteredAssignments) {
    targetSetByAsg.set(
      a.id,
      a.targets.length > 0 ? new Set(a.targets.map((t) => t.studentId)) : null
    );
    const worksheetMax = a.worksheet.fields.reduce((s, f) => s + f.points, 0);
    defaultMaxByAsg.set(a.id, worksheetMax > 0 ? worksheetMax : 10);

    const byStudent = new Map<string, (typeof a.submissions)[number]>();
    for (const sub of a.submissions) {
      const prev = byStudent.get(sub.studentId);
      const subScore = sub.totalScore ?? sub.autoScore ?? 0;
      const prevScore = prev ? (prev.totalScore ?? prev.autoScore ?? 0) : -1;
      if (
        !prev ||
        subScore > prevScore ||
        (subScore === prevScore && sub.attemptNo > prev.attemptNo)
      ) {
        byStudent.set(sub.studentId, sub);
      }
    }
    bestSubByAsg.set(a.id, byStudent);
  }

  const offlineEntryMap = new Map<
    string,
    Map<string, { score: number | null; note: string | null }>
  >();
  for (const c of filteredOffline) {
    const byStudent = new Map<string, { score: number | null; note: string | null }>();
    for (const e of c.entries) {
      byStudent.set(e.studentId, { score: e.score, note: e.note });
    }
    offlineEntryMap.set(c.id, byStudent);
  }

  const rows = enrollments.map((enr) => {
    const stu = enr.student;
    const onlineCells: Record<string, GradebookOnlineCellDTO> = {};
    const offlineCells: Record<string, GradebookOfflineCellDTO> = {};
    const scoreItems: GradebookScoreItem[] = [];

    let submittedOnlineCount = 0;
    let totalOnlineCount = 0;

    for (const a of filteredAssignments) {
      const targetSet = targetSetByAsg.get(a.id) ?? null;
      if (targetSet && !targetSet.has(stu.id)) {
        onlineCells[a.id] = {
          score: null,
          maxScore: defaultMaxByAsg.get(a.id) ?? 10,
          score10: null,
          status: "NOT_TARGETED",
          submittedAt: null,
          teacherComment: null,
        };
        continue;
      }

      totalOnlineCount++;
      const sub = bestSubByAsg.get(a.id)?.get(stu.id);
      if (!sub) {
        onlineCells[a.id] = {
          score: null,
          maxScore: defaultMaxByAsg.get(a.id) ?? 10,
          score10: null,
          status: "MISSING",
          submittedAt: null,
          teacherComment: null,
        };
        continue;
      }

      submittedOnlineCount++;
      const rawScore = sub.totalScore ?? sub.autoScore;
      const score10 = rawScore !== null ? normalizeToScale10(rawScore, sub.maxScore) : null;
      if (score10 !== null) {
        onlineAcc.get(a.id)?.push(score10);
      }
      if (rawScore !== null && sub.maxScore > 0) {
        scoreItems.push({
          score: rawScore,
          maxScore: sub.maxScore,
          weight: a.weight,
          date: a.dueAt ?? a.createdAt,
          kind: "ONLINE",
        });
      }
      onlineCells[a.id] = {
        score: rawScore !== null ? round2(rawScore) : null,
        maxScore: sub.maxScore,
        score10,
        status: sub.status === "GRADED" ? "GRADED" : "SUBMITTED",
        submittedAt: sub.submittedAt?.toISOString() ?? null,
        teacherComment: sub.teacherComment ?? null,
      };
    }

    for (const col of filteredOffline) {
      const entry = offlineEntryMap.get(col.id)?.get(stu.id);
      const rawScore = entry?.score ?? null;
      const score10 = rawScore !== null ? normalizeToScale10(rawScore, col.maxScore) : null;
      if (score10 !== null) {
        offlineAcc.get(col.id)?.push(score10);
      }
      if (rawScore !== null) {
        scoreItems.push({
          score: rawScore,
          maxScore: col.maxScore,
          weight: col.weight,
          date: col.date,
          kind: "OFFLINE",
        });
      }
      offlineCells[col.id] = {
        score: rawScore !== null ? round2(rawScore) : null,
        maxScore: col.maxScore,
        score10,
        note: entry?.note ?? null,
      };
    }

    const weightedAvg10 = computeWeightedAvg10(scoreItems);
    const submissionRatePct = computeSubmissionRatePct(submittedOnlineCount, totalOnlineCount);

    return {
      student: stu,
      onlineCells,
      offlineCells,
      submittedOnlineCount,
      totalOnlineCount,
      submissionRatePct,
      weightedAvg10,
    };
  });

  const onlineColumns: GradebookOnlineColumnDTO[] = filteredAssignments.map((a) => {
    const vals = onlineAcc.get(a.id) ?? [];
    return {
      id: a.id,
      title: a.title,
      date: (a.dueAt ?? a.createdAt).toISOString(),
      maxScore: defaultMaxByAsg.get(a.id) ?? 10,
      weight: a.weight,
      isQuickTextbook: a.isQuickTextbook,
      classAvg10: vals.length > 0 ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
    };
  });

  const offlineColsDTO: GradebookOfflineColumnDTO[] = filteredOffline.map((c) => {
    const vals = offlineAcc.get(c.id) ?? [];
    return {
      id: c.id,
      title: c.title,
      date: c.date.toISOString(),
      maxScore: c.maxScore,
      weight: c.weight,
      note: c.note ?? null,
      classAvg10: vals.length > 0 ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
    };
  });

  const allStudentAvgs = rows
    .map((r) => r.weightedAvg10)
    .filter((v): v is number => v !== null);
  const classAvg10 =
    allStudentAvgs.length > 0
      ? round2(allStudentAvgs.reduce((s, v) => s + v, 0) / allStudentAvgs.length)
      : null;
  const avgSubmissionRatePct =
    rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.submissionRatePct, 0) / rows.length)
      : 0;

  return {
    class: {
      id: cls.id,
      name: cls.name,
      teacherName: cls.teacher.name,
    },
    range: {
      from: range?.from ? String(range.from) : null,
      to: range?.to ? String(range.to) : null,
    },
    onlineColumns,
    offlineColumns: offlineColsDTO,
    rows,
    classSummary: {
      studentCount: rows.length,
      classAvg10,
      avgSubmissionRatePct,
    },
  };
}

export async function getStudentGradebookDetail(
  classId: string,
  studentId: string,
  range?: GradebookDateRange
) {
  const gb = await getClassGradebook(classId, range);
  const row = gb.rows.find((r) => r.student.id === studentId);
  if (!row) {
    throw new AppError("Không tìm thấy học sinh trong lớp này.", 404, "NOT_FOUND");
  }

  const onlineItems = gb.onlineColumns
    .filter((col) => row.onlineCells[col.id]?.status !== "NOT_TARGETED")
    .map((col) => {
      const cell = row.onlineCells[col.id]!;
      return {
        id: col.id,
        kind: "ONLINE" as const,
        title: col.title,
        date: cell.submittedAt ?? col.date,
        score: cell.score,
        maxScore: cell.maxScore,
        score10: cell.score10,
        weight: col.weight,
        classAvg10: col.classAvg10,
        status: cell.status,
        note: cell.teacherComment,
      };
    });

  const offlineItems = gb.offlineColumns.map((col) => {
    const cell = row.offlineCells[col.id]!;
    return {
      id: col.id,
      kind: "OFFLINE" as const,
      title: col.title,
      date: col.date,
      score: cell.score,
      maxScore: col.maxScore,
      score10: cell.score10,
      weight: col.weight,
      classAvg10: col.classAvg10,
      status: cell.score !== null ? ("GRADED" as const) : ("MISSING" as const),
      note: cell.note ?? col.note,
    };
  });

  const timeline = [...onlineItems, ...offlineItems].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const offlineGradedCount = offlineItems.filter((o) => o.score !== null).length;

  return {
    class: gb.class,
    student: row.student,
    range: gb.range,
    summary: {
      weightedAvg10: row.weightedAvg10,
      classAvg10: gb.classSummary.classAvg10,
      submissionRatePct: row.submissionRatePct,
      submittedOnlineCount: row.submittedOnlineCount,
      totalOnlineCount: row.totalOnlineCount,
      offlineGradedCount,
      offlineTotalCount: offlineItems.length,
    },
    onlineItems,
    offlineItems,
    timeline,
  };
}

export async function exportClassGradebookExcel(
  classId: string,
  range?: GradebookDateRange,
  locale: Locale = "vi"
) {
  const gb = await getClassGradebook(classId, range);
  const isEn = locale === "en";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isEn ? "Class Gradebook" : "Sổ điểm lớp");

  const columns: Array<{ header: string; key: string; width: number }> = [
    { header: isEn ? "#" : "STT", key: "stt", width: 6 },
    { header: isEn ? "Full name" : "Họ và tên", key: "name", width: 26 },
    { header: "Email", key: "email", width: 28 },
  ];

  for (const col of gb.onlineColumns) {
    columns.push({
      header: `${col.title} (/10, x${col.weight})`,
      key: `on_${col.id}`,
      width: 20,
    });
  }
  for (const col of gb.offlineColumns) {
    columns.push({
      header: `[${isEn ? "Paper" : "Giấy"}] ${col.title} (/${col.maxScore}, x${col.weight})`,
      key: `off_${col.id}`,
      width: 22,
    });
  }
  columns.push(
    { header: isEn ? "Submission rate (%)" : "Tỉ lệ nộp (%)", key: "rate", width: 16 },
    { header: isEn ? "Weighted Avg (/10)" : "Điểm TB tổng (/10)", key: "avg", width: 18 }
  );

  sheet.columns = columns;
  const hdrRow = sheet.getRow(1);
  hdrRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdrRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };

  gb.rows.forEach((row, idx) => {
    const record: Record<string, string | number> = {
      stt: idx + 1,
      name: row.student.name,
      email: row.student.email,
      rate: `${row.submissionRatePct}% (${row.submittedOnlineCount}/${row.totalOnlineCount})`,
      avg: row.weightedAvg10 ?? "",
    };
    for (const col of gb.onlineColumns) {
      const cell = row.onlineCells[col.id];
      record[`on_${col.id}`] = cell?.score10 ?? "";
    }
    for (const col of gb.offlineColumns) {
      const cell = row.offlineCells[col.id];
      record[`off_${col.id}`] = cell?.score ?? "";
    }
    sheet.addRow(record);
  });

  // Summary class average row
  const avgRowData: Record<string, string | number> = {
    stt: "",
    name: isEn ? "Class Average" : "Trung bình cả lớp",
    email: "",
    rate: `${gb.classSummary.avgSubmissionRatePct}%`,
    avg: gb.classSummary.classAvg10 ?? "",
  };
  for (const col of gb.onlineColumns) {
    avgRowData[`on_${col.id}`] = col.classAvg10 ?? "";
  }
  for (const col of gb.offlineColumns) {
    avgRowData[`off_${col.id}`] = col.classAvg10 ?? "";
  }
  const summaryRow = sheet.addRow(avgRowData);
  summaryRow.font = { bold: true };
  summaryRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF2FF" },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const safeName = gb.class.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 50);

  return {
    buffer: Buffer.from(arrayBuffer),
    filename: `${isEn ? "Gradebook" : "So_diem"}_${safeName || classId}.xlsx`,
  };
}

export async function exportStudentReportCardPdf(
  classId: string,
  studentId: string,
  range?: GradebookDateRange,
  locale: Locale = "vi"
) {
  const detail = await getStudentGradebookDetail(classId, studentId, range);
  const isEn = locale === "en";

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const { regular: regBytes, bold: boldBytes } = loadNotoFonts();
  const fontRegular = await pdfDoc.embedFont(regBytes, { subset: true });
  const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });

  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN = 40;
  const CONTENT_W = A4_W - MARGIN * 2;

  const INK = rgb(0.05, 0.11, 0.19);
  const MUTED = rgb(0.32, 0.36, 0.43);
  const ACCENT = rgb(0.21, 0.15, 0.8);
  const CARD_BG = rgb(0.95, 0.96, 1);
  const LINE = rgb(0.86, 0.88, 0.94);

  let page: PDFPage = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - MARGIN;

  const ensureSpace = (neededPt: number) => {
    if (y - neededPt < MARGIN + 20) {
      page = pdfDoc.addPage([A4_W, A4_H]);
      y = A4_H - MARGIN;
    }
  };

  const drawWrapped = (
    text: string,
    opts: { font?: typeof fontRegular; size?: number; color?: ReturnType<typeof rgb>; indent?: number; lineGap?: number } = {}
  ) => {
    const f = opts.font ?? fontRegular;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lineGap = opts.lineGap ?? 3.5;
    const lines = wrapText(text, f, size, CONTENT_W - indent);
    for (const ln of lines) {
      ensureSpace(size + lineGap + 2);
      if (ln) {
        page.drawText(ln, {
          x: MARGIN + indent,
          y: y - size,
          size,
          font: f,
          color: opts.color ?? INK,
        });
      }
      y -= size + lineGap;
    }
  };

  // Header band
  page.drawRectangle({
    x: MARGIN,
    y: y - 54,
    width: CONTENT_W,
    height: 54,
    color: ACCENT,
  });
  page.drawText(
    isEn ? "PIVORA — STUDENT PROGRESS REPORT CARD" : "PIVORA — PHIẾU BÁO ĐIỂM HỌC SINH",
    { x: MARGIN + 16, y: y - 24, size: 13.5, font: fontBold, color: rgb(1, 1, 1) }
  );
  page.drawText(
    `${isEn ? "Class" : "Lớp"}: ${detail.class.name}   •   ${isEn ? "Teacher" : "Giáo viên"}: ${detail.class.teacherName}`,
    { x: MARGIN + 16, y: y - 42, size: 9.5, font: fontRegular, color: rgb(0.88, 0.9, 1) }
  );
  y -= 68;

  // Student info
  drawWrapped(
    `${isEn ? "Student" : "Học sinh"}: ${detail.student.name} (${detail.student.email})`,
    { font: fontBold, size: 11, color: INK, lineGap: 4 }
  );
  drawWrapped(
    `${isEn ? "Exported at" : "Ngày xuất"}: ${formatDateTime(new Date(), locale)}${
      detail.range.from || detail.range.to
        ? `   •   ${isEn ? "Period" : "Khoảng ngày"}: ${detail.range.from ?? "..."} → ${detail.range.to ?? "..."}`
        : ""
    }`,
    { size: 9, color: MUTED, lineGap: 10 }
  );

  // KPI strip
  ensureSpace(58);
  const kpiW = (CONTENT_W - 18) / 3;
  const kpis = [
    {
      label: isEn ? "Weighted Avg (/10)" : "Điểm TB tổng (/10)",
      val: detail.summary.weightedAvg10 !== null ? `${detail.summary.weightedAvg10} / 10` : "—",
    },
    {
      label: isEn ? "Class Avg (/10)" : "TB chung lớp (/10)",
      val: detail.summary.classAvg10 !== null ? `${detail.summary.classAvg10} / 10` : "—",
    },
    {
      label: isEn ? "Submission rate" : "Tỉ lệ nộp online",
      val: `${detail.summary.submissionRatePct}% (${detail.summary.submittedOnlineCount}/${detail.summary.totalOnlineCount})`,
    },
  ];
  kpis.forEach((k, idx) => {
    const x = MARGIN + idx * (kpiW + 9);
    page.drawRectangle({ x, y: y - 44, width: kpiW, height: 44, color: CARD_BG });
    page.drawText(k.label, { x: x + 10, y: y - 16, size: 8.5, font: fontRegular, color: MUTED });
    page.drawText(k.val, { x: x + 10, y: y - 34, size: 12, font: fontBold, color: ACCENT });
  });
  y -= 60;

  const drawSection = (
    heading: string,
    items: typeof detail.timeline
  ) => {
    ensureSpace(34);
    drawWrapped(heading, { font: fontBold, size: 11, color: ACCENT, lineGap: 6 });
    if (items.length === 0) {
      drawWrapped(isEn ? "No records in this period." : "Chưa có dữ liệu trong khoảng thời gian này.", {
        size: 9.5,
        color: MUTED,
        lineGap: 10,
      });
      return;
    }

    for (const item of items) {
      const scoreText =
        item.score !== null && item.score10 !== null
          ? `${item.score}/${item.maxScore} (${item.score10}/10)`
          : isEn
            ? "Not graded"
            : "Chưa có điểm";
      const line = `• ${item.title} — ${scoreText}  [${isEn ? "Weight" : "Hệ số"} x${item.weight}]`;
      drawWrapped(line, { font: fontBold, size: 9.5, color: INK, indent: 4, lineGap: 2 });
      const subLineParts = [
        formatDateTime(item.date, locale),
        item.classAvg10 !== null ? `${isEn ? "Class avg" : "TB lớp"}: ${item.classAvg10}/10` : null,
        item.note ? `${isEn ? "Note" : "Nhận xét"}: ${item.note}` : null,
      ].filter(Boolean);
      drawWrapped(subLineParts.join("  •  "), {
        size: 8.5,
        color: MUTED,
        indent: 14,
        lineGap: 6,
      });
      ensureSpace(6);
      page.drawLine({
        start: { x: MARGIN + 4, y: y + 2 },
        end: { x: MARGIN + CONTENT_W, y: y + 2 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 4;
    }
    y -= 6;
  };

  drawSection(
    isEn ? "1. Online Assignments" : "1. Bài tập trực tuyến",
    detail.onlineItems
  );
  drawSection(
    isEn ? "2. In-class / Paper Tests" : "2. Điểm kiểm tra trên lớp (giấy)",
    detail.offlineItems
  );

  const bytes = await pdfDoc.save();
  const safeStudent = detail.student.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 40);

  return {
    buffer: Buffer.from(bytes),
    filename: `${isEn ? "Report_Card" : "Phieu_bao_diem"}_${safeStudent || studentId}.pdf`,
  };
}
