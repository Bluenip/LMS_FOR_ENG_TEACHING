"use client";

import { useState } from "react";
import type { FieldType } from "@prisma/client";
import {
  isCodeAnswer,
  isDrawAnswer,
  isNumberArray,
  isSpeakingAnswer,
  isStringArray,
  isVoiceAnswer,
  isWordsearchAnswer,
  type DictationGradeDetail,
  type HighlightOptions,
} from "@/lib/grading/types";
import { DictationDiffView } from "@/components/worksheet/DictationDiffView";
import { PhotoLightboxModal } from "@/components/worksheet/PhotoLightboxModal";
import { useI18n } from "@/lib/i18n/client";

interface InteractiveAnswerReviewProps {
  type: FieldType;
  value: unknown;
  options?: unknown;
  answerKey?: Record<string, unknown> | null;
  gradeDetail?: DictationGradeDetail | null;
}

export function InteractiveAnswerReview({
  type,
  value,
  options,
  answerKey,
  gradeDetail,
}: InteractiveAnswerReviewProps) {
  const { tr } = useI18n();
  const [drawZoomOpen, setDrawZoomOpen] = useState(false);

  if (type === "VOICE_ANSWER") {
    if (!isVoiceAnswer(value)) {
      return <p className="text-xs italic text-slate-400">{tr("Chưa có file ghi âm", "No recording")}</p>;
    }
    return (
      <div className="space-y-1">
        <audio controls src={`/api/files/${value.fileKey}`} className="h-9 w-full" />
        {typeof value.durationSec === "number" && (
          <p className="text-[11px] text-slate-400">{value.durationSec}s</p>
        )}
      </div>
    );
  }

  if (type === "DRAW") {
    if (!isDrawAnswer(value)) {
      return <p className="text-xs italic text-slate-400">{tr("Chưa có hình vẽ", "No drawing")}</p>;
    }
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setDrawZoomOpen(true)}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${value.fileKey}`}
            alt={tr("Hình vẽ bài làm", "Student drawing")}
            className="h-28 w-44 object-contain"
          />
        </button>
        {drawZoomOpen && (
          <PhotoLightboxModal
            files={[{ key: value.fileKey, name: tr("Hình vẽ học sinh", "Student drawing"), mimeType: "image/png" }]}
            initialIndex={0}
            open={true}
            onClose={() => setDrawZoomOpen(false)}
          />
        )}
      </div>
    );
  }

  if (type === "CODE") {
    const ans = isCodeAnswer(value) ? value : null;
    const refCode = typeof answerKey?.referenceCode === "string" ? answerKey.referenceCode : "";
    return (
      <div className="space-y-1.5 text-xs">
        <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] text-slate-100">
          {ans?.code || tr("(Chưa viết code)", "(No code)")}
        </pre>
        {ans?.lastOutput && (
          <div className="rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300">
            <strong>Output:</strong> {ans.lastOutput}
          </div>
        )}
        {refCode && (
          <details className="text-[11px] text-[#464555]">
            <summary className="cursor-pointer font-semibold">{tr("Code tham khảo", "Reference code")}</summary>
            <pre className="mt-1 overflow-auto rounded bg-slate-100 p-2 font-mono text-[11px] text-[#0B1C30]">
              {refCode}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (type === "SPEAKING") {
    const text = isSpeakingAnswer(value) ? value.text : typeof value === "string" ? value : "";
    const tries = isSpeakingAnswer(value) ? value.tries : 0;
    return (
      <div className="space-y-1 text-xs">
        <p className="font-medium text-[#0B1C30]">
          {text || tr("(Bỏ trống)", "(Blank)")}{" "}
          <span className="text-[11px] text-slate-400">({tries} {tr("lượt", "tries")})</span>
        </p>
        {gradeDetail && <DictationDiffView detail={gradeDetail} />}
      </div>
    );
  }

  if (type === "HIGHLIGHT") {
    const picked = isNumberArray(value) ? value : [];
    const tokens =
      options && !Array.isArray(options) && Array.isArray((options as HighlightOptions).tokens)
        ? (options as HighlightOptions).tokens
        : [];
    return (
      <p className="text-xs font-medium text-[#0B1C30]">
        {picked.length > 0
          ? picked.map((idx) => (tokens[idx] ? `${tokens[idx]} (#${idx})` : `#${idx}`)).join(", ")
          : tr("(Chưa tô từ nào)", "(No words highlighted)")}
      </p>
    );
  }

  if (type === "ORDERING") {
    const seq = isStringArray(value) ? value : [];
    return (
      <p className="text-xs font-medium text-[#0B1C30]">
        {seq.length > 0 ? seq.join(" → ") : tr("(Chưa sắp xếp)", "(Not ordered)")}
      </p>
    );
  }

  if (type === "WORDSEARCH") {
    const found = isWordsearchAnswer(value) ? value.found : [];
    return (
      <p className="text-xs font-medium text-[#0B1C30]">
        {found.length > 0
          ? found.map((w) => w.word).join(", ")
          : tr("(Chưa tìm được từ nào)", "(No words found)")}
      </p>
    );
  }

  if (type === "MATCH" && value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, string>);
    return (
      <p className="text-xs font-medium text-[#0B1C30]">
        {entries.length > 0
          ? entries.map(([l, r]) => `${l}→${r}`).join(", ")
          : tr("(Chưa nối)", "(Unmatched)")}
      </p>
    );
  }

  if (type === "DRAG_DROP" && value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <p className="text-xs font-medium text-[#0B1C30]">
        {entries.length > 0
          ? entries.map(([slot, toks]) => `${slot}: ${Array.isArray(toks) ? toks.join("+") : ""}`).join(" | ")
          : tr("(Trống)", "(Empty)")}
      </p>
    );
  }

  return null;
}
