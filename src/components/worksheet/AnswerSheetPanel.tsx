"use client";

import { useState } from "react";
import { CheckCircle2, ChevronUp, ClipboardList, ClipboardX, Flag, XCircle } from "lucide-react";
import type { AnswerValue, DictationGradeDetail } from "@/lib/grading/types";
import { cn, compareQuestionLabels } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import {
  formatRevealedAnswer,
  isAnswerFilled,
  type StudentFieldDTO,
  type WorksheetAudioDTO,
} from "./types";
import { LimitedAudioPlayer } from "./LimitedAudioPlayer";
import { DictationDiffView } from "./DictationDiffView";
import { PromptText } from "./PromptText";

interface AnswerSheetPanelProps {
  allFields: StudentFieldDTO[];
  answers: Record<string, AnswerValue>;
  onChange?: (fieldId: string, value: AnswerValue) => void;
  onJumpToField?: (field: StudentFieldDTO) => void;
  disabled?: boolean;
  revealResult?: boolean;
  revealKey?: boolean;
  disableSpellcheck?: boolean;
  audios?: WorksheetAudioDTO[];
  submissionId?: string | null;
  audioPlayCounts?: Record<string, number>;
  audioMaxPlays?: number | null;
  audioBlockPause?: boolean;
  audioBlockSeek?: boolean;
  audioPreviewMode?: boolean;
  /** Worksheet without PDF: show the sheet inline at full width (no sidebar / bottom sheet). */
  wide?: boolean;
  onAudioPlayCountChange?: (audioId: string, nextPlaysUsed: number) => void;
  gradeByFieldId?: Record<
    string,
    {
      isCorrect?: boolean | null;
      score?: number | null;
      teacherNote?: string | null;
      gradeDetail?: DictationGradeDetail | null;
    }
  >;
}

