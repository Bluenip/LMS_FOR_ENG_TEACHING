"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import {
  isTrueFalseGroupAnswer,
  type AnswerValue,
  type FieldOption,
  type TrueFalseGroupAnswerValue,
  type TrueFalseScoringMode,
} from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { MathText } from "./MathText";

interface TrueFalseGroupInputProps {
  fieldId: string;
  options?: FieldOption[] | null;
  value: AnswerValue;
  onChange?: (next: TrueFalseGroupAnswerValue) => void;
  disabled?: boolean;
  revealResult?: boolean;
  revealKey?: boolean;
  revealedCorrect?: Record<string, boolean> | null;
  tfScoring?: TrueFalseScoringMode;
  compact?: boolean;
}

const DEFAULT_OPTIONS: FieldOption[] = [
  { id: "a", text: "" },
  { id: "b", text: "" },
  { id: "c", text: "" },
  { id: "d", text: "" },
];

export function TrueFalseGroupInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
  revealResult = false,
  revealKey = false,
  revealedCorrect = null,
  tfScoring,
  compact = false,
}: TrueFalseGroupInputProps) {
  const { tr } = useI18n();
  const stmts = options && options.length > 0 ? options : DEFAULT_OPTIONS;
  const currentMap: TrueFalseGroupAnswerValue = isTrueFalseGroupAnswer(value) ? value : {};

  const setStatementValue = (stmtId: string, val: boolean) => {
    onChange?.({
      ...currentMap,
      [stmtId]: val,
    });
  };

  return (
    <div className="space-y-2" data-tf-group-field-id={fieldId}>
      {!compact && (
        <p className="text-[11px] font-medium text-[#464555]">
          {tfScoring === "ALL_OR_NOTHING"
            ? tr(
                "Chọn Đúng hoặc Sai cho từng ý (phải đúng cả 4 ý mới được điểm).",
                "Choose True or False for each statement (all correct required for points)."
              )
            : tfScoring === "EQUAL"
              ? tr(
                  "Chọn Đúng hoặc Sai cho từng ý (mỗi ý đúng tính điểm đều nhau).",
                  "Choose True or False for each statement (equal weight per statement)."
                )
              : tr(
                  "Chọn Đúng hoặc Sai cho từng ý (chỉ đúng cả 4 ý mới đạt trọn 100% điểm).",
                  "Choose True or False for each statement (all 4 correct required for full credit)."
                )}
        </p>
      )}
      <div className="space-y-2">
        {stmts.map((stmt) => {
          const picked = currentMap[stmt.id];
          const expected = revealedCorrect ? revealedCorrect[stmt.id] : undefined;
          const showCheck = revealResult && revealKey && typeof expected === "boolean";
          const isStmtRight = showCheck && picked === expected;

          return (
            <div
              key={stmt.id}
              data-tf-stmt={`${fieldId}-${stmt.id}`}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center sm:justify-between",
                showCheck
                  ? isStmtRight
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-red-200 bg-red-50"
                  : "border-slate-200 bg-white"
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-2 text-sm text-[#0B1C30]">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#EEF2FF] text-xs font-bold text-[#3525CD]">
                  {stmt.id}
                </span>
                <div className="min-w-0 flex-1 leading-relaxed">
                  {stmt.text && stmt.text !== stmt.id ? (
                    <MathText text={stmt.text} />
                  ) : (
                    <span className="text-slate-400">
                      {tr(`Mệnh đề ${stmt.id}`, `Statement ${stmt.id}`)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {[
                  { v: true, label: tr("Đúng", "True") },
                  { v: false, label: tr("Sai", "False") },
                ].map((choice) => {
                  const active = picked === choice.v;
                  return (
                    <button
                      key={String(choice.v)}
                      type="button"
                      disabled={disabled}
                      onClick={() => setStatementValue(stmt.id, choice.v)}
                      data-tf-btn={`${fieldId}-${stmt.id}-${choice.v ? "T" : "F"}`}
                      className={cn(
                        "min-w-[64px] rounded-lg border px-3 py-1.5 text-xs font-bold transition",
                        active
                          ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                          : "border-slate-200 bg-[#F8F9FF] text-[#464555] hover:border-indigo-300"
                      )}
                    >
                      {choice.label}
                    </button>
                  );
                })}

                {showCheck && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-bold">
                    {isStmtRight ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
