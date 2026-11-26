"use client";

import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardX,
  Flag,
  Send,
  XCircle,
} from "lucide-react";
import type { AnswerValue, DictationGradeDetail } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatRevealedAnswer,
  isAnswerFilled,
  type StudentFieldDTO,
  type WorksheetAudioDTO,
  type WorksheetPassageDTO,
} from "./types";
import { LimitedAudioPlayer } from "./LimitedAudioPlayer";
import { DictationDiffView } from "./DictationDiffView";
import { PromptText } from "./PromptText";
import { MathText } from "./MathText";
import { PassageCard } from "./PassageCard";
import { TrueFalseGroupInput } from "./TrueFalseGroupInput";
import { PhotoUploadInput } from "./PhotoUploadInput";

interface FocusQuestionGroup {
  key: string;
  displayLabel: string;
  fields: StudentFieldDTO[];
  isMultiBlankSentence: boolean;
}

const SUB_BLANK_LABEL_RE = /^(\d+)([a-z])$/i;
const INLINE_BLANK_SPLIT_RE = /(____ \[[^\]]+\] ____|________)/g;

/**
 * Groups consecutive multi-blank TEXT fields (e.g. 7a, 7b or 10a, 10b, 10c)
 * onto one calm sentence screen, while keeping all other questions 1 per screen.
 */
function buildQuestionGroups(fields: StudentFieldDTO[]): FocusQuestionGroup[] {
  const groups: FocusQuestionGroup[] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i]!;
    const subMatch = f.type === "TEXT" ? SUB_BLANK_LABEL_RE.exec(f.label) : null;
    if (subMatch && f.prompt && f.prompt.includes("____ [")) {
      const baseNum = subMatch[1]!;
      const grouped: StudentFieldDTO[] = [f];
      let j = i + 1;
      while (j < fields.length) {
        const next = fields[j]!;
        const nm = next.type === "TEXT" ? SUB_BLANK_LABEL_RE.exec(next.label) : null;
        if (nm && nm[1] === baseNum && next.prompt && next.prompt.includes("____ [")) {
          grouped.push(next);
          j++;
        } else {
          break;
        }
      }
      if (grouped.length > 1) {
        groups.push({
          key: `group-${baseNum}-${f.id}`,
          displayLabel: baseNum,
          fields: grouped,
          isMultiBlankSentence: true,
        });
        i = j;
        continue;
      }
    }
    groups.push({
      key: f.id,
      displayLabel: f.label,
      fields: [f],
      isMultiBlankSentence: false,
    });
    i++;
  }
  return groups;
}

