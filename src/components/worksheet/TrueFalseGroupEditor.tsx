"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FieldOption, GradingOptions, TrueFalseScoringMode } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TrueFalseGroupEditorProps {
  fieldId: string;
  options: FieldOption[] | null | undefined;
  answerKey: Record<string, unknown>;
  gradingOpts: GradingOptions | null | undefined;
  onChange: (patch: {
    options?: FieldOption[];
    answerKey?: Record<string, unknown>;
    gradingOpts?: GradingOptions;
  }) => void;
  compact?: boolean;
}

const DEFAULT_STMTS: FieldOption[] = [
  { id: "a", text: "" },
  { id: "b", text: "" },
  { id: "c", text: "" },
  { id: "d", text: "" },
];

export function TrueFalseGroupEditor({
  fieldId,
  options,
  answerKey,
  gradingOpts,
  onChange,
  compact = false,
}: TrueFalseGroupEditorProps) {
  const { tr } = useI18n();
  const stmts = options && options.length > 0 ? options : DEFAULT_STMTS;
  const rawCorrect =
    answerKey.correct && typeof answerKey.correct === "object" && !Array.isArray(answerKey.correct)
      ? (answerKey.correct as Record<string, boolean>)
      : {};
  const tfScoring: TrueFalseScoringMode = gradingOpts?.tfScoring ?? "THPT_2025";

  const setCorrect = (stmtId: string, val: boolean) => {
    onChange({
      answerKey: {
        ...answerKey,
        correct: { ...rawCorrect, [stmtId]: val },
      },
    });
  };

  const setText = (idx: number, text: string) => {
    const next = [...stmts];
    const target = next[idx];
    if (!target) return;
    next[idx] = { ...target, text };
    onChange({ options: next });
  };

  const addStatement = () => {
    const nextLetter = String.fromCharCode(97 + stmts.length); // a, b, c, d, e...
    const next = [...stmts, { id: nextLetter, text: "" }];
    onChange({
      options: next,
      answerKey: {
        ...answerKey,
        correct: { ...rawCorrect, [nextLetter]: true },
      },
    });
  };

  const removeStatement = (idx: number) => {
    if (stmts.length <= 2) return;
    const removed = stmts[idx];
    const next = stmts.filter((_, i) => i !== idx);
    const nextCorrect = { ...rawCorrect };
    if (removed) delete nextCorrect[removed.id];
    onChange({
      options: next,
      answerKey: { ...answerKey, correct: nextCorrect },
    });
  };

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Cách tính điểm", "Scoring rule")}</Label>
          <select
            value={tfScoring}
            onChange={(e) =>
              onChange({
                gradingOpts: {
                  ...gradingOpts,
                  tfScoring: e.target.value as TrueFalseScoringMode,
                },
              })
            }
            data-testid={`tf-scoring-select-${fieldId}`}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#4F46E5]"
          >
            <option value="THPT_2025">
              {tr(
                "THPT 2025 (1 ý 10%, 2 ý 25%, 3 ý 50%, đủ 4 ý 100%)",
                "THPT 2025 (1=10%, 2=25%, 3=50%, all 4=100%)"
              )}
            </option>
            <option value="ALL_OR_NOTHING">
              {tr("Đúng hết tất cả các ý mới có điểm (4/4 = 100%)", "All-or-nothing (all correct = 100%)")}
            </option>
            <option value="EQUAL">
              {tr("Chia đều điểm theo mỗi ý đúng (25% / ý)", "Equal credit per statement (25% each)")}
            </option>
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        {stmts.map((stmt, idx) => {
          const isTrue = rawCorrect[stmt.id] !== false;
          return (
            <div key={stmt.id} className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#EEF2FF] text-[11px] font-bold text-[#3525CD]">
                {stmt.id}
              </span>
              {!compact && (
                <Input
                  value={stmt.text}
                  onChange={(e) => setText(idx, e.target.value)}
                  placeholder={tr(`Nội dung ý ${stmt.id} (hỗ trợ $...$)`, `Statement ${stmt.id}`)}
                  className="h-7 flex-1 text-xs"
                />
              )}
              <div className="flex shrink-0 gap-1">
                {[
                  { v: true, label: tr("Đ", "T") },
                  { v: false, label: tr("S", "F") },
                ].map((c) => (
                  <button
                    key={String(c.v)}
                    type="button"
                    onClick={() => setCorrect(stmt.id, c.v)}
                    className={cn(
                      "h-7 min-w-[28px] rounded-md px-2 text-[11px] font-bold transition",
                      isTrue === c.v
                        ? "bg-[#4F46E5] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-indigo-100"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {!compact && stmts.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeStatement(idx)}
                  className="p-0.5 text-slate-400 hover:text-red-500"
                  title={tr("Xoá ý này", "Remove statement")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!compact && stmts.length < 8 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          onClick={addStatement}
        >
          <Plus className="h-3.5 w-3.5" />
          {tr("Thêm ý (e, f…)", "Add statement")}
        </Button>
      )}
    </div>
  );
}
