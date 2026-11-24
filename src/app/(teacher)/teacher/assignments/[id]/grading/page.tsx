"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardEdit,
  Download,
  Flag,
  Radio,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import { cn, formatDateTime, formatDurationMs, getInitials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfCanvasPage, usePdfDocument } from "@/components/worksheet/PdfCanvasPage";
import { OverlayFieldInput } from "@/components/worksheet/OverlayFieldInput";
import type { AnswerValue, FieldOption, FieldStyle } from "@/lib/grading/types";
import type { StudentFieldDTO } from "@/components/worksheet/types";
import type { FieldPlacement, FieldType, ProctorEventType, SkillTag } from "@prisma/client";

interface ReportPayload {
  assignment: {
    id: string;
    title: string;
    classId: string;
    className: string;
    dueAt: string | null;
    proctorMode: string;
    totalQuestions: number;
    maxScore: number;
  };
  summary: {
    totalStudents: number;
    submittedCount: number;
    pendingManualCount: number;
    avgScore10: number;
    highestScore10: number;
    lowestScore10: number;
    stdDev: number;
  };
  studentRows: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    submissionId: string | null;
    attemptNo: number | null;
    status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED";
    isLate: boolean;
    flagged: boolean;
    violationCount: number;
    score: number | null;
    maxScore: number;
    scoreScale10: number | null;
    correctCount: number;
    totalQuestions: number;
    durationMs: number | null;
    submittedAt: string | null;
  }>;
  questionAnalytics: Array<{
    fieldId: string;
    label: string;
    type: FieldType;
    skillTag: SkillTag | null;
    points: number;
    correctCount: number;
    totalGraded: number;
    correctRate: number;
    commonWrongAnswers: Array<{ answer: string; count: number }>;
  }>;
}

interface ReviewSubmissionDetail {
  id: string;
  status: string;
  totalScore: number | null;
  maxScore: number;
  flagged: boolean;
  violationCount: number;
  teacherComment: string | null;
  student: { id: string; name: string; email: string };
  assignment: {
    id: string;
    title: string;
    worksheet: {
      id: string;
      pdfFileKey: string | null;
      pages: Array<{ id: string; pageIndex: number; widthPt: number; heightPt: number }>;
      fields: Array<{
        id: string;
        worksheetId: string;
        placement: FieldPlacement;
        type: FieldType;
        label: string;
        prompt: string | null;
        skillTag: SkillTag | null;
        order: number;
        points: number;
        pageIndex: number | null;
        x: number | null;
        y: number | null;
        w: number | null;
        h: number | null;
        style: FieldStyle | null;
        options: FieldOption[] | null;
        answerKey: Record<string, unknown>;
      }>;
    };
  };
  answers: Array<{
    id: string;
    fieldId: string;
    value: AnswerValue;
    isCorrect: boolean | null;
    score: number | null;
    teacherNote: string | null;
  }>;
  proctorEvents: Array<{
    id: string;
    type: ProctorEventType;
    at: string;
    durationMs: number | null;
  }>;
}

