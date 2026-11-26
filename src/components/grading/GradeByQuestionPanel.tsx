"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, EyeOff, FileText, Scale } from "lucide-react";
import type { FieldType, ScoreScale } from "@prisma/client";
import { apiFetchJson } from "@/lib/api-client";
import {
  computeRubricTotal,
  isManualFieldType,
  isPhotoUploadAnswer,
  type AnswerValue,
  type PhotoAnnotationMap,
  type RubricCriterion,
  type RubricScoreMap,
  type UploadedAnswerFile,
} from "@/lib/grading";
import { cn, formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PromptText } from "@/components/worksheet/PromptText";
import { PhotoAnnotatorModal } from "@/components/worksheet/PhotoAnnotatorModal";
import { InteractiveAnswerReview } from "@/components/worksheet/interactive/InteractiveAnswerReview";
import { isInteractiveFieldType } from "@/components/worksheet/interactive/InteractiveQuestionInput";
import { CommentPresetBar } from "./CommentPresetBar";

interface QuestionMeta {
  id: string;
  label: string;
  type: FieldType;
  prompt: string | null;
  points: number;
  rubric: RubricCriterion[] | null;
  ungradedCount: number;
}

interface QuestionGradingItem {
  submissionId: string;
  attemptNo: number;
  status: string;
  submittedAt: string | null;
  student: { id: string; name: string; email: string };
  answer: {
    value: AnswerValue;
    score: number | null;
    isCorrect: boolean | null;
    teacherNote: string | null;
    rubricScores: RubricScoreMap | null;
    annotations?: PhotoAnnotationMap | null;
  } | null;
}

interface ByQuestionPayload {
  assignment: {
    id: string;
    title: string;
    classId: string;
    className: string;
    scoreScale: ScoreScale;
  };
  fields: QuestionMeta[];
  selectedField: QuestionMeta | null;
  items: QuestionGradingItem[];
}

