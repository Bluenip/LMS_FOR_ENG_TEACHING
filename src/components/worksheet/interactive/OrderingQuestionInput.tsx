"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { isStringArray, type AnswerValue, type OrderingOptions } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface OrderingQuestionInputProps {
  fieldId: string;
  options: OrderingOptions;
  value: AnswerValue;
  onChange: (val: string[]) => void;
  disabled?: boolean;
}

export function OrderingQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: OrderingQuestionInputProps) {
  const { tr } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const items = useMemo(() => (Array.isArray(options.items) ? options.items : []), [options.items]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const orderedIds = useMemo(() => {
    const validSet = new Set(items.map((i) => i.id));
    const raw = isStringArray(value) ? value.filter((id) => validSet.has(id)) : [];
    const seen = new Set(raw);
    const missing = items.map((i) => i.id).filter((id) => !seen.has(id));
    return [...raw, ...missing];
  }, [items, value]);

  const moveItem = (fromIdx: number, toIdx: number) => {
    if (disabled) return;
    if (toIdx < 0 || toIdx >= orderedIds.length || fromIdx === toIdx) return;
    const next = [...orderedIds];
    const [picked] = next.splice(fromIdx, 1);
    if (!picked) return;
    next.splice(toIdx, 0, picked);
    onChange(next);
  };

  return (
    <div className="space-y-2" data-testid={`ordering-input-${fieldId}`}>
      <p className="text-[11px] text-[#464555]">
        {tr(
          "Kéo thả hoặc dùng nút ↑ / ↓ để sắp xếp theo thứ tự đúng:",
          "Drag or use ↑ / ↓ buttons to arrange items in the right order:"
        )}
      </p>
      <div className="space-y-1.5">
        {orderedIds.map((id, idx) => {
          const item = itemById.get(id);
          if (!item) return null;
          return (
            <div
              key={id}
              draggable={!disabled}
              data-testid={`order-row-${fieldId}-${id}`}
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => {
                if (!disabled) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) {
                  moveItem(dragIndex, idx);
                  setDragIndex(null);
                }
              }}
              className={cn(
                "flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm transition",
                !disabled && "hover:border-indigo-300"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-[#3525CD]">
                  {idx + 1}
                </span>
                <span className="font-medium text-[#0B1C30] break-words">
                  <span className="font-bold text-slate-400 mr-1.5">{item.id}.</span>
                  {item.text}
                </span>
              </div>

              {!disabled && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    data-testid={`order-up-${fieldId}-${id}`}
                    onClick={() => moveItem(idx, idx - 1)}
                    aria-label={tr("Đưa lên", "Move up")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === orderedIds.length - 1}
                    data-testid={`order-down-${fieldId}-${id}`}
                    onClick={() => moveItem(idx, idx + 1)}
                    aria-label={tr("Đưa xuống", "Move down")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
