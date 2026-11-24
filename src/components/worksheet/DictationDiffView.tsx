"use client";

import type { DictationGradeDetail } from "@/lib/grading/types";
import { useI18n } from "@/lib/i18n/client";

interface DictationDiffViewProps {
  detail: DictationGradeDetail;
  /** Whether expected/missing words are revealed (always true for teacher, gated by revealKey for student). */
  showExpected?: boolean;
}

export function DictationDiffView({
  detail,
  showExpected = true,
}: DictationDiffViewProps) {
  const { tr } = useI18n();
  const pct = Math.round((detail.accuracy ?? 0) * 100);

  return (
    <div
      data-testid="dictation-diff-view"
      className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-bold text-[#0B1C30]">
          {tr("Chính xác:", "Accuracy:")}{" "}
          <span className="text-[#4F46E5]">
            {detail.correctWords}/{detail.totalWords} {tr("từ", "words")} ({pct}%)
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {tr("Đúng", "Correct")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {tr("Sai", "Wrong")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            {tr("Thừa", "Extra")}
          </span>
          {showExpected && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {tr("[Thiếu]", "[Missing]")}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 leading-relaxed">
        {detail.tokens.map((tok, idx) => {
          if (tok.kind === "correct") {
            return (
              <span
                key={idx}
                className="rounded bg-emerald-50 px-1 py-0.5 font-medium text-emerald-700"
              >
                {tok.text}
              </span>
            );
          }
          if (tok.kind === "wrong") {
            return (
              <span
                key={idx}
                className="rounded bg-red-50 px-1 py-0.5 font-semibold text-red-700"
                title={
                  showExpected && tok.expected
                    ? tr(`Đúng là: ${tok.expected}`, `Expected: ${tok.expected}`)
                    : undefined
                }
              >
                {tok.text}
                {showExpected && tok.expected && (
                  <span className="ml-1 text-[10px] font-normal text-emerald-700">
                    ({tok.expected})
                  </span>
                )}
              </span>
            );
          }
          if (tok.kind === "extra") {
            return (
              <span
                key={idx}
                className="rounded bg-slate-100 px-1 py-0.5 text-slate-500 line-through"
                title={tr("Từ thừa", "Extra word")}
              >
                {tok.text}
              </span>
            );
          }
          // missing
          if (!showExpected) return null;
          return (
            <span
              key={idx}
              className="rounded border border-dashed border-amber-400 bg-amber-50 px-1 py-0.5 font-semibold text-amber-800"
              title={tr("Từ bị thiếu", "Missing word")}
            >
              [{tok.text}]
            </span>
          );
        })}
      </div>
    </div>
  );
}