export function GradeByQuestionPanel({
  assignmentId,
  onGraded,
}: {
  assignmentId: string;
  onGraded: () => void;
}) {
  const { m: vi, tr, locale } = useI18n();
  const queryClient = useQueryClient();
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [anonymous, setAnonymous] = useState(false);
  const [onlyUngraded, setOnlyUngraded] = useState(false);

  const [scoreEdits, setScoreEdits] = useState<Record<string, number>>({});
  const [rubricEdits, setRubricEdits] = useState<Record<string, RubricScoreMap>>({});
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    submissionId: string;
    fieldId: string;
    files: UploadedAnswerFile[];
    index: number;
    annotations: PhotoAnnotationMap | null;
  } | null>(null);

  const queryUrl = selectedFieldId
    ? `/api/assignments/${assignmentId}/grading/by-question?fieldId=${encodeURIComponent(selectedFieldId)}`
    : `/api/assignments/${assignmentId}/grading/by-question`;

  const { data, isLoading } = useQuery<ByQuestionPayload>({
    queryKey: ["assignment-question-grading", assignmentId, selectedFieldId],
    queryFn: () =>
      apiFetchJson<ByQuestionPayload>(
        queryUrl,
        undefined,
        tr("Không tải được dữ liệu chấm theo câu", "Could not load question grading data")
      ),
  });

  if (isLoading || !data) {
    return (
      <div className="stitch-card p-10 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  const field = data.selectedField;
  const rubricCriteria =
    field && Array.isArray(field.rubric) ? field.rubric : [];
  const visibleItems = onlyUngraded
    ? data.items.filter(
        (item) => item.answer?.score === null || item.answer?.score === undefined
      )
    : data.items;

  const handleSaveItem = async (item: QuestionGradingItem) => {
    if (!field) return;
    const key = `${item.submissionId}:${field.id}`;
    const existingScore = item.answer?.score ?? 0;
    const existingNote = item.answer?.teacherNote ?? "";
    const existingRubric = item.answer?.rubricScores ?? {};

    const currentRubric = rubricEdits[key] ?? existingRubric;
    const finalScore =
      rubricCriteria.length > 0
        ? computeRubricTotal(rubricCriteria, currentRubric, field.points).total
        : scoreEdits[key] !== undefined
          ? scoreEdits[key]!
          : existingScore;
    const finalNote = noteEdits[key] !== undefined ? noteEdits[key]! : existingNote;

    setSavingKey(key);
    try {
      await apiFetchJson(`/api/submissions/${item.submissionId}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldId: field.id,
          score: finalScore,
          teacherNote: finalNote.trim() || null,
          ...(rubricCriteria.length > 0 ? { rubricScores: currentRubric } : {}),
        }),
      });
      toast.success(tr("Đã lưu điểm câu này!", "Saved question grade!"));
      await queryClient.invalidateQueries({
        queryKey: ["assignment-question-grading", assignmentId],
      });
      onGraded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lưu điểm thất bại", "Saving failed"));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="grade-by-question-panel">
      {/* Question picker + controls */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0B1C30]">
              {tr("Chọn câu hỏi để chấm nối tiếp", "Select a question to grade")}
            </h2>
            <p className="text-xs text-[#464555]">
              {tr(
                "Chấm từng câu cho cả lớp giúp nhanh hơn và dễ giữ chuẩn chấm nhất quán.",
                "Grade one question across the whole class for speed and consistency."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-[#F8F9FF] px-3 py-1.5 text-xs font-semibold text-[#0B1C30]">
              <EyeOff className="h-3.5 w-3.5 text-[#4F46E5]" />
              <span>{tr("Chấm ẩn danh", "Blind grading")}</span>
              <Switch
                checked={anonymous}
                onCheckedChange={setAnonymous}
                data-testid="blind-grading-switch"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-[#F8F9FF] px-3 py-1.5 text-xs font-semibold text-[#0B1C30]">
              <span>{tr("Chỉ câu chưa chấm", "Ungraded only")}</span>
              <Switch
                checked={onlyUngraded}
                onCheckedChange={setOnlyUngraded}
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {data.fields.map((f) => {
            const active = field?.id === f.id;
            const manual = isManualFieldType(f.type);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFieldId(f.id)}
                data-testid={`select-q-${f.label}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                  active
                    ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                    : manual && f.ungradedCount > 0
                      ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400"
                      : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-300"
                )}
              >
                <span>
                  {tr("Câu", "Q")} {f.label}
                </span>
                {f.ungradedCount > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px]",
                      active ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                    )}
                  >
                    {f.ungradedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {field && (
          <div className="rounded-xl border border-indigo-100 bg-[#F8F9FF] p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={isManualFieldType(field.type) ? "orange" : "default"}>
                  {tr("Câu", "Q")} {field.label}
                </Badge>
                <span className="text-xs font-semibold text-[#464555]">
                  {vi.worksheets.tools[field.type]}
                </span>
                {rubricCriteria.length > 0 && (
                  <Badge variant="mint" className="gap-1">
                    <Scale className="h-3 w-3" />
                    Rubric ({rubricCriteria.length})
                  </Badge>
                )}
              </div>
              <span className="text-xs font-bold text-[#3525CD] tabular-nums">
                {tr("Tối đa", "Max")}: {field.points} {tr("đ", "pt")}
              </span>
            </div>
            {field.prompt && (
              <p className="text-sm font-medium text-[#0B1C30]">
                <PromptText text={field.prompt} />
              </p>
            )}
          </div>
        )}
      </div>

      {/* Submissions for selected question */}
      {!field ? (
        <div className="stitch-card p-8 text-center text-sm text-slate-400">
          {tr("Không có câu hỏi nào.", "No questions found.")}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="stitch-card p-8 text-center text-sm text-slate-400">
          {tr("Không có bài nộp nào cần hiển thị.", "No submissions to display.")}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleItems.map((item, idx) => {
            const key = `${item.submissionId}:${field.id}`;
            const currentRubric = rubricEdits[key] ?? item.answer?.rubricScores ?? {};
            const computedRubric =
              rubricCriteria.length > 0
                ? computeRubricTotal(rubricCriteria, currentRubric, field.points)
                : null;
            const currentScore =
              computedRubric !== null
                ? computedRubric.total
                : scoreEdits[key] !== undefined
                  ? scoreEdits[key]!
                  : (item.answer?.score ?? 0);
            const currentNote =
              noteEdits[key] !== undefined
                ? noteEdits[key]!
                : (item.answer?.teacherNote ?? "");
            const isUngraded =
              item.answer?.score === null || item.answer?.score === undefined;

            return (
              <div
                key={item.submissionId}
                className="stitch-card p-5 space-y-3"
                data-testid={`qgrade-item-${item.submissionId}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#0B1C30]">
                      {anonymous
                        ? tr(`Học sinh #${idx + 1}`, `Student #${idx + 1}`)
                        : item.student.name}
                    </span>
                    {!anonymous && (
                      <span className="text-xs text-slate-400">{item.student.email}</span>
                    )}
                    {isUngraded ? (
                      <Badge variant="orange">{tr("Chờ chấm", "Pending")}</Badge>
                    ) : (
                      <Badge variant="mint">{tr("Đã có điểm", "Graded")}</Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {tr("Lượt", "Attempt")} {item.attemptNo} • {formatDateTime(item.submittedAt, locale)}
                  </span>
                </div>

                {/* Student Answer */}
                <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3 text-sm text-[#0B1C30]">
                  {field.type === "PHOTO_UPLOAD" && isPhotoUploadAnswer(item.answer?.value) ? (
                    <div className="space-y-2">
                      {item.answer.value.files.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {item.answer.value.files.map((uf) => {
                            const isPdf = uf.mimeType === "application/pdf";
                            const imgs = item.answer?.value && isPhotoUploadAnswer(item.answer.value)
                              ? item.answer.value.files.filter((x) => x.mimeType !== "application/pdf")
                              : [];
                            const imgIdx = imgs.findIndex((x) => x.key === uf.key);
                            return isPdf ? (
                              <a
                                key={uf.key}
                                href={`/api/files/${uf.key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-20 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-center text-[10px] font-semibold text-[#3525CD]"
                              >
                                <FileText className="h-5 w-5" />
                                <span className="line-clamp-1">{uf.name}</span>
                              </a>
                            ) : (
                              <button
                                key={uf.key}
                                type="button"
                                onClick={() =>
                                  setLightbox({
                                    submissionId: item.submissionId,
                                    fieldId: field.id,
                                    files: imgs,
                                    index: Math.max(0, imgIdx),
                                    annotations: (item.answer?.annotations as PhotoAnnotationMap | null) ?? null,
                                  })
                                }
                                className="h-24 overflow-hidden rounded-lg border border-slate-200 bg-white"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/files/${uf.key}`}
                                  alt={uf.name}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {item.answer.value.note && (
                        <p className="text-xs text-[#464555]">{item.answer.value.note}</p>
                      )}
                    </div>
                  ) : isInteractiveFieldType(field.type) ? (
                    <InteractiveAnswerReview
                      type={field.type}
                      value={item.answer?.value}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-xs sm:text-sm">
                      {item.answer?.value !== undefined &&
                      item.answer?.value !== null &&
                      item.answer?.value !== ""
                        ? typeof item.answer.value === "object"
                          ? JSON.stringify(item.answer.value)
                          : String(item.answer.value)
                        : tr("(Bỏ trống)", "(Blank)")}
                    </p>
                  )}
                </div>

                {/* Rubric scoring if configured */}
                {rubricCriteria.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-indigo-100 bg-white p-3 sm:grid-cols-2">
                    {rubricCriteria.map((c) => {
                      const val = currentRubric[c.id] ?? 0;
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0B1C30] truncate">{c.title}</p>
                            {c.description && (
                              <p className="text-[10px] text-slate-400 truncate">{c.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number"
                              min={0}
                              max={c.maxPoints}
                              step="0.25"
                              value={val}
                              onChange={(e) => {
                                const nextMap: RubricScoreMap = {
                                  ...currentRubric,
                                  [c.id]: Math.max(
                                    0,
                                    Math.min(c.maxPoints, Number(e.target.value) || 0)
                                  ),
                                };
                                setRubricEdits((prev) => ({ ...prev, [key]: nextMap }));
                              }}
                              className="h-8 w-16 text-xs tabular-nums"
                            />
                            <span className="text-[11px] text-slate-400">/{c.maxPoints}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                  <div className="sm:col-span-3 space-y-1">
                    <Label className="text-[11px]">{tr("Điểm câu này", "Score")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={field.points}
                      step="0.25"
                      readOnly={rubricCriteria.length > 0}
                      value={currentScore}
                      onChange={(e) =>
                        setScoreEdits((prev) => ({
                          ...prev,
                          [key]: Math.max(0, Math.min(field.points, Number(e.target.value) || 0)),
                        }))
                      }
                      className="h-9 text-xs font-bold tabular-nums"
                      data-testid={`qgrade-score-${item.submissionId}`}
                    />
                  </div>
                  <div className="sm:col-span-7 space-y-1">
                    <Label className="text-[11px]">{tr("Nhận xét", "Comment")}</Label>
                    <Input
                      value={currentNote}
                      onChange={(e) =>
                        setNoteEdits((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={tr("Nhập nhận xét cho câu này…", "Note for this question…")}
                      className="h-9 text-xs"
                      data-testid={`qgrade-note-${item.submissionId}`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 w-full"
                      disabled={savingKey === key}
                      onClick={() => void handleSaveItem(item)}
                      data-testid={`qgrade-save-${item.submissionId}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {savingKey === key ? tr("Lưu…", "Saving…") : tr("Lưu", "Save")}
                    </Button>
                  </div>
                </div>

                <CommentPresetBar
                  compact
                  onInsert={(txt) =>
                    setNoteEdits((prev) => ({
                      ...prev,
                      [key]: prev[key] ? `${prev[key]} ${txt}` : txt,
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <PhotoAnnotatorModal
          files={lightbox.files}
          initialIndex={lightbox.index}
          open={true}
          onClose={() => setLightbox(null)}
          editable
          annotations={lightbox.annotations}
          onSave={async (next) => {
            await apiFetchJson(`/api/submissions/${lightbox.submissionId}/annotations`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fieldId: lightbox.fieldId, annotations: next }),
            });
            setLightbox((prev) => (prev ? { ...prev, annotations: next } : null));
            toast.success(tr("Đã lưu nét chấm ảnh.", "Saved photo annotations."));
            await queryClient.invalidateQueries({
              queryKey: ["assignment-question-grading", assignmentId, selectedFieldId],
            });
          }}
        />
      )}
    </div>
  );
}
