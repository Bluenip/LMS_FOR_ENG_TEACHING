"use client";

import { useMemo } from "react";
import { isNumberArray, type AnswerValue, type HighlightOptions } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface HighlightQuestionInputProps {
  fieldId: string;
  options: HighlightOptions;
  value: AnswerValue;
  onChange: (val: number[]) => void;
  disabled?: boolean;
}

export function HighlightQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: HighlightQuestionInputProps) {
  const { tr } = useI18n();
  const tokens = useMemo(() => (Array.isArray(options.tokens) ? options.tokens : []), [options.tokens]);
  const selectedSet = useMemo(() => new Set(isNumberArray(value) ? value : []), [value]);

  const toggleIndex = (idx: number) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  return (
    <div className="space-y-2" data-testid={`highlight-input-${fieldId}`}>
      <p className="text-[11px] text-[#464555]">
        {tr("Chạm vào các từ bạn muốn tô sáng:", "Tap words to highlight:")}
      </p>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-3 leading-relaxed">
        {tokens.map((tok, idx) => {
          const active = selectedSet.has(idx);
          return (
            <button
              key={`${idx}-${tok}`}
              type="button"
              disabled={disabled}
              data-testid={`highlight-token-${fieldId}-${idx}`}
              onClick={() => toggleIndex(idx)}
              className={cn(
                "min-h-[34px] rounded-lg border px-2 py-1 text-sm transition",
                active
                  ? "border-amber-500 bg-amber-200/80 font-bold text-amber-950"
                  : "border-transparent bg-slate-50 hover:bg-slate-100 text-[#0B1C30]"
              )}
            >
              {tok}
            </button>
          );
        })}
      </div>
    </div>
  );
}