export function AnswerSheetPanel({
  allFields,
  answers,
  onChange,
  onJumpToField,
  disabled = false,
  revealResult = false,
  revealKey = false,
  disableSpellcheck = false,
  audios = [],
  submissionId,
  audioPlayCounts = {},
  audioMaxPlays = null,
  audioBlockPause = false,
  audioBlockSeek = false,
  audioPreviewMode = false,
  wide = false,
  onAudioPlayCountChange,
  gradeByFieldId = {},
}: AnswerSheetPanelProps) {
  const { m: vi, tr } = useI18n();
  const [filter, setFilter] = useState<"ALL" | "UNANSWERED" | "FLAGGED">("ALL");
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [mobileOpen, setMobileOpen] = useState(false);

  const answerSheetFields = allFields.filter((f) => f.placement === "ANSWER_SHEET");
  const answeredCount = allFields.filter((f) => isAnswerFilled(answers[f.id])).length;
  const pct = allFields.length > 0 ? Math.round((answeredCount / allFields.length) * 100) : 0;

  const toggleFlag = (id: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Navigation grid follows question numbers (1,2,3…) even when overlay & answer-sheet
  // questions are interleaved in storage order
  const gridFields = [...allFields].sort((a, b) => compareQuestionLabels(a.label, b.label));
  const filteredGridFields = gridFields.filter((f) => {
    if (filter === "UNANSWERED") return !isAnswerFilled(answers[f.id]);
    if (filter === "FLAGGED") return flaggedIds.has(f.id);
    return true;
  });

  const panelContent = (
    <div className="flex h-full flex-col">
      {/* Header + progress */}
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#4F46E5]" />
            <h3 className="text-sm font-bold text-[#0B1C30]">
              {vi.assignments.do.answerSheetTitle}
            </h3>
          </div>
          <span className="text-xs font-bold text-[#4F46E5] tabular-nums">
            {answeredCount}/{allFields.length} {vi.assignments.do.answeredCount}
          </span>
        </div>
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#4F46E5] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Filter pills */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[#EFF4FF] p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={cn(
              "rounded-lg py-1 transition",
              filter === "ALL" ? "bg-white text-[#3525CD] shadow-sm" : "text-[#464555]"
            )}
          >
            {tr("Tất cả (", "All (")}{allFields.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("UNANSWERED")}
            className={cn(
              "rounded-lg py-1 transition",
              filter === "UNANSWERED" ? "bg-white text-[#3525CD] shadow-sm" : "text-[#464555]"
            )}
          >
            {tr("Chưa làm (", "Unanswered (")}{allFields.length - answeredCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("FLAGGED")}
            className={cn(
              "rounded-lg py-1 transition",
              filter === "FLAGGED" ? "bg-white text-[#3525CD] shadow-sm" : "text-[#464555]"
            )}
          >
            {tr("Đã cờ (", "Flagged (")}{flaggedIds.size})
          </button>
        </div>

        {/* Question Jump Grid (scrolls to Overlay or Answer Sheet item!) */}
        <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-6">
          {filteredGridFields.map((f) => {
            const filled = isAnswerFilled(answers[f.id]);
            const isFlagged = flaggedIds.has(f.id);
            const g = gradeByFieldId[f.id];

            let btnStyle = "bg-slate-100 text-slate-600 hover:bg-indigo-50";
            if (revealResult && g?.isCorrect === true) {
              btnStyle = "bg-emerald-500 text-white";
            } else if (revealResult && g?.isCorrect === false) {
              btnStyle = "bg-red-500 text-white";
            } else if (isFlagged) {
              btnStyle = "bg-[#F97316] text-white";
            } else if (filled) {
              btnStyle = "bg-[#4F46E5] text-white";
            }

            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onJumpToField?.(f);
                  const el = document.getElementById(`sheet-field-${f.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                title={tr(`Đi tới câu ${f.label} (${f.placement === "OVERLAY" ? "Ô trên PDF" : "Phiếu trả lời"})`, `Go to question ${f.label} (${f.placement === "OVERLAY" ? "box on the PDF" : "answer sheet"})`)}
                className={cn(
                  "flex h-8 items-center justify-center rounded-lg text-xs font-bold transition",
                  btnStyle
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable ANSWER_SHEET fields list */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {answerSheetFields.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            {tr("Tất cả câu hỏi nằm trực tiếp trên trang PDF. Nhấn vào số câu ở trên để cuộn nhanh tới ô điền.", "All questions are directly on the PDF page. Click a question number above to jump to its box.")}
          </p>
        ) : (
          answerSheetFields.map((field) => {
            const val = answers[field.id];
            const grade = gradeByFieldId[field.id];
            const isFlagged = flaggedIds.has(field.id);
            const revealedText =
              revealKey && field.revealedAnswer
                ? formatRevealedAnswer(field.type, field.revealedAnswer, field.options, tr)
                : "";

            return (
              <div
                key={field.id}
                id={`sheet-field-${field.id}`}
                data-sheet-field-id={field.id}
                className={cn(
                  "rounded-xl border p-3 transition",
                  revealResult && grade?.isCorrect === true
                    ? "border-emerald-300 bg-emerald-50/50"
                    : revealResult && grade?.isCorrect === false
                      ? "border-red-300 bg-red-50/50"
                      : "border-slate-200/80 bg-[#F8F9FF]/60"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 min-w-[24px] items-center justify-center rounded-md bg-[#EEF2FF] px-1.5 text-xs font-bold text-[#3525CD]">
                      {field.label}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      {field.points} {tr("đ", "pt")}
                    </span>
                    {field.skillTag && (
                      <Badge variant="neutral" className="text-[10px] py-0">
                        {vi.skills[field.skillTag]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {revealResult && grade?.isCorrect === true && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    {revealResult && grade?.isCorrect === false && (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => toggleFlag(field.id)}
                        className={cn(
                          "rounded p-1 transition",
                          isFlagged ? "text-[#F97316]" : "text-slate-300 hover:text-slate-500"
                        )}
                        title={tr("Đánh dấu xem lại", "Mark for review")}
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {field.prompt && (
                  <p className="mt-2 text-xs font-medium leading-relaxed text-[#0B1C30]">
                    <PromptText text={field.prompt} />
                  </p>
                )}

                {field.audioId && (() => {
                  const linkedAudio = audios.find((a) => a.id === field.audioId);
                  if (!linkedAudio) return null;
                  return (
                    <div className="mt-2">
                      <LimitedAudioPlayer
                        audio={linkedAudio}
                        submissionId={audioPreviewMode ? null : submissionId}
                        previewUrl={
                          audioPreviewMode && linkedAudio.fileKey
                            ? `/api/files/${linkedAudio.fileKey}`
                            : null
                        }
                        playsUsed={audioPlayCounts[linkedAudio.id] ?? 0}
                        maxPlays={audioMaxPlays}
                        blockPause={audioBlockPause}
                        blockSeek={audioBlockSeek}
                        disabled={disabled}
                        compact
                        onPlayCountChange={onAudioPlayCountChange}
                      />
                    </div>
                  );
                })()}

                {/* Input control per FieldType */}
                <div className="mt-2.5">
                  {field.type === "MULTIPLE_CHOICE" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {(field.options ?? []).map((opt) => {
                        const selected = val === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange?.(field.id, opt.id)}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition",
                              selected
                                ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                                : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-200"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                                selected
                                  ? "bg-[#4F46E5] text-white"
                                  : "bg-slate-100 text-slate-600"
                              )}
                            >
                              {opt.id}
                            </span>
                            {opt.text && opt.text !== opt.id && (
                              <span className="truncate font-normal">{opt.text}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {field.type === "MULTI_SELECT" && (
                    <div className="space-y-1.5">
                      {(field.options ?? []).map((opt) => {
                        const list = Array.isArray(val) ? val : [];
                        const selected = list.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              const next = selected
                                ? list.filter((x) => x !== opt.id)
                                : [...list, opt.id];
                              onChange?.(field.id, next);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition",
                              selected
                                ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                                : "border-slate-200 bg-white text-[#0B1C30]"
                            )}
                          >
                            <input
                              type="checkbox"
                              readOnly
                              checked={selected}
                              className="accent-[#4F46E5]"
                            />
                            <span>
                              {opt.id}
                              {opt.text && opt.text !== opt.id ? `. ${opt.text}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {field.type === "TRUE_FALSE" && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: true, label: tr("Đúng (True)", "True") },
                        { v: false, label: "Sai (False)" },
                      ].map((opt) => (
                        <button
                          key={String(opt.v)}
                          type="button"
                          disabled={disabled}
                          onClick={() => onChange?.(field.id, opt.v)}
                          className={cn(
                            "rounded-xl border py-2 text-xs font-semibold transition",
                            val === opt.v
                              ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                              : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-200"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {field.type === "DROPDOWN" && (
                    <select
                      disabled={disabled}
                      value={typeof val === "string" ? val : ""}
                      onChange={(e) => onChange?.(field.id, e.target.value)}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-[#4F46E5]"
                    >
                      <option value="">{tr("Chọn đáp án…", "Choose an answer…")}</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.text || opt.id}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "CHECKBOX" && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: true, label: "✓ Tick" },
                        { v: false, label: tr("✗ Không tick", "✗ No tick") },
                      ].map((opt) => (
                        <button
                          key={String(opt.v)}
                          type="button"
                          disabled={disabled}
                          onClick={() => onChange?.(field.id, opt.v)}
                          className={cn(
                            "rounded-xl border py-2 text-xs font-semibold transition",
                            val === opt.v
                              ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                              : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-200"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {(field.type === "TEXT" || field.type === "NUMBER") && (
                    <input
                      type="text"
                      inputMode={field.type === "NUMBER" ? "decimal" : "text"}
                      disabled={disabled}
                      value={val !== null && val !== undefined ? String(val) : ""}
                      onChange={(e) => onChange?.(field.id, e.target.value)}
                      spellCheck={disableSpellcheck ? false : undefined}
                      autoComplete={disableSpellcheck ? "off" : undefined}
                      autoCorrect={disableSpellcheck ? "off" : undefined}
                      autoCapitalize={disableSpellcheck ? "off" : undefined}
                      data-gramm={disableSpellcheck ? "false" : undefined}
                      placeholder={
                        field.type === "NUMBER" ? tr("Nhập số…", "Enter a number…") : tr("Nhập câu trả lời ngắn…", "Enter a short answer…")
                      }
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#4F46E5]"
                    />
                  )}

                  {field.type === "ESSAY" && (
                    <textarea
                      disabled={disabled}
                      rows={3}
                      value={typeof val === "string" ? val : ""}
                      onChange={(e) => onChange?.(field.id, e.target.value)}
                      spellCheck={disableSpellcheck ? false : undefined}
                      autoComplete={disableSpellcheck ? "off" : undefined}
                      autoCorrect={disableSpellcheck ? "off" : undefined}
                      autoCapitalize={disableSpellcheck ? "off" : undefined}
                      data-gramm={disableSpellcheck ? "false" : undefined}
                      placeholder={tr("Nhập bài viết tự luận…", "Write your essay…")}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-[#4F46E5]"
                    />
                  )}

                  {field.type === "DICTATION" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-indigo-600">
                        <span className="inline-flex items-center gap-1">
                          <ClipboardX className="h-3 w-3" />
                          {tr("Chép chính tả — tự gõ, chặn dán & gợi ý chính tả", "Dictation — type manually, paste & spellcheck disabled")}
                        </span>
                      </div>
                      <textarea
                        disabled={disabled}
                        rows={4}
                        data-dictation-field-id={field.id}
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => onChange?.(field.id, e.target.value)}
                        onPaste={(e) => e.preventDefault()}
                        onDrop={(e) => e.preventDefault()}
                        onDragOver={(e) => e.preventDefault()}
                        onBeforeInput={(e) => {
                          const native = e.nativeEvent as InputEvent;
                          if (
                            native.inputType === "insertFromPaste" ||
                            native.inputType === "insertFromDrop" ||
                            native.inputType === "insertFromYank" ||
                            native.inputType === "insertReplacementText"
                          ) {
                            e.preventDefault();
                          }
                        }}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        data-gramm="false"
                        data-gramm_editor="false"
                        data-enable-grammarly="false"
                        placeholder={tr("Nghe file âm thanh và chép lại chính xác những gì bạn nghe được…", "Listen to the audio and type exactly what you hear…")}
                        className="w-full rounded-xl border border-indigo-200 bg-white p-2.5 text-xs leading-relaxed outline-none focus:border-[#4F46E5]"
                      />
                    </div>
                  )}
                </div>

                {/* Result & revealed answer */}
                {revealResult && (
                  <div className="mt-2 space-y-1 text-[11px]">
                    {grade?.score !== null && grade?.score !== undefined && (
                      <p className="font-semibold text-slate-600">
                        {tr("Điểm câu này:", "Score for this question:")} {grade.score}/{field.points}
                      </p>
                    )}
                    {field.type === "DICTATION" && grade?.gradeDetail && (
                      <DictationDiffView detail={grade.gradeDetail} showExpected={revealKey} />
                    )}
                    {revealedText && !(field.type === "DICTATION" && grade?.gradeDetail) && (
                      <p className="font-semibold text-emerald-700">
                        {vi.assignments.do.correctAnswer}: {revealedText}
                      </p>
                    )}
                    {revealedText && field.type === "DICTATION" && grade?.gradeDetail && (
                      <p className="font-semibold text-emerald-700">
                        {tr("Transcript chuẩn:", "Expected transcript:")} {revealedText}
                      </p>
                    )}
                    {field.explanation && (
                      <p className="text-slate-600">{tr("Giải thích:", "Explanation:")} {field.explanation}</p>
                    )}
                    {grade?.teacherNote && (
                      <p className="font-medium text-amber-700">
                        {vi.assignments.do.teacherNote}: {grade.teacherNote}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (wide) {
    return (
      <section
        data-testid="answer-sheet-wide"
        className="flex w-full min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-card"
      >
        {panelContent}
      </section>
    );
  }

  return (
    <>
      {/* Desktop right sidebar */}
      <aside className="hidden lg:flex lg:w-[340px] lg:shrink-0 lg:flex-col rounded-2xl border border-slate-200/80 bg-white shadow-card max-h-[calc(100vh-140px)] sticky top-24">
        {panelContent}
      </aside>

      {/* Mobile bottom sheet (viewport < 1024px, incl. 375px) */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {mobileOpen && (
          <div className="max-h-[70vh] overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl">
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="h-1.5 w-12 rounded-full bg-slate-300"
                aria-label={tr("Thu gọn phiếu trả lời", "Collapse answer sheet")}
              />
            </div>
            <div className="h-[64vh]">{panelContent}</div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex w-full items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#3525CD] shadow-lg"
        >
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {vi.assignments.do.answerSheetTitle} ({answeredCount}/{allFields.length})
          </span>
          <ChevronUp className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} />
        </button>
      </div>
    </>
  );
}
