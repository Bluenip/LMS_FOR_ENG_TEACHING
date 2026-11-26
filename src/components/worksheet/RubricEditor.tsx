"use client";

import { Plus, Scale, Trash2 } from "lucide-react";
import type { RubricCriterion } from "@/lib/grading/types";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RubricEditorProps {
  rubric: RubricCriterion[] | null | undefined;
  fieldPoints: number;
  compact?: boolean;
  onChange: (nextRubric: RubricCriterion[], syncedPoints?: number) => void;
}

export function RubricEditor({
  rubric,
  fieldPoints,
  compact = false,
  onChange,
}: RubricEditorProps) {
  const { tr } = useI18n();
  const items = Array.isArray(rubric) ? rubric : [];
  const totalRubricPoints =
    Math.round(items.reduce((sum, c) => sum + (Number(c.maxPoints) || 0), 0) * 100) / 100;

  const addCriterion = () => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : `c-${Date.now()}`;
    const next: RubricCriterion[] = [
      ...items,
      {
        id,
        title: tr(`Tiêu chí ${items.length + 1}`, `Criterion ${items.length + 1}`),
        description: "",
        maxPoints: 1,
      },
    ];
    onChange(next);
  };

  const updateItem = (id: string, patch: Partial<RubricCriterion>) => {
    const next = items.map((c) => (c.id === id ? { ...c, ...patch } : c));
    onChange(next);
  };

  const removeItem = (id: string) => {
    onChange(items.filter((c) => c.id !== id));
  };

  return (
    <div
      className="space-y-2 rounded-xl border border-slate-200 bg-[#F8F9FF] p-2.5"
      data-testid="rubric-editor"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#3525CD]">
          <Scale className="h-3.5 w-3.5" />
          {tr("Bảng tiêu chí chấm (Rubric)", "Grading Rubric")}
          {items.length > 0 && (
            <span className="text-slate-500 font-semibold tabular-nums">
              ({totalRubricPoints} {tr("đ", "pt")})
            </span>
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addCriterion}
          className="h-7 px-2 text-[11px]"
          data-testid="add-rubric-criterion-btn"
        >
          <Plus className="h-3 w-3" />
          {tr("Thêm tiêu chí", "Add criterion")}
        </Button>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((c, idx) => (
            <div
              key={c.id}
              className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2"
            >
              <div className="flex items-center gap-1.5">
                <Input
                  value={c.title}
                  onChange={(e) => updateItem(c.id, { title: e.target.value })}
                  placeholder={tr("Tên tiêu chí (VD: Ngữ pháp)", "Criterion title (e.g. Grammar)")}
                  className="h-7 flex-1 text-xs"
                  data-testid={`rubric-title-${idx}`}
                />
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  step="0.25"
                  value={c.maxPoints}
                  onChange={(e) =>
                    updateItem(c.id, {
                      maxPoints: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  aria-label={tr("Điểm tối đa tiêu chí", "Criterion max points")}
                  className="h-7 w-16 text-xs tabular-nums"
                  data-testid={`rubric-max-${idx}`}
                />
                <button
                  type="button"
                  onClick={() => removeItem(c.id)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title={tr("Xoá tiêu chí", "Remove criterion")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {!compact && (
                <Input
                  value={c.description ?? ""}
                  onChange={(e) => updateItem(c.id, { description: e.target.value })}
                  placeholder={tr("Mô tả mức đạt điểm (tuỳ chọn)…", "Scoring description (optional)…")}
                  className="h-7 text-[11px]"
                />
              )}
            </div>
          ))}

          {Math.abs(totalRubricPoints - fieldPoints) > 0.001 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              <span>
                {tr(
                  `Tổng rubric (${totalRubricPoints}đ) khác điểm câu (${fieldPoints}đ).`,
                  `Rubric total (${totalRubricPoints}) differs from question points (${fieldPoints}).`
                )}
              </span>
              <button
                type="button"
                onClick={() => onChange(items, totalRubricPoints)}
                className="font-bold text-[#3525CD] underline"
                data-testid="sync-rubric-points-btn"
              >
                {tr("Đồng bộ điểm câu", "Sync question points")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