function SubmissionReviewModal({
  submissionId,
  onClose,
  onSaved,
}: {
  submissionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { m: vi, tr } = useI18n();
  const { data, isLoading } = useQuery<{ submission: ReviewSubmissionDetail }>({
    queryKey: ["submission-review", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/submissions/${submissionId}/grade`);
      if (!res.ok) throw new Error(tr("Không tải được bài làm", "Could not load the submission"));
      return res.json();
    },
  });

  const sub = data?.submission;
  const pdfUrl = sub?.assignment.worksheet.pdfFileKey
    ? `/api/files/${sub.assignment.worksheet.pdfFileKey}`
    : null;
  const { pdfDoc } = usePdfDocument(pdfUrl);

  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [teacherComment, setTeacherComment] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!sub) return;
    setSaving(true);
    try {
      const grades = sub.assignment.worksheet.fields.map((f) => {
        const existingAns = sub.answers.find((a) => a.fieldId === f.id);
        const finalScore =
          scores[f.id] !== undefined ? scores[f.id]! : (existingAns?.score ?? 0);
        const finalNote =
          notes[f.id] !== undefined ? notes[f.id]! : (existingAns?.teacherNote ?? "");
        return {
          fieldId: f.id,
          score: finalScore,
          teacherNote: finalNote || null,
        };
      });

      const res = await fetch(`/api/submissions/${submissionId}/grade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherComment:
            teacherComment !== null ? teacherComment : (sub.teacherComment ?? null),
          flagged: flagged !== null ? flagged : sub.flagged,
          grades,
        }),
      });
      if (!res.ok) throw new Error(tr("Lưu điểm thất bại", "Saving grades failed"));
      toast.success(tr("Đã lưu kết quả chấm bài!", "Grading saved!"));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tr("Chấm bài & Xem chi tiết", "Grade & review")} {sub ? `— ${sub.student.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !sub ? (
          <div className="py-12 text-center text-sm text-slate-400">{vi.common.loading}</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: PDF with filled answers */}
            <div className="space-y-4 lg:col-span-7 overflow-x-auto">
              {sub.assignment.worksheet.pages.length > 0 ? (
                sub.assignment.worksheet.pages.map((p) => (
                  <PdfCanvasPage
                    key={p.pageIndex}
                    pdfDoc={pdfDoc}
                    pageIndex={p.pageIndex}
                    widthPt={p.widthPt}
                    heightPt={p.heightPt}
                    zoom={0.8}
                    eager={p.pageIndex === 0}
                  >
                    {({ widthPx, heightPx }) =>
                      sub.assignment.worksheet.fields
                        .filter(
                          (f) => f.placement === "OVERLAY" && f.pageIndex === p.pageIndex
                        )
                        .map((f) => {
                          const ans = sub.answers.find((a) => a.fieldId === f.id);
                          const sf: StudentFieldDTO = {
                            ...f,
                            revealedAnswer: f.answerKey,
                          };
                          return (
                            <OverlayFieldInput
                              key={f.id}
                              field={sf}
                              pageWidthPx={widthPx}
                              pageHeightPx={heightPx}
                              zoom={0.8}
                              value={ans?.value}
                              disabled
                              revealResult
                              revealKey
                              isCorrect={ans?.isCorrect}
                              score={ans?.score}
                              teacherNote={ans?.teacherNote}
                            />
                          );
                        })
                    }
                  </PdfCanvasPage>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                  {tr("Worksheet không sử dụng PDF — xem đáp án từng câu ở bảng bên phải.", "This worksheet has no PDF — see each answer in the panel on the right.")}
                </div>
              )}

              {/* Proctor Timeline beside submission (PLAN 6C) */}
              {sub.proctorEvents.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-[#FEF2F2]/70 p-4 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[#BA1A1A]">
                    <ShieldAlert className="h-4 w-4" />
                    {tr("Nhật ký giám sát thi (", "Proctoring log (")}{sub.violationCount} {tr("vi phạm)", "violations)")}
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {sub.proctorEvents.map((ev) => (
                      <div key={ev.id} className="flex justify-between text-[#93000A]">
                        <span>
                          {vi.proctor.events[ev.type] ?? ev.type}
                          {ev.durationMs ? ` (${Math.round(ev.durationMs / 1000)}s)` : ""}
                        </span>
                        <span className="tabular-nums text-[11px] opacity-80">
                          {formatDateTime(ev.at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Per-field score override + ESSAY grading + overall comment */}
            <div className="space-y-4 lg:col-span-5">
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {sub.assignment.worksheet.fields.map((f) => {
                  const ans = sub.answers.find((a) => a.fieldId === f.id);
                  const currentScore =
                    scores[f.id] !== undefined ? scores[f.id]! : (ans?.score ?? 0);
                  const currentNote =
                    notes[f.id] !== undefined ? notes[f.id]! : (ans?.teacherNote ?? "");

                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "rounded-xl border p-3 space-y-2 text-xs",
                        f.type === "ESSAY"
                          ? "border-amber-300 bg-amber-50/40"
                          : "border-slate-200 bg-[#F8F9FF]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={f.type === "ESSAY" ? "orange" : "default"}>
                            {tr("Câu", "Q")} {f.label}
                          </Badge>
                          <span className="font-semibold text-slate-600">
                            {vi.worksheets.tools[f.type]}
                          </span>
                        </div>
                        <span className="font-bold text-slate-500">{tr("Tối đa", "Up to")} {f.points}{tr("đ", "pt")}</span>
                      </div>

                      <div className="rounded-lg bg-white p-2 text-[#0B1C30] border border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          {tr("Bài làm học sinh:", "Student's answer:")}
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap font-medium">
                          {ans?.value !== undefined && ans?.value !== null && ans?.value !== ""
                            ? Array.isArray(ans.value)
                              ? ans.value.join(", ")
                              : String(ans.value)
                            : tr("(Bỏ trống)", "(Blank)")}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px]">{tr("Điểm chấm", "Score")}</Label>
                          <Input
                            type="number"
                            step="0.25"
                            min={0}
                            max={f.points}
                            value={currentScore}
                            onChange={(e) =>
                              setScores((prev) => ({
                                ...prev,
                                [f.id]: Number(e.target.value),
                              }))
                            }
                            className="mt-0.5 h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[10px]">{tr("Nhận xét câu này", "Note for this question")}</Label>
                          <Input
                            value={currentNote}
                            onChange={(e) =>
                              setNotes((prev) => ({ ...prev, [f.id]: e.target.value }))
                            }
                            placeholder={tr("Ghi chú…", "Note…")}
                            className="mt-0.5 h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">{vi.assignments.grading.overallComment}</Label>
                  <Textarea
                    rows={3}
                    value={teacherComment !== null ? teacherComment : (sub.teacherComment ?? "")}
                    onChange={(e) => setTeacherComment(e.target.value)}
                    placeholder={tr("Nhận xét tổng thể (hiển thị cho học sinh & phụ huynh)…", "Overall comment (visible to student & parent)…")}
                    className="text-xs"
                  />
                </div>

                <label className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/40 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#BA1A1A]">
                    <Flag className="h-3.5 w-3.5" />
                    {tr("Đánh dấu nghi vấn (loại khỏi bảng xếp hạng)", "Flag as suspicious (excluded from leaderboard)")}
                  </span>
                  <Switch
                    checked={flagged !== null ? flagged : sub.flagged}
                    onCheckedChange={setFlagged}
                  />
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>
                    {tr("Đóng", "Close")}
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    <CheckCircle2 className="h-4 w-4" />
                    {saving ? tr("Đang lưu…", "Saving…") : vi.assignments.grading.saveGrading}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AssignmentGradingPage() {
  const { m: vi, tr } = useI18n();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [reviewingSubId, setReviewingSubId] = useState<string | null>(null);

  const { data: report, isLoading } = useQuery<ReportPayload>({
    queryKey: ["assignment-report", assignmentId],
    queryFn: async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/report`);
      if (!res.ok) throw new Error(tr("Không thể tải báo cáo", "Could not load the report"));
      return res.json();
    },
  });

  if (isLoading || !report) {
    return (
      <div className="stitch-card p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  const lowestQuestion = [...report.questionAnalytics]
    .filter((q) => q.totalGraded > 0)
    .sort((a, b) => a.correctRate - b.correctRate)[0];

  const filteredStudents = report.studentRows.filter(
    (r) =>
      r.studentName.toLowerCase().includes(search.toLowerCase()) ||
      r.studentEmail.toLowerCase().includes(search.toLowerCase())
  );

  const completionPct =
    report.summary.totalStudents > 0
      ? Math.round((report.summary.submittedCount / report.summary.totalStudents) * 1000) / 10
      : 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Stitch Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/teacher/classes/${report.assignment.classId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {report.assignment.className}
          </Link>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1C30]">
            {report.assignment.title}
          </h1>
          <p className="mt-0.5 text-xs text-[#464555]">
            {report.assignment.totalQuestions} {tr("câu hỏi • Điểm tối đa", "questions • Max score")} {report.assignment.maxScore} {tr("• Hạn nộp:", "• Due:")} {formatDateTime(report.assignment.dueAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/assignments/${assignmentId}/export`}>
              <Download className="h-4 w-4 text-emerald-600" />
              {vi.assignments.grading.exportExcel}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/teacher/classes/${report.assignment.classId}/leaderboard?assignmentId=${assignmentId}`}
            >
              <Trophy className="h-4 w-4 text-[#F97316]" />
              {tr("Bảng xếp hạng", "Leaderboard")}
            </Link>
          </Button>
          {report.assignment.proctorMode !== "OFF" && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/teacher/assignments/${assignmentId}/live`}>
                <Radio className="h-4 w-4 text-red-500" />
                {tr("Giám sát Live", "Live proctoring")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stitch 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stitch-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
            <span>{tr("Sĩ số nộp bài", "Submissions")}</span>
            <Users className="h-4 w-4 text-[#4F46E5]" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[#0B1C30] tabular-nums">
            {report.summary.submittedCount}/{report.summary.totalStudents}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#3525CD]">
            {completionPct}{tr("% hoàn thành", "% completed")}
          </p>
        </div>

        <div className="stitch-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
            <span>{tr("Điểm trung bình cả lớp", "Class average")}</span>
            <BarChart3 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[#0B1C30] tabular-nums">
            {report.summary.avgScore10}
            <span className="text-base font-medium text-slate-400"> / 10</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{tr("Độ lệch chuẩn:", "Std. deviation:")} {report.summary.stdDev}</p>
        </div>

        <div className="stitch-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
            <span>{tr("Biên độ điểm số", "Score range")}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-5">
            <div>
              <p className="text-[10px] text-slate-400">{tr("Cao nhất", "Highest")}</p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums">
                {report.summary.highestScore10}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400">{tr("Thấp nhất", "Lowest")}</p>
              <p className="text-xl font-bold text-red-600 tabular-nums">
                {report.summary.lowestScore10}
              </p>
            </div>
          </div>
        </div>

        <div className="stitch-card p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
            <span>{tr("Bài chờ chấm tự luận", "Essays to grade")}</span>
            <ClipboardEdit className="h-4 w-4 text-[#F97316]" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[#EA580C] tabular-nums">
            {report.summary.pendingManualCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">{tr("Nhấn vào từng học sinh để chấm tay", "Click a student to grade manually")}</p>
        </div>
      </div>

      {/* Stitch Per-Question Accuracy Bar Chart */}
      <section className="stitch-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#0B1C30]">
              {tr("Thống kê tỉ lệ làm đúng theo từng câu hỏi", "Correct rate per question")}
            </h2>
            <p className="text-xs text-[#464555]">
              {tr("Giúp giáo viên phát hiện lỗ hổng kiến thức ngữ pháp hoặc từ vựng của cả lớp.", "Helps the teacher spot grammar or vocabulary gaps across the class.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-[#005338]" /> &gt; 80%
            </span>
            <span className="inline-flex items-center gap-1 text-orange-700">
              <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" /> 50%–80%
            </span>
            <span className="inline-flex items-center gap-1 text-red-700">
              <span className="h-2.5 w-2.5 rounded-full bg-[#BA1A1A]" /> &lt; 50%
            </span>
          </div>
        </div>

        {lowestQuestion && lowestQuestion.correctRate < 60 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] px-4 py-3 text-xs text-[#93000A]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#BA1A1A]" />
              <span>
                <strong>{tr("CẢNH BÁO TRỌNG ĐIỂM — Câu", "KEY WARNING — Q")} {lowestQuestion.label}:</strong> {tr("Chỉ", "Only")}{" "}
                <strong>{lowestQuestion.correctRate}%</strong> {tr("học sinh làm đúng (", "of students answered correctly (")}
                {lowestQuestion.correctCount}/{lowestQuestion.totalGraded}).
                {lowestQuestion.commonWrongAnswers.length > 0 && (
                  <>
                    {" "}
                    {tr("Đáp án sai phổ biến:", "Most common wrong answer:")}{" "}
                    {lowestQuestion.commonWrongAnswers
                      .map((w) => `"${w.answer}" (${w.count})`)
                      .join(", ")}
                    .
                  </>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Bar chart */}
        <div className="flex items-end gap-2 overflow-x-auto pb-2 pt-6 min-h-[160px]">
          {report.questionAnalytics.map((q) => {
            const barColor =
              q.correctRate >= 80
                ? "bg-[#005338]"
                : q.correctRate >= 50
                  ? "bg-[#F97316]"
                  : "bg-[#BA1A1A]";
            return (
              <div
                key={q.fieldId}
                className="group relative flex min-w-[36px] flex-1 flex-col items-center gap-1.5"
                title={`${tr("Câu", "Q")} ${q.label}: ${q.correctRate}% ${tr("đúng", "correct")} (${q.correctCount}/${q.totalGraded})${
                  q.commonWrongAnswers.length
                    ? ` | ${tr("Sai phổ biến", "Common wrong")}: ${q.commonWrongAnswers.map((w) => `${w.answer} (${w.count})`).join(", ")}`
                    : ""
                }`}
              >
                <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                  {q.correctRate}%
                </span>
                <div className="flex h-28 w-full max-w-[34px] items-end rounded-t-lg bg-slate-100 overflow-hidden">
                  <div
                    className={cn("w-full rounded-t-lg transition-all", barColor)}
                    style={{ height: `${Math.max(6, q.correctRate)}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-[#0B1C30]">{q.label}</span>
              </div>
            );
          })}
        </div>

        {/* Common Wrong Answers Breakdown Table */}
        <div className="overflow-x-auto border-t border-slate-100 pt-3">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">{tr("Câu", "Q")}</th>
                <th className="py-2 pr-4">{tr("Kỹ năng", "Skill")}</th>
                <th className="py-2 pr-4">{tr("Tỉ lệ đúng", "Correct rate")}</th>
                <th className="py-2">{tr("Đáp án sai phổ biến nhất", "Most common wrong answer")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.questionAnalytics.map((q) => (
                <tr key={q.fieldId}>
                  <td className="py-2 pr-4 font-bold text-[#0B1C30]">{tr("Câu", "Q")} {q.label}</td>
                  <td className="py-2 pr-4 text-slate-500">
                    {q.skillTag ? vi.skills[q.skillTag] : "—"}
                  </td>
                  <td className="py-2 pr-4 font-semibold tabular-nums">
                    {q.correctRate}% ({q.correctCount}/{q.totalGraded})
                  </td>
                  <td className="py-2 text-[#464555]">
                    {q.commonWrongAnswers.length > 0
                      ? q.commonWrongAnswers
                          .map((w) => `${w.answer} (${w.count} em)`)
                          .join(" • ")
                      : tr("Không có", "None")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Student Submissions Table */}
      <section className="stitch-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-[#0B1C30]">
            {tr("Danh sách bài làm học sinh (", "Student submissions (")}{filteredStudents.length})
          </h2>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Tìm tên hoặc email học sinh…", "Search student name or email…")}
            className="h-9 w-64 text-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F8F9FF] text-xs font-bold uppercase text-[#464555]">
              <tr>
                <th className="px-6 py-3">{tr("Học sinh", "Student")}</th>
                <th className="px-6 py-3">{tr("Thời gian nộp", "Submitted at")}</th>
                <th className="px-6 py-3">{tr("Trạng thái", "Status")}</th>
                <th className="px-6 py-3 text-center">{tr("Số câu đúng", "Correct")}</th>
                <th className="px-6 py-3 text-right">{tr("Điểm số", "Score")}</th>
                <th className="px-6 py-3 text-right">{tr("Thao tác", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((row) => (
                <tr key={row.studentId} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-bold text-[#3525CD]">
                        {getInitials(row.studentName)}
                      </span>
                      <div>
                        <p className="font-semibold text-[#0B1C30]">{row.studentName}</p>
                        <p className="text-xs text-slate-400">{row.studentEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-[#464555] tabular-nums">
                    <div>{formatDateTime(row.submittedAt)}</div>
                    {row.durationMs !== null && (
                      <div className="text-[11px] text-slate-400">
                        {tr("Làm trong", "Took")} {formatDurationMs(row.durationMs)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.status === "GRADED" && <Badge variant="mint">{tr("Đã chấm", "Graded")}</Badge>}
                      {row.status === "SUBMITTED" && (
                        <Badge variant="orange">{tr("Chờ chấm tự luận", "Essay awaiting grading")}</Badge>
                      )}
                      {row.status === "IN_PROGRESS" && <Badge variant="sky">{tr("Đang làm", "In progress")}</Badge>}
                      {row.status === "NOT_STARTED" && (
                        <Badge variant="neutral">{tr("Chưa làm", "Not started")}</Badge>
                      )}
                      {row.isLate && <Badge variant="danger">{tr("Nộp trễ", "Late")}</Badge>}
                      {row.flagged && <Badge variant="danger">{tr("Nghi vấn", "Suspicious")}</Badge>}
                      {row.violationCount > 0 && (
                        <Badge variant="danger">{row.violationCount} {tr("vi phạm", "violations")}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-center font-semibold text-slate-600 tabular-nums">
                    {row.submissionId ? `${row.correctCount}/${row.totalQuestions}` : "—"}
                  </td>
                  <td className="px-6 py-3.5 text-right font-bold tabular-nums">
                    {row.score !== null ? (
                      <div>
                        <span className="text-base text-[#3525CD]">
                          {row.score}/{row.maxScore}
                        </span>
                        {row.scoreScale10 !== null && (
                          <p className="text-[11px] text-slate-400">
                            ({row.scoreScale10}/10)
                          </p>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {row.submissionId ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setReviewingSubId(row.submissionId)}
                      >
                        <ClipboardEdit className="h-3.5 w-3.5" />
                        {tr("Chấm & Xem", "Grade & view")}
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">{tr("Chưa có bài", "No submission")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {reviewingSubId && (
        <SubmissionReviewModal
          submissionId={reviewingSubId}
          onClose={() => setReviewingSubId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["assignment-report", assignmentId] });
          }}
        />
      )}
    </div>
  );
}