interface FocusQuestionRunnerProps {
  allFields: StudentFieldDTO[];
  passages?: WorksheetPassageDTO[];
  answers: Record<string, AnswerValue>;
  onChange?: (fieldId: string, value: AnswerValue) => void;
  onOpenSubmit?: () => void;
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

export function FocusQuestionRunner({
  allFields,
  passages = [],
  answers,
  onChange,
  onOpenSubmit,
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
  onAudioPlayCountChange,
  gradeByFieldId = {},
}: FocusQuestionRunnerProps) {
  const { m: vi, tr } = useI18n();
  const groups = useMemo(() => buildQuestionGroups(allFields), [allFields]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(new Set());
  const blankInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const safeIdx = Math.min(currentIndex, Math.max(0, groups.length - 1));
  const currentGroup = groups[safeIdx];

  const answeredFieldCount = allFields.filter((f) => isAnswerFilled(answers[f.id])).length;
  const pct = allFields.length > 0 ? Math.round((answeredFieldCount / allFields.length) * 100) : 0;

  const toggleFlag = (key: string) => {
    setFlaggedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const goNext = () => {
    if (safeIdx < groups.length - 1) {
      setCurrentIndex(safeIdx + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goPrev = () => {
    if (safeIdx > 0) {
      setCurrentIndex(safeIdx - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!currentGroup) {
    return (
      <div className="stitch-card mx-auto max-w-2xl p-10 text-center text-sm text-slate-400">
        {tr("Bài tập chưa có câu hỏi nào.", "This assignment has no questions yet.")}
      </div>
    );
  }

  const isFlagged = flaggedKeys.has(currentGroup.key);
  const groupPoints =
    Math.round(currentGroup.fields.reduce((s, f) => s + f.points, 0) * 100) / 100;
  const singleField = currentGroup.fields[0]!;
  const linkedAudio = singleField.audioId
    ? audios.find((a) => a.id === singleField.audioId) ?? null
    : null;
  const linkedPassage = singleField.passageId
    ? passages.find((p) => p.id === singleField.passageId) ?? null
    : null;

  // Render inline blanks inside a sentence for single-blank or multi-blank TEXT questions
  const canRenderInlineSentence =
    currentGroup.fields.every((f) => f.type === "TEXT") &&
    Boolean(singleField.prompt && (singleField.prompt.includes("________") || singleField.prompt.includes("____ [")));

  const renderInlineSentence = () => {
    const template = singleField.prompt ?? "";
    const parts = template.split(INLINE_BLANK_SPLIT_RE);
    let blankIdx = 0;

    return (
      <div
        data-testid="focus-inline-sentence"
        className="text-lg sm:text-xl leading-loose font-medium text-[#0B1C30]"
      >
        {parts.map((part, idx) => {
          const isBlank = part === "________" || /^____ \[[^\]]+\] ____$/.test(part);
          if (!isBlank) {
            return <MathText key={idx} text={part} />;
          }
          const field = currentGroup.fields[blankIdx];
          const myBlankIdx = blankIdx;
          blankIdx++;
          if (!field) return <span key={idx}>{part}</span>;

          const val = typeof answers[field.id] === "string" ? (answers[field.id] as string) : "";
          const g = gradeByFieldId[field.id];
          const minWidthCh = Math.max(14, Math.min(46, val.length + 4));

          return (
            <span key={field.id} className="inline-block align-baseline mx-1 my-1">
              <input
                ref={(el) => {
                  blankInputRefs.current[myBlankIdx] = el;
                }}
                type="text"
                data-focus-field-id={field.id}
                aria-label={tr(`Điền chỗ trống câu ${field.label}`, `Fill blank ${field.label}`)}
                disabled={disabled}
                value={val}
                onChange={(e) => onChange?.(field.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const nextInput = blankInputRefs.current[myBlankIdx + 1];
                    if (nextInput) {
                      nextInput.focus();
                    } else if (safeIdx < groups.length - 1) {
                      goNext();
                    }
                  }
                }}
                spellCheck={disableSpellcheck ? false : undefined}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                data-gramm={disableSpellcheck ? "false" : undefined}
                placeholder={tr("Nhập đáp án…", "Type answer…")}
                style={{ width: `${minWidthCh}ch`, maxWidth: "100%" }}
                className={cn(
                  "rounded-xl border-2 px-3 py-1.5 text-base sm:text-lg font-semibold outline-none transition",
                  revealResult && g?.isCorrect === true
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : revealResult && g?.isCorrect === false
                      ? "border-red-500 bg-red-50 text-red-800"
                      : "border-[#4F46E5]/60 bg-white text-[#0B1C30] focus:border-[#3525CD] focus:ring-2 focus:ring-indigo-200"
                )}
              />
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div data-testid="focus-question-runner" className="mx-auto max-w-3xl space-y-5">
      {/* Compact Progress Header + Question Navigator Pills */}
      <div className="stitch-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-[#0B1C30]">
            {tr("Chế độ tập trung — Câu", "Focus mode — Question")}{" "}
            <span className="text-[#4F46E5] tabular-nums">
              {safeIdx + 1} / {groups.length}
            </span>
          </span>
          <span className="font-semibold text-[#464555] tabular-nums">
            {tr("Đã điền:", "Answered:")} {answeredFieldCount}/{allFields.length} ({pct}%)
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#4F46E5] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {groups.map((grp, idx) => {
            const allFilled = grp.fields.every((f) => isAnswerFilled(answers[f.id]));
            const someFilled = grp.fields.some((f) => isAnswerFilled(answers[f.id]));
            const grpFlagged = flaggedKeys.has(grp.key);
            const allRight =
              revealResult && grp.fields.every((f) => gradeByFieldId[f.id]?.isCorrect === true);
            const anyWrong =
              revealResult && grp.fields.some((f) => gradeByFieldId[f.id]?.isCorrect === false);

            let pillStyle = "bg-slate-100 text-slate-600 hover:bg-indigo-50";
            if (allRight) pillStyle = "bg-emerald-500 text-white";
            else if (anyWrong) pillStyle = "bg-red-500 text-white";
            else if (grpFlagged) pillStyle = "bg-[#F97316] text-white";
            else if (allFilled) pillStyle = "bg-[#4F46E5] text-white";
            else if (someFilled) pillStyle = "bg-indigo-100 text-[#3525CD]";

            return (
              <button
                key={grp.key}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "flex h-8 min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-bold transition tabular-nums",
                  pillStyle,
                  idx === safeIdx && "ring-2 ring-[#F97316] ring-offset-1"
                )}
              >
                {grp.displayLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Single Focused Question Card */}
      <div className="stitch-card p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 min-w-[36px] items-center justify-center rounded-xl bg-[#4F46E5] px-2.5 text-sm font-extrabold text-white">
              {tr("Câu", "Q")} {currentGroup.displayLabel}
            </span>
            <Badge variant="neutral">
              {groupPoints} {tr("điểm", "pt")}
            </Badge>
            {singleField.skillTag && (
              <Badge variant="default">{vi.skills[singleField.skillTag]}</Badge>
            )}
          </div>

          {!disabled && (
            <button
              type="button"
              onClick={() => toggleFlag(currentGroup.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                isFlagged
                  ? "border-orange-300 bg-orange-50 text-[#EA580C]"
                  : "border-slate-200 bg-white text-slate-500 hover:border-orange-200"
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              {isFlagged ? tr("Đã gắn cờ", "Flagged") : tr("Đánh dấu xem lại", "Flag")}
            </button>
          )}
        </div>

        {/* Linked Audio Player if attached */}
        {linkedAudio && (
          <LimitedAudioPlayer
            audio={linkedAudio}
            submissionId={submissionId}
            playsUsed={audioPlayCounts[linkedAudio.id] ?? 0}
            maxPlays={audioMaxPlays}
            blockPause={audioBlockPause}
            blockSeek={audioBlockSeek}
            disabled={disabled}
            onPlayCountChange={onAudioPlayCountChange}
          />
        )}

        {/* Linked Shared Reading Passage if attached */}
        {linkedPassage && <PassageCard passage={linkedPassage} />}

        {/* Question Body */}
        {canRenderInlineSentence ? (
          <div className="space-y-4">
            {renderInlineSentence()}
            {!disabled && (
              <p className="text-xs text-slate-400">
                {tr("Mẹo: Nhấn Enter để chuyển nhanh sang ô/câu tiếp theo.", "Tip: Press Enter to jump to the next blank/question.")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {singleField.prompt && (
              <p className="text-base sm:text-lg font-semibold leading-relaxed text-[#0B1C30]">
                <PromptText text={singleField.prompt} />
              </p>
            )}

            {singleField.type === "MULTIPLE_CHOICE" && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(singleField.options ?? []).map((opt) => {
                  const selected = answers[singleField.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange?.(singleField.id, opt.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition",
                        selected
                          ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                          : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-200"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          selected ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {opt.id}
                      </span>
                      <span>
                        {opt.text && opt.text !== opt.id ? <MathText text={opt.text} /> : opt.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {singleField.type === "MULTI_SELECT" && (
              <div className="space-y-2">
                {(singleField.options ?? []).map((opt) => {
                  const list = Array.isArray(answers[singleField.id])
                    ? (answers[singleField.id] as string[])
                    : [];
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
                        onChange?.(singleField.id, next);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition",
                        selected
                          ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                          : "border-slate-200 bg-white text-[#0B1C30]"
                      )}
                    >
                      <input type="checkbox" readOnly checked={selected} className="accent-[#4F46E5]" />
                      <span>
                        {opt.id}
                        {opt.text && opt.text !== opt.id ? (
                          <>
                            {". "}
                            <MathText text={opt.text} />
                          </>
                        ) : (
                          ""
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {singleField.type === "TRUE_FALSE" && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: true, label: tr("Đúng (True)", "True") },
                  { v: false, label: tr("Sai (False)", "False") },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange?.(singleField.id, opt.v)}
                    className={cn(
                      "rounded-2xl border-2 py-3.5 text-sm font-bold transition",
                      answers[singleField.id] === opt.v
                        ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                        : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-200"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {singleField.type === "TRUE_FALSE_GROUP" && (
              <TrueFalseGroupInput
                fieldId={singleField.id}
                options={singleField.options}
                value={answers[singleField.id]}
                onChange={(next) => onChange?.(singleField.id, next)}
                disabled={disabled}
                revealResult={revealResult}
                revealKey={revealKey}
                revealedCorrect={
                  (singleField.revealedAnswer?.correct as Record<string, boolean> | undefined) ?? null
                }
              />
            )}

            {singleField.type === "PHOTO_UPLOAD" && (
              <PhotoUploadInput
                submissionId={submissionId}
                fieldId={singleField.id}
                value={answers[singleField.id]}
                onChange={(next) => onChange?.(singleField.id, next)}
                disabled={disabled}
              />
            )}

            {singleField.type === "DROPDOWN" && (
              <select
                disabled={disabled}
                value={typeof answers[singleField.id] === "string" ? (answers[singleField.id] as string) : ""}
                onChange={(e) => onChange?.(singleField.id, e.target.value)}
                className="h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value="">{tr("Chọn đáp án…", "Choose an answer…")}</option>
                {(singleField.options ?? []).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.text || opt.id}
                  </option>
                ))}
              </select>
            )}

            {singleField.type === "CHECKBOX" && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: true, label: "✓ Tick" },
                  { v: false, label: tr("✗ Không tick", "✗ No tick") },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange?.(singleField.id, opt.v)}
                    className={cn(
                      "rounded-2xl border-2 py-3 text-sm font-bold transition",
                      answers[singleField.id] === opt.v
                        ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                        : "border-slate-200 bg-white text-[#0B1C30]"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {(singleField.type === "TEXT" || singleField.type === "NUMBER") && (
              <input
                type="text"
                inputMode={singleField.type === "NUMBER" ? "decimal" : "text"}
                disabled={disabled}
                value={
                  answers[singleField.id] !== null && answers[singleField.id] !== undefined
                    ? String(answers[singleField.id])
                    : ""
                }
                onChange={(e) => onChange?.(singleField.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && safeIdx < groups.length - 1) {
                    e.preventDefault();
                    goNext();
                  }
                }}
                spellCheck={disableSpellcheck ? false : undefined}
                autoComplete={disableSpellcheck ? "off" : undefined}
                autoCorrect={disableSpellcheck ? "off" : undefined}
                autoCapitalize={disableSpellcheck ? "off" : undefined}
                data-gramm={disableSpellcheck ? "false" : undefined}
                placeholder={
                  singleField.type === "NUMBER"
                    ? tr("Nhập số…", "Enter a number…")
                    : tr("Nhập câu trả lời…", "Enter your answer…")
                }
                className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-base font-medium outline-none focus:border-[#4F46E5]"
              />
            )}

            {singleField.type === "ESSAY" && (
              <textarea
                disabled={disabled}
                rows={5}
                value={
                  typeof answers[singleField.id] === "string"
                    ? (answers[singleField.id] as string)
                    : ""
                }
                onChange={(e) => onChange?.(singleField.id, e.target.value)}
                spellCheck={disableSpellcheck ? false : undefined}
                autoComplete={disableSpellcheck ? "off" : undefined}
                autoCorrect={disableSpellcheck ? "off" : undefined}
                autoCapitalize={disableSpellcheck ? "off" : undefined}
                data-gramm={disableSpellcheck ? "false" : undefined}
                placeholder={tr("Nhập bài viết tự luận…", "Write your essay…")}
                className="w-full rounded-xl border-2 border-slate-200 bg-white p-3.5 text-sm leading-relaxed outline-none focus:border-[#4F46E5]"
              />
            )}

            {singleField.type === "DICTATION" && (
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">
                  <ClipboardX className="h-3.5 w-3.5" />
                  {tr("Chép chính tả — tự gõ, chặn dán & tắt kiểm tra chính tả", "Dictation — type manually, paste & spellcheck disabled")}
                </span>
                <textarea
                  disabled={disabled}
                  rows={5}
                  data-dictation-field-id={singleField.id}
                  value={
                    typeof answers[singleField.id] === "string"
                      ? (answers[singleField.id] as string)
                      : ""
                  }
                  onChange={(e) => onChange?.(singleField.id, e.target.value)}
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
                  placeholder={tr("Nghe file âm thanh và gõ chính xác những gì bạn nghe được…", "Listen and type exactly what you hear…")}
                  className="w-full rounded-xl border-2 border-indigo-200 bg-white p-3.5 text-base leading-relaxed outline-none focus:border-[#4F46E5]"
                />
              </div>
            )}
          </div>
        )}

        {/* Per-field Feedback / Result after submission */}
        {revealResult && (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-[#F8F9FF] p-4 text-xs">
            {currentGroup.fields.map((f) => {
              const g = gradeByFieldId[f.id];
              const revealed =
                revealKey && f.revealedAnswer
                  ? formatRevealedAnswer(f.type, f.revealedAnswer, f.options, tr)
                  : "";
              return (
                <div key={f.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {g?.isCorrect === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {g?.isCorrect === false && <XCircle className="h-4 w-4 text-red-600" />}
                    <span className="font-bold text-[#0B1C30]">
                      {currentGroup.fields.length > 1 ? `${tr("Ô", "Blank")} ${f.label}: ` : ""}
                      {g?.score !== null && g?.score !== undefined
                        ? `${g.score}/${f.points} ${tr("điểm", "pt")}`
                        : tr("Chờ chấm", "Pending")}
                    </span>
                    {revealed && f.type !== "DICTATION" && (
                      <span className="font-semibold text-emerald-700">
                        • {vi.assignments.do.correctAnswer}: {revealed}
                      </span>
                    )}
                  </div>
                  {f.type === "DICTATION" && g?.gradeDetail && (
                    <DictationDiffView detail={g.gradeDetail} showExpected={revealKey} />
                  )}
                  {revealed && f.type === "DICTATION" && (
                    <p className="font-semibold text-emerald-700">
                      {tr("Transcript chuẩn:", "Expected transcript:")} {revealed}
                    </p>
                  )}
                  {f.explanation && (
                    <p className="text-slate-600">
                      <MathText text={f.explanation} />
                    </p>
                  )}
                  {g?.teacherNote && (
                    <p className="font-medium text-amber-700">
                      {vi.assignments.do.teacherNote}: {g.teacherNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Prev / Next / Submit Navigation */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={goPrev}
            disabled={safeIdx === 0}
            data-testid="focus-prev-btn"
          >
            <ChevronLeft className="h-4 w-4" />
            {tr("Câu trước", "Previous")}
          </Button>

          {safeIdx < groups.length - 1 ? (
            <Button
              type="button"
              onClick={goNext}
              data-testid="focus-next-btn"
            >
              {tr("Câu tiếp theo", "Next question")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : !disabled && onOpenSubmit ? (
            <Button
              type="button"
              variant="accent"
              onClick={onOpenSubmit}
              data-testid="focus-finish-submit-btn"
            >
              <Send className="h-4 w-4" />
              {vi.assignments.do.submit}
            </Button>
          ) : (
            <span className="text-xs font-semibold text-slate-400">
              {tr("Câu cuối cùng", "Last question")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
