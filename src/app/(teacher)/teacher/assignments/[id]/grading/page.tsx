"use client";

import { BackLink } from "@/components/navigation/BackLink";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardEdit,
  Download,
  FileText,
  Flag,
  Globe,
  Headphones,
  History,
  Link2,
  ListChecks,
  ScanSearch,
  MessageCircleQuestion,
  Mic,
  Radio,
  RotateCcw,
  Scale,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import { cn, formatDateTime, formatDurationMs, getInitials } from "@/lib/utils";
import { scoreScaleLabel, type ScaledScoreResult } from "@/lib/score-scale";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfCanvasPage, usePdfDocument } from "@/components/worksheet/PdfCanvasPage";
import { OverlayFieldInput } from "@/components/worksheet/OverlayFieldInput";
import { DictationDiffView } from "@/components/worksheet/DictationDiffView";
import { PromptText } from "@/components/worksheet/PromptText";
import { PhotoAnnotatorModal } from "@/components/worksheet/PhotoAnnotatorModal";
import { PhotoLightboxModal } from "@/components/worksheet/PhotoLightboxModal";
import { InteractiveAnswerReview } from "@/components/worksheet/interactive/InteractiveAnswerReview";
import { isInteractiveFieldType } from "@/components/worksheet/interactive/InteractiveQuestionInput";
import { CommentPresetBar } from "@/components/grading/CommentPresetBar";
import { OverrideDialog, type StudentOverrideInfo } from "@/components/grading/OverrideDialog";
import { GradeByQuestionPanel } from "@/components/grading/GradeByQuestionPanel";
import { SimilarityPanel } from "@/components/grading/SimilarityPanel";
import { DoubtQueue } from "@/components/grading/DoubtQueue";
import { ItemAnalysisCard } from "@/components/analytics/ItemAnalysisCard";
import { ScoreHistogramChart } from "@/components/grading/ScoreHistogramChart";
import type { ScoreHistogramResult } from "@/lib/analytics/score-histogram";
import {
  asOptionList,
  computeRubricTotal,
  isManualFieldType,
  isPhotoUploadAnswer,
  isTrueFalseGroupAnswer,
  type AnswerValue,
  type DictationGradeDetail,
  type FieldOptionsValue,
  type FieldStyle,
  type PhotoAnnotationMap,
  type RubricCriterion,
  type RubricScoreMap,
  type UploadedAnswerFile,
} from "@/lib/grading";
import type { StudentFieldDTO } from "@/components/worksheet/types";
import type {
  FieldPlacement,
  FieldType,
  ProctorEventType,
  ScoreScale,
  SkillTag,
} from "@prisma/client";

interface ReportPayload {
  assignment: {
    id: string;
    title: string;
    classId: string;
    className: string;
    dueAt: string | null;
    proctorMode: string;
    scoreScale: ScoreScale;
    weight: number;
    isTargeted?: boolean;
    targetCount?: number;
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
  histogram: ScoreHistogramResult;
  topicBreakdown: Array<{ tag: string; questionCount: number; avgCorrectRate: number }>;
  studentRows: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    submissionId: string | null;
    examVariantCode?: string | null;
    attemptNo: number | null;
    status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED" | "RETURNED";
    isLate: boolean;
    flagged: boolean;
    violationCount: number;
    score: number | null;
    maxScore: number;
    scoreScale10: number | null;
    scaledScore: ScaledScoreResult | null;
    override: StudentOverrideInfo | null;
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
    topicTag: string | null;
    points: number;
    correctCount: number;
    totalGraded: number;
    correctRate: number;
    commonWrongAnswers: Array<{
      answer: string;
      code?: "BLANK" | "TRUE" | "FALSE";
      count: number;
    }>;
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
  revisions?: Array<{
    id: string;
    revisionNo: number;
    submittedAt: string;
    returnedAt: string | null;
    teacherComment: string | null;
    totalScore: number | null;
    maxScore: number;
  }>;
  student: { id: string; name: string; email: string };
  assignment: {
    id: string;
    title: string;
    worksheet: {
      id: string;
      pdfFileKey: string | null;
      pages: Array<{
        id: string;
        pageIndex: number;
        widthPt: number;
        heightPt: number;
        imageKey?: string | null;
      }>;
      audios?: Array<{ id: string; title: string }>;
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
        options: FieldOptionsValue | null;
        answerKey: Record<string, unknown>;
        rubric?: RubricCriterion[] | null;
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
    gradeDetail?: DictationGradeDetail | null;
    rubricScores?: RubricScoreMap | null;
    annotations?: PhotoAnnotationMap | null;
  }>;
  proctorEvents: Array<{
    id: string;
    type: ProctorEventType;
    at: string;
    durationMs: number | null;
    meta?: Record<string, unknown> | null;
  }>;
  audioPlays?: Array<{
    id: string;
    audioId: string;
    startedAt: string;
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
  const { m: vi, tr, locale } = useI18n();
  const modalQueryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ submission: ReviewSubmissionDetail }>({
    queryKey: ["submission-review", submissionId],
    queryFn: () =>
      apiFetchJson<{ submission: ReviewSubmissionDetail }>(
        `/api/submissions/${submissionId}/grade`,
        undefined,
        tr("Không tải được bài làm", "Could not load the submission")
      ),
  });

  const sub = data?.submission;
  const pdfUrl = sub?.assignment.worksheet.pdfFileKey
    ? `/api/files/${sub.assignment.worksheet.pdfFileKey}`
    : null;
  const { pdfDoc } = usePdfDocument(pdfUrl);

  const [scores, setScores] = useState<Record<string, number>>({});
  const [rubricScoresState, setRubricScoresState] = useState<Record<string, RubricScoreMap>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [teacherComment, setTeacherComment] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [returning, setReturning] = useState(false);
  const [lightbox, setLightbox] = useState<{
    fieldId: string;
    files: UploadedAnswerFile[];
    index: number;
    annotations: PhotoAnnotationMap | null;
  } | null>(null);
  const [proctorFilter, setProctorFilter] = useState<"ALL" | "CAMERA" | "SCREEN" | "AUDIO">("ALL");
  const [proctorLightbox, setProctorLightbox] = useState<{
    files: UploadedAnswerFile[];
    index: number;
  } | null>(null);

  const handleSave = async () => {
    if (!sub) return;
    setSaving(true);
    try {
      const grades = sub.assignment.worksheet.fields.map((f) => {
        const existingAns = sub.answers.find((a) => a.fieldId === f.id);
        const rubricCriteria = Array.isArray(f.rubric) ? f.rubric : [];
        const activeRubricMap =
          rubricScoresState[f.id] ?? existingAns?.rubricScores ?? undefined;
        const computedRubric =
          rubricCriteria.length > 0 && activeRubricMap
            ? computeRubricTotal(rubricCriteria, activeRubricMap, f.points)
            : null;
        const finalScore =
          computedRubric !== null
            ? computedRubric.total
            : scores[f.id] !== undefined
              ? scores[f.id]!
              : (existingAns?.score ?? 0);
        const finalNote =
          notes[f.id] !== undefined ? notes[f.id]! : (existingAns?.teacherNote ?? "");
        return {
          fieldId: f.id,
          score: finalScore,
          teacherNote: finalNote || null,
          ...(computedRubric !== null ? { rubricScores: computedRubric.clampedScores } : {}),
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

  const handleReturnForRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sub || returning) return;
    setReturning(true);
    try {
      await apiFetchJson(`/api/submissions/${submissionId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherComment: returnComment.trim() || null,
        }),
      });
      toast.success(tr("Đã trả bài cho học sinh làm lại!", "Returned submission for revision!"));
      setReturnDialogOpen(false);
      await modalQueryClient.invalidateQueries({
        queryKey: ["submission-review", submissionId],
      });
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Trả bài thất bại", "Return failed"));
    } finally {
      setReturning(false);
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
                    imageUrl={p.imageKey ? `/api/files/${p.imageKey}` : null}
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

              {/* Audio Play Log for this submission */}
              {(sub.assignment.worksheet.audios?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-indigo-200 bg-[#F8F9FF] p-4 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[#3525CD]">
                    <Headphones className="h-4 w-4" />
                    {tr("Lượt nghe file âm thanh", "Audio playback count")}
                  </p>
                  <div className="space-y-1 text-xs">
                    {(sub.assignment.worksheet.audios ?? []).map((a) => {
                      const count = (sub.audioPlays ?? []).filter((p) => p.audioId === a.id).length;
                      return (
                        <div key={a.id} className="flex justify-between text-[#0B1C30]">
                          <span>{a.title}</span>
                          <span className="font-bold tabular-nums">
                            {count} {tr("lần", "play(s)")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Proctor Timeline beside submission (PLAN 6C + Phase 18 filters & PhotoLightboxModal) */}
              {sub.proctorEvents.length > 0 && (() => {
                const classifyEvent = (type: ProctorEventType): "CAMERA" | "AUDIO" | "SCREEN" => {
                  if (type.startsWith("CAMERA_")) return "CAMERA";
                  if (type === "MIC_VOICE") return "AUDIO";
                  return "SCREEN";
                };
                const filteredEvents =
                  proctorFilter === "ALL"
                    ? sub.proctorEvents
                    : sub.proctorEvents.filter((ev) => classifyEvent(ev.type) === proctorFilter);
                const snapshotFiles: UploadedAnswerFile[] = sub.proctorEvents
                  .map((ev) => {
                    const key =
                      ev.meta && typeof ev.meta === "object" && typeof ev.meta.snapshotKey === "string"
                        ? ev.meta.snapshotKey
                        : null;
                    if (!key) return null;
                    return {
                      key,
                      name: `${vi.proctor.events[ev.type] ?? ev.type} — ${formatDateTime(ev.at, locale)}`,
                      mimeType: "image/jpeg",
                    };
                  })
                  .filter((f): f is UploadedAnswerFile => f !== null);
                const filterTabs: Array<{
                  key: "ALL" | "CAMERA" | "SCREEN" | "AUDIO";
                  label: string;
                  count: number;
                }> = [
                  { key: "ALL", label: tr("Tất cả", "All"), count: sub.proctorEvents.length },
                  {
                    key: "CAMERA",
                    label: tr("Camera", "Camera"),
                    count: sub.proctorEvents.filter((e) => classifyEvent(e.type) === "CAMERA").length,
                  },
                  {
                    key: "SCREEN",
                    label: tr("Màn hình", "Screen"),
                    count: sub.proctorEvents.filter((e) => classifyEvent(e.type) === "SCREEN").length,
                  },
                  {
                    key: "AUDIO",
                    label: tr("Âm thanh", "Audio"),
                    count: sub.proctorEvents.filter((e) => classifyEvent(e.type) === "AUDIO").length,
                  },
                ];

                return (
                  <div className="rounded-xl border border-red-200 bg-[#FEF2F2]/70 p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-[#BA1A1A]">
                        <ShieldAlert className="h-4 w-4" />
                        {tr("Nhật ký giám sát thi (", "Proctoring log (")}{sub.violationCount} {tr("vi phạm)", "violations)")}
                      </p>
                      <div className="flex flex-wrap gap-1" role="group" aria-label={tr("Lọc sự kiện", "Filter events")}>
                        {filterTabs.map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            data-testid={`proctor-filter-${tab.key}`}
                            onClick={() => setProctorFilter(tab.key)}
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition",
                              proctorFilter === tab.key
                                ? "bg-[#BA1A1A] text-white"
                                : "bg-white/90 text-[#93000A] hover:bg-white border border-red-200"
                            )}
                          >
                            {tab.label} ({tab.count})
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="max-h-56 space-y-2 overflow-y-auto text-xs" data-testid="proctor-timeline-list">
                      {filteredEvents.length === 0 ? (
                        <p className="py-3 text-center text-[11px] text-[#93000A]/70">
                          {tr("Không có sự kiện trong nhóm này.", "No events in this category.")}
                        </p>
                      ) : (
                        filteredEvents.map((ev) => {
                          const snapKey =
                            ev.meta && typeof ev.meta === "object" && typeof ev.meta.snapshotKey === "string"
                              ? ev.meta.snapshotKey
                              : null;
                          const snapIndex = snapKey
                            ? snapshotFiles.findIndex((f) => f.key === snapKey)
                            : -1;
                          return (
                            <div key={ev.id} className="space-y-1">
                              <div className="flex justify-between text-[#93000A]">
                                <span className="inline-flex items-center gap-1">
                                  {ev.type.startsWith("CAMERA_") && <Camera className="h-3 w-3" />}
                                  {ev.type === "MIC_VOICE" && <Mic className="h-3 w-3" />}
                                  {vi.proctor.events[ev.type] ?? ev.type}
                                  {ev.durationMs ? ` (${Math.round(ev.durationMs / 1000)}s)` : ""}
                                </span>
                                <span className="tabular-nums text-[11px] opacity-80">
                                  {formatDateTime(ev.at, locale)}
                                </span>
                              </div>
                              {snapKey && (
                                <button
                                  type="button"
                                  data-testid={`proctor-snapshot-${ev.id}`}
                                  onClick={() =>
                                    setProctorLightbox({
                                      files: snapshotFiles,
                                      index: Math.max(0, snapIndex),
                                    })
                                  }
                                  className="group relative inline-block overflow-hidden rounded border border-red-200"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/api/files/${snapKey}`}
                                    alt={vi.proctor.events[ev.type] ?? ev.type}
                                    className="h-16 w-24 object-cover transition group-hover:opacity-90"
                                  />
                                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 py-0.5 text-[9px] font-semibold text-white">
                                    {tr("Phóng to", "Zoom")}
                                  </span>
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right: Per-field score override + ESSAY grading + overall comment */}
            <div className="space-y-4 lg:col-span-5">
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {sub.assignment.worksheet.fields.map((f) => {
                  const ans = sub.answers.find((a) => a.fieldId === f.id);
                  const rubricCriteria = Array.isArray(f.rubric) ? f.rubric : [];
                  const currentRubricMap =
                    rubricScoresState[f.id] ?? ans?.rubricScores ?? {};
                  const computedRubric =
                    rubricCriteria.length > 0 &&
                    (rubricScoresState[f.id] !== undefined || ans?.rubricScores)
                      ? computeRubricTotal(rubricCriteria, currentRubricMap, f.points)
                      : null;
                  const currentScore =
                    computedRubric !== null
                      ? computedRubric.total
                      : scores[f.id] !== undefined
                        ? scores[f.id]!
                        : (ans?.score ?? 0);
                  const currentNote =
                    notes[f.id] !== undefined ? notes[f.id]! : (ans?.teacherNote ?? "");

                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "rounded-xl border p-3 space-y-2 text-xs",
                        isManualFieldType(f.type)
                          ? "border-amber-300 bg-amber-50/40"
                          : "border-slate-200 bg-[#F8F9FF]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={isManualFieldType(f.type) ? "orange" : "default"}>
                            {tr("Câu", "Q")} {f.label}
                          </Badge>
                          <span className="font-semibold text-slate-600">
                            {vi.worksheets.tools[f.type]}
                          </span>
                        </div>
                        <span className="font-bold text-slate-500">{tr("Tối đa", "Up to")} {f.points}{tr("đ", "pt")}</span>
                      </div>

                      {f.prompt && (
                        <p className="text-xs font-medium text-[#0B1C30]">
                          <PromptText text={f.prompt} />
                        </p>
                      )}

                      <div className="rounded-lg bg-white p-2 text-[#0B1C30] border border-slate-100 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          {tr("Bài làm học sinh:", "Student's answer:")}
                        </span>
                        {f.type === "PHOTO_UPLOAD" && isPhotoUploadAnswer(ans?.value) ? (
                          (() => {
                            const uploadedFiles = ans.value.files;
                            const imgFiles = uploadedFiles.filter(
                              (uf) => uf.mimeType !== "application/pdf"
                            );
                            if (uploadedFiles.length === 0 && !ans.value.note) {
                              return (
                                <p className="mt-0.5 font-medium text-slate-400">
                                  {tr("(Chưa nộp ảnh)", "(No photos uploaded)")}
                                </p>
                              );
                            }
                            return (
                              <div className="space-y-2">
                                {uploadedFiles.length > 0 && (
                                  <div className="grid grid-cols-3 gap-2">
                                    {uploadedFiles.map((uf) => {
                                      const isPdf = uf.mimeType === "application/pdf";
                                      const imgIdx = imgFiles.findIndex((x) => x.key === uf.key);
                                      return isPdf ? (
                                        <a
                                          key={uf.key}
                                          href={`/api/files/${uf.key}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex h-20 flex-col items-center justify-center rounded-lg border border-slate-200 bg-[#EFF4FF] p-1 text-center text-[10px] font-semibold text-[#3525CD]"
                                        >
                                          <FileText className="h-5 w-5 mb-0.5" />
                                          <span className="line-clamp-1">{uf.name}</span>
                                        </a>
                                      ) : (
                                        <button
                                          key={uf.key}
                                          type="button"
                                          onClick={() =>
                                            setLightbox({
                                              fieldId: f.id,
                                              files: imgFiles,
                                              index: Math.max(0, imgIdx),
                                              annotations:
                                                (ans.annotations as PhotoAnnotationMap | null) ??
                                                null,
                                            })
                                          }
                                          className="group relative h-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                                          title={tr("Nhấn để phóng to / xoay ảnh", "Click to zoom / rotate")}
                                          data-testid={`grading-photo-thumb-${f.id}`}
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={`/api/files/${uf.key}`}
                                            alt={uf.name}
                                            className="h-full w-full object-cover transition group-hover:scale-105"
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                {ans.value.note && (
                                  <p className="whitespace-pre-wrap text-xs text-[#464555]">
                                    {ans.value.note}
                                  </p>
                                )}
                              </div>
                            );
                          })()
                        ) : f.type === "TRUE_FALSE_GROUP" && isTrueFalseGroupAnswer(ans?.value) ? (
                          (() => {
                            const studentMap = ans.value;
                            const correctMap =
                              f.answerKey.correct &&
                              typeof f.answerKey.correct === "object" &&
                              !Array.isArray(f.answerKey.correct)
                                ? (f.answerKey.correct as Record<string, boolean>)
                                : {};
                            const listOpts = asOptionList(f.options);
                            const ids =
                              listOpts.length > 0
                                ? listOpts.map((o) => o.id)
                                : Object.keys({ ...correctMap, ...studentMap }).sort();
                            if (ids.length === 0) {
                              return <p className="mt-0.5 font-medium">{tr("(Bỏ trống)", "(Blank)")}</p>;
                            }
                            return (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {ids.map((id) => {
                                  const picked = studentMap[id];
                                  const expected = correctMap[id];
                                  const hasPick = typeof picked === "boolean";
                                  const isRight = hasPick && picked === expected;
                                  return (
                                    <span
                                      key={id}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold",
                                        !hasPick
                                          ? "bg-slate-100 text-slate-500"
                                          : isRight
                                            ? "bg-[#DCFCE7] text-[#15803D]"
                                            : "bg-red-50 text-[#BA1A1A]"
                                      )}
                                    >
                                      {id}:{" "}
                                      {hasPick
                                        ? picked
                                          ? tr("Đúng", "True")
                                          : tr("Sai", "False")
                                        : "—"}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()
                        ) : isInteractiveFieldType(f.type) ? (
                          <InteractiveAnswerReview
                            type={f.type}
                            value={ans?.value}
                            options={f.options}
                            answerKey={f.answerKey}
                            gradeDetail={ans?.gradeDetail}
                          />
                        ) : (
                          <p className="mt-0.5 whitespace-pre-wrap font-medium">
                            {ans?.value !== undefined && ans?.value !== null && ans?.value !== ""
                              ? typeof ans.value === "boolean"
                                ? ans.value
                                  ? tr("Đúng / Có", "True / Yes")
                                  : tr("Sai / Không", "False / No")
                                : Array.isArray(ans.value)
                                  ? ans.value.join(", ")
                                  : String(ans.value)
                              : tr("(Bỏ trống)", "(Blank)")}
                          </p>
                        )}
                        {f.type === "DICTATION" && ans?.gradeDetail && (
                          <DictationDiffView detail={ans.gradeDetail} showExpected={true} />
                        )}
                      </div>

                      {rubricCriteria.length > 0 && (
                        <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-white p-2.5" data-testid={`modal-rubric-${f.id}`}>
                          <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[#3525CD]">
                            <Scale className="h-3 w-3" />
                            {tr("Chấm theo Rubric", "Rubric breakdown")}
                          </p>
                          {rubricCriteria.map((c) => {
                            const val = currentRubricMap[c.id] ?? 0;
                            return (
                              <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="truncate font-medium text-[#0B1C30]">
                                  {c.title}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={c.maxPoints}
                                    step="0.25"
                                    value={val}
                                    onChange={(e) => {
                                      const nextMap: RubricScoreMap = {
                                        ...currentRubricMap,
                                        [c.id]: Math.max(
                                          0,
                                          Math.min(c.maxPoints, Number(e.target.value) || 0)
                                        ),
                                      };
                                      const res = computeRubricTotal(rubricCriteria, nextMap, f.points);
                                      setRubricScoresState((prev) => ({
                                        ...prev,
                                        [f.id]: res.clampedScores,
                                      }));
                                      setScores((prev) => ({ ...prev, [f.id]: res.total }));
                                    }}
                                    className="h-7 w-14 text-xs tabular-nums"
                                    data-testid={`modal-rubric-input-${f.id}-${c.id}`}
                                  />
                                  <span className="text-[10px] text-slate-400">/{c.maxPoints}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px]">{tr("Điểm chấm", "Score")}</Label>
                          <Input
                            type="number"
                            step="0.25"
                            min={0}
                            max={f.points}
                            readOnly={rubricCriteria.length > 0}
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
                <CommentPresetBar
                  onInsert={(text) => {
                    const prev =
                      teacherComment !== null ? teacherComment : (sub.teacherComment ?? "");
                    setTeacherComment(prev ? `${prev} ${text}` : text);
                  }}
                />

                <div className="space-y-1">
                  <Label className="text-xs">{vi.assignments.grading.overallComment}</Label>
                  <Textarea
                    rows={3}
                    value={teacherComment !== null ? teacherComment : (sub.teacherComment ?? "")}
                    onChange={(e) => setTeacherComment(e.target.value)}
                    placeholder={tr("Nhận xét tổng thể (hiển thị cho học sinh & phụ huynh)…", "Overall comment (visible to student & parent)…")}
                    className="text-xs"
                    data-testid="overall-teacher-comment"
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

                {/* Revision History */}
                {sub.revisions && sub.revisions.length > 0 && (
                  <div
                    className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/25 p-3"
                    data-testid="submission-revisions-list"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <History className="h-3.5 w-3.5" />
                      {tr("Lịch sử các lần nộp / trả bài", "Revision history")} ({sub.revisions.length})
                    </p>
                    <div className="space-y-1.5">
                      {sub.revisions.map((rev) => (
                        <div
                          key={rev.id}
                          className="rounded-lg bg-white dark:bg-slate-900 px-2.5 py-2 text-[11px] border border-amber-100 dark:border-amber-900"
                        >
                          <div className="flex items-center justify-between font-semibold text-[#0B1C30] dark:text-slate-100">
                            <span>
                              {tr("Lần", "Rev.")} #{rev.revisionNo} • {formatDateTime(rev.submittedAt, locale)}
                            </span>
                            {rev.totalScore !== null && (
                              <span className="text-[#3525CD] tabular-nums">
                                {rev.totalScore}/{rev.maxScore}
                              </span>
                            )}
                          </div>
                          {rev.teacherComment && (
                            <p className="mt-0.5 text-[#464555] dark:text-slate-300">
                              {tr("Nhận xét trả:", "Return comment:")} {rev.teacherComment}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {(sub.status === "SUBMITTED" || sub.status === "GRADED") ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReturnComment(teacherComment ?? sub.teacherComment ?? "");
                        setReturnDialogOpen(true);
                      }}
                      data-testid="return-submission-btn"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {tr("Trả bài làm lại", "Return for revision")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
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
          </div>
        )}
      </DialogContent>

      {/* Return for revision dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Trả bài cho học sinh sửa lại", "Return submission for revision")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReturnForRevision} className="space-y-4">
            <p className="text-xs text-[#464555] dark:text-slate-300">
              {tr(
                "Hệ thống sẽ lưu lại phiên bản bài nộp hiện tại và mở lại quyền sửa bài cho học sinh (không tính thêm lượt làm bài).",
                "The current answers and score will be saved as a revision snapshot, and the student will be able to edit and resubmit without consuming another attempt."
              )}
            </p>
            <div className="space-y-1.5">
              <Label>{tr("Nhận xét gửi học sinh (khuyên dùng)", "Revision note for student")}</Label>
              <Textarea
                rows={3}
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                placeholder={tr("VD: Em xem lại câu 2 và giải thích rõ hơn ở phần tự luận nhé.", "e.g. Please review Q2 and expand your explanation.")}
                data-testid="return-comment-input"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturnDialogOpen(false)}>
                {vi.common.cancel}
              </Button>
              <Button type="submit" disabled={returning} data-testid="confirm-return-submission-btn">
                <RotateCcw className="h-4 w-4" />
                {returning ? tr("Đang trả…", "Returning…") : tr("Xác nhận trả bài", "Confirm return")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {lightbox && sub && (
        <PhotoAnnotatorModal
          files={lightbox.files}
          initialIndex={lightbox.index}
          open={true}
          onClose={() => setLightbox(null)}
          editable
          annotations={lightbox.annotations}
          onSave={async (next) => {
            await apiFetchJson(`/api/submissions/${sub.id}/annotations`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fieldId: lightbox.fieldId, annotations: next }),
            });
            setLightbox((prev) => (prev ? { ...prev, annotations: next } : null));
            toast.success(tr("Đã lưu nét chấm ảnh.", "Saved photo annotations."));
            await modalQueryClient.invalidateQueries({
              queryKey: ["submission-review", submissionId],
            });
            onSaved();
          }}
        />
      )}
      {proctorLightbox && (
        <PhotoLightboxModal
          files={proctorLightbox.files}
          initialIndex={proctorLightbox.index}
          open={true}
          onClose={() => setProctorLightbox(null)}
        />
      )}
    </Dialog>
  );
}

export default function AssignmentGradingPage() {
  const { m: vi, tr, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedTopicTag, setSelectedTopicTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "by-question" | "similarity" | "doubts">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "doubts" ? "doubts" : "overview"
  );
  const [reviewingSubId, setReviewingSubId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<ReportPayload["studentRows"][number] | null>(
    null
  );
  const [publicLinkOpen, setPublicLinkOpen] = useState(false);
  const [togglingPublicLink, setTogglingPublicLink] = useState(false);

  const { data: publicLinkData } = useQuery<{
    assignment: { id: string; allowPublicPractice: boolean; publicShareToken: string | null };
    attempts: Array<{
      id: string;
      guestName: string;
      autoScore: number;
      maxScore: number;
      submittedAt: string;
    }>;
    count: number;
    avgScore: number | null;
  }>({
    queryKey: ["assignment-public-link", assignmentId],
    enabled: publicLinkOpen,
    queryFn: () =>
      apiFetchJson(
        `/api/assignments/${assignmentId}/public-link`,
        undefined,
        tr("Không tải được cấu hình link mở", "Failed to load public link settings")
      ),
  });

  const handleTogglePublicLink = async (enabled: boolean) => {
    setTogglingPublicLink(true);
    try {
      await apiFetchJson(`/api/assignments/${assignmentId}/public-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      toast.success(
        enabled
          ? tr("Đã bật link luyện tập mở!", "Enabled public practice link!")
          : tr("Đã tắt link luyện tập mở.", "Disabled public practice link.")
      );
      queryClient.invalidateQueries({ queryKey: ["assignment-public-link", assignmentId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Không thể cập nhật link mở", "Failed to update link"));
    } finally {
      setTogglingPublicLink(false);
    }
  };

  const { data: report, isLoading } = useQuery<ReportPayload>({
    queryKey: ["assignment-report", assignmentId, locale],
    queryFn: () =>
      apiFetchJson<ReportPayload>(
        `/api/assignments/${assignmentId}/report`,
        undefined,
        tr("Không thể tải báo cáo", "Could not load the report")
      ),
  });

  const formatWrongAnswer = (w: {
    answer: string;
    code?: "BLANK" | "TRUE" | "FALSE";
  }) => {
    if (w.code === "BLANK") return tr("(Bỏ trống)", "(Blank)");
    if (w.code === "TRUE") return tr("Đúng / Có", "True / Yes");
    if (w.code === "FALSE") return tr("Sai / Không", "False / No");
    return w.answer;
  };

  if (isLoading || !report) {
    return (
      <div className="stitch-card p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  const filteredQuestions = selectedTopicTag
    ? report.questionAnalytics.filter((q) => q.topicTag === selectedTopicTag)
    : report.questionAnalytics;

  const lowestQuestion = [...filteredQuestions]
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
          <BackLink
            fallbackHref={`/teacher/classes/${report.assignment.classId}?tab=assignments`}
            label={report.assignment.className}
            className="mb-2"
          />
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1C30]">
            {report.assignment.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#464555]">
            <span>
              {report.assignment.totalQuestions} {tr("câu hỏi • Điểm tối đa", "questions • Max score")} {report.assignment.maxScore} {tr("• Hạn nộp:", "• Due:")} {formatDateTime(report.assignment.dueAt, locale)}
            </span>
            <Badge variant="neutral">
              {scoreScaleLabel(report.assignment.scoreScale, tr)} · ×{report.assignment.weight}
            </Badge>
            {report.assignment.isTargeted && (
              <Badge variant="default">
                {tr(`Giao nhóm ${report.assignment.targetCount ?? report.summary.totalStudents} HS`, `Targeted (${report.assignment.targetCount ?? report.summary.totalStudents} students)`)}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/assignments/${assignmentId}/export`}>
              <Download className="h-4 w-4 text-emerald-600" />
              {vi.assignments.grading.exportExcel}
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPublicLinkOpen(true)}
            data-testid="public-practice-link-btn"
          >
            <Globe className="h-4 w-4 text-[#4F46E5]" />
            {tr("Link luyện tập mở", "Public practice link")}
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

      {/* Mode Switcher */}
      <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setViewMode("overview")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
            viewMode === "overview"
              ? "bg-[#4F46E5] text-white"
              : "text-[#464555] hover:text-[#0B1C30]"
          )}
          data-testid="tab-grading-overview"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          {tr("Tổng quan & Danh sách bài", "Overview & Submissions")}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("by-question")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
            viewMode === "by-question"
              ? "bg-[#4F46E5] text-white"
              : "text-[#464555] hover:text-[#0B1C30]"
          )}
          data-testid="tab-grade-by-question"
        >
          <ListChecks className="h-3.5 w-3.5" />
          {tr("Chấm theo câu", "Grade by question")}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("similarity")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
            viewMode === "similarity"
              ? "bg-[#4F46E5] text-white"
              : "text-[#464555] hover:text-[#0B1C30]"
          )}
          data-testid="tab-similarity"
        >
          <ScanSearch className="h-3.5 w-3.5" />
          {tr("Kiểm tra tương đồng", "Similarity check")}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("doubts")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition",
            viewMode === "doubts"
              ? "bg-[#4F46E5] text-white"
              : "text-[#464555] hover:text-[#0B1C30]"
          )}
          data-testid="tab-doubts"
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" />
          {tr("Hỏi đáp & Chấm chéo", "Q&A & peer review")}
        </button>
      </div>

      {viewMode === "doubts" ? (
        <DoubtQueue assignmentId={assignmentId} />
      ) : viewMode === "similarity" ? (
        <SimilarityPanel assignmentId={assignmentId} />
      ) : viewMode === "by-question" ? (
        <GradeByQuestionPanel
          assignmentId={assignmentId}
          onGraded={() => {
            queryClient.invalidateQueries({ queryKey: ["assignment-report", assignmentId] });
          }}
        />
      ) : (
      <>
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

      <ItemAnalysisCard assignmentId={assignmentId} />

      {/* Phase 20: Score Histogram & Percentiles */}
      <ScoreHistogramChart histogram={report.histogram} />

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

        {report.topicBreakdown && report.topicBreakdown.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1" data-testid="topic-tag-filters">
            <button
              type="button"
              onClick={() => setSelectedTopicTag(null)}
              data-testid="topic-filter-chip-all"
              className={cn(
                "min-h-8 rounded-full border px-3 py-1 text-xs font-semibold transition",
                selectedTopicTag === null
                  ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                  : "border-slate-200 bg-white text-[#464555] hover:bg-slate-50"
              )}
            >
              {tr("Tất cả chủ đề", "All topics")}
            </button>
            {report.topicBreakdown.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => setSelectedTopicTag(selectedTopicTag === t.tag ? null : t.tag)}
                data-testid={`topic-filter-chip-${t.tag}`}
                className={cn(
                  "min-h-8 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  selectedTopicTag === t.tag
                    ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                    : "border-slate-200 bg-white text-[#464555] hover:bg-slate-50"
                )}
              >
                {t.tag} ({t.avgCorrectRate}%)
              </button>
            ))}
          </div>
        )}

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
                      .map((w) => `"${formatWrongAnswer(w)}" (${w.count})`)
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
          {filteredQuestions.map((q) => {
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
                    ? ` | ${tr("Sai phổ biến", "Common wrong")}: ${q.commonWrongAnswers.map((w) => `${formatWrongAnswer(w)} (${w.count})`).join(", ")}`
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
                <th className="py-2 pr-4">{tr("Chủ đề", "Topic")}</th>
                <th className="py-2 pr-4">{tr("Kỹ năng", "Skill")}</th>
                <th className="py-2 pr-4">{tr("Tỉ lệ đúng", "Correct rate")}</th>
                <th className="py-2">{tr("Đáp án sai phổ biến nhất", "Most common wrong answer")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuestions.map((q) => (
                <tr key={q.fieldId}>
                  <td className="py-2 pr-4 font-bold text-[#0B1C30]">{tr("Câu", "Q")} {q.label}</td>
                  <td className="py-2 pr-4 text-slate-500">
                    {q.topicTag ? <Badge variant="indigo">{q.topicTag}</Badge> : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {q.skillTag ? vi.skills[q.skillTag] : "—"}
                  </td>
                  <td className="py-2 pr-4 font-semibold tabular-nums">
                    {q.correctRate}% ({q.correctCount}/{q.totalGraded})
                  </td>
                  <td className="py-2 text-[#464555]">
                    {q.commonWrongAnswers.length > 0
                      ? q.commonWrongAnswers
                          .map(
                            (w) =>
                              `${formatWrongAnswer(w)} (${w.count} ${tr(
                                "em",
                                w.count === 1 ? "student" : "students"
                              )})`
                          )
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-[#0B1C30]">{row.studentName}</p>
                          {row.examVariantCode && (
                            <Badge variant="indigo" className="text-[10px]">
                              {tr("Mã đề", "Code")} {row.examVariantCode}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{row.studentEmail}</p>
                        {row.override && (row.override.extraAttempts > 0 || row.override.dueAt || row.override.timeLimitMin) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.override.extraAttempts > 0 && (
                              <Badge variant="default" className="text-[10px]">
                                +{row.override.extraAttempts} {tr("lượt", "attempts")}
                              </Badge>
                            )}
                            {row.override.dueAt && (
                              <Badge variant="mint" className="text-[10px]">
                                {tr("Hạn:", "Due:")} {formatDateTime(row.override.dueAt, locale)}
                              </Badge>
                            )}
                            {row.override.timeLimitMin && (
                              <Badge variant="sky" className="text-[10px]">
                                {row.override.timeLimitMin}′
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-[#464555] tabular-nums">
                    <div>{formatDateTime(row.submittedAt, locale)}</div>
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
                      {row.status === "RETURNED" && (
                        <Badge variant="orange" data-testid={`status-returned-${row.studentId}`}>
                          {tr("Đã trả làm lại", "Returned")}
                        </Badge>
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
                        {row.scaledScore && report.assignment.scoreScale !== "RAW" && (
                          <p className="text-[11px] text-slate-400">
                            ({row.scaledScore.formatted})
                          </p>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOverrideTarget(row)}
                        data-testid={`override-btn-${row.studentId}`}
                        title={tr("Thêm lượt hoặc gia hạn riêng", "Grant extra attempts or personal deadline")}
                      >
                        <CalendarClock className="h-3.5 w-3.5 text-[#4F46E5]" />
                        {tr("Ngoại lệ", "Exception")}
                      </Button>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}

      {reviewingSubId && (
        <SubmissionReviewModal
          submissionId={reviewingSubId}
          onClose={() => setReviewingSubId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["assignment-report", assignmentId] });
          }}
        />
      )}

      <OverrideDialog
        assignmentId={assignmentId}
        student={overrideTarget}
        onClose={() => setOverrideTarget(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["assignment-report", assignmentId] });
        }}
      />

      <Dialog open={publicLinkOpen} onOpenChange={setPublicLinkOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("Link luyện tập mở (Guest Practice)", "Public Practice Link")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div>
                <p className="font-semibold text-[#0B1C30]">
                  {tr("Cho phép làm bài không cần tài khoản", "Allow guest attempts without login")}
                </p>
                <p className="text-xs text-slate-500">
                  {tr(
                    "Kết quả khách được lưu riêng và không ảnh hưởng bảng điểm hoặc xếp hạng lớp.",
                    "Guest attempts are isolated from class grades and leaderboard."
                  )}
                </p>
              </div>
              <Switch
                checked={Boolean(publicLinkData?.assignment?.allowPublicPractice)}
                disabled={togglingPublicLink}
                onCheckedChange={(checked) => void handleTogglePublicLink(checked)}
                data-testid="public-practice-toggle"
              />
            </div>

            {publicLinkData?.assignment?.publicShareToken &&
              publicLinkData.assignment.allowPublicPractice && (
                <div className="space-y-2 rounded-xl border border-indigo-200 bg-[#EEF2FF]/50 p-3">
                  <Label className="text-xs font-semibold text-[#3525CD]">
                    {tr("Đường dẫn chia sẻ", "Share URL")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={
                        typeof window !== "undefined"
                          ? `${window.location.origin}/practice/${publicLinkData.assignment.publicShareToken}`
                          : `/practice/${publicLinkData.assignment.publicShareToken}`
                      }
                      data-testid="public-practice-url-input"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const url = `${window.location.origin}/practice/${publicLinkData.assignment.publicShareToken}`;
                        void navigator.clipboard?.writeText(url);
                        toast.success(tr("Đã sao chép liên kết!", "Copied URL!"));
                      }}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#0B1C30]">
                <span>
                  {tr("Lượt khách đã làm", "Guest attempts")} ({publicLinkData?.count ?? 0})
                </span>
                {publicLinkData?.avgScore !== null && publicLinkData?.avgScore !== undefined && (
                  <span className="text-[#4F46E5]">
                    {tr("Điểm TB:", "Avg:")} {publicLinkData.avgScore}
                  </span>
                )}
              </div>
              {publicLinkData && publicLinkData.attempts.length > 0 ? (
                <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {publicLinkData.attempts.map((att) => (
                    <div key={att.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <p className="font-semibold text-[#0B1C30]">{att.guestName}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatDateTime(att.submittedAt, locale)}
                        </p>
                      </div>
                      <Badge variant="indigo">
                        {att.autoScore}/{att.maxScore}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {tr("Chưa có khách nào làm qua link mở.", "No guest attempts recorded yet.")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublicLinkOpen(false)}>
              {vi.common.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
