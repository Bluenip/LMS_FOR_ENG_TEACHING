"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Unlink } from "lucide-react";
import type { AnswerValue, MatchAnswerValue, MatchOptions } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface MatchQuestionInputProps {
  fieldId: string;
  options: MatchOptions;
  value: AnswerValue;
  onChange: (val: MatchAnswerValue) => void;
  disabled?: boolean;
}

export function MatchQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: MatchQuestionInputProps) {
  const { tr } = useI18n();
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>>([]);

  const leftItems = useMemo(() => (Array.isArray(options.left) ? options.left : []), [options.left]);
  const rightItems = useMemo(() => (Array.isArray(options.right) ? options.right : []), [options.right]);

  const currentMap: MatchAnswerValue = useMemo(() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: MatchAnswerValue = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    return out;
  }, [value]);

  useEffect(() => {
    const computeLines = () => {
      const box = containerRef.current;
      if (!box) return;
      const boxRect = box.getBoundingClientRect();
      const next: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = [];
      for (const [lId, rId] of Object.entries(currentMap)) {
        const lEl = leftRefs.current[lId];
        const rEl = rightRefs.current[rId];
        if (!lEl || !rEl) continue;
        const lRect = lEl.getBoundingClientRect();
        const rRect = rEl.getBoundingClientRect();
        next.push({
          key: `${lId}-${rId}`,
          x1: lRect.right - boxRect.left,
          y1: lRect.top + lRect.height / 2 - boxRect.top,
          x2: rRect.left - boxRect.left,
          y2: rRect.top + rRect.height / 2 - boxRect.top,
        });
      }
      setLines(next);
    };

    computeLines();
    window.addEventListener("resize", computeLines);
    return () => window.removeEventListener("resize", computeLines);
  }, [currentMap, leftItems.length, rightItems.length]);

  const handleRightPick = (rightId: string) => {
    if (disabled) return;
    if (selectedLeft) {
      const next = { ...currentMap, [selectedLeft]: rightId };
      setSelectedLeft(null);
      onChange(next);
    }
  };

  const handleUnlink = (leftId: string) => {
    if (disabled) return;
    const next = { ...currentMap };
    delete next[leftId];
    onChange(next);
  };

  const rightLabelMap = new Map(rightItems.map((r) => [r.id, r.text]));
  const matchedRightSet = new Set(Object.values(currentMap));

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-[#464555]">
        {tr(
          "Chọn một mục bên trái rồi bấm mục tương ứng bên phải để nối cặp.",
          "Tap an item on the left, then tap its matching item on the right."
        )}
      </p>
      <div
        ref={containerRef}
        className="relative grid grid-cols-2 gap-4 sm:gap-10"
        data-testid={`match-input-${fieldId}`}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          {lines.map((ln) => (
            <line
              key={ln.key}
              x1={ln.x1}
              y1={ln.y1}
              x2={ln.x2}
              y2={ln.y2}
              stroke="#4F46E5"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          ))}
        </svg>

        <div className="space-y-2 relative z-10">
          {leftItems.map((item) => {
            const isSelected = selectedLeft === item.id;
            const pairedRightId = currentMap[item.id];
            return (
              <div key={item.id} className="flex items-center gap-1">
                <button
                  ref={(el) => {
                    leftRefs.current[item.id] = el;
                  }}
                  type="button"
                  disabled={disabled}
                  data-testid={`match-left-${fieldId}-${item.id}`}
                  onClick={() => setSelectedLeft(isSelected ? null : item.id)}
                  className={cn(
                    "min-h-[42px] flex-1 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                    isSelected
                      ? "border-[#4F46E5] bg-indigo-50 ring-2 ring-[#4F46E5]/30 text-[#0B1C30]"
                      : pairedRightId
                        ? "border-indigo-300 bg-indigo-50/50 text-[#0B1C30]"
                        : "border-slate-200 bg-white hover:border-slate-300 text-[#0B1C30]"
                  )}
                >
                  <span className="font-bold text-[#4F46E5] mr-1.5">{item.id}.</span>
                  <span>{item.text}</span>
                </button>
                {pairedRightId && !disabled && (
                  <button
                    type="button"
                    data-testid={`match-unlink-${fieldId}-${item.id}`}
                    onClick={() => handleUnlink(item.id)}
                    title={tr("Gỡ nối", "Unlink")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-red-600"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 relative z-10">
          {rightItems.map((item) => {
            const isPaired = matchedRightSet.has(item.id);
            return (
              <button
                key={item.id}
                ref={(el) => {
                  rightRefs.current[item.id] = el;
                }}
                type="button"
                disabled={disabled}
                data-testid={`match-right-${fieldId}-${item.id}`}
                onClick={() => handleRightPick(item.id)}
                className={cn(
                  "min-h-[42px] w-full rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                  selectedLeft && !disabled
                    ? "border-indigo-300 bg-white hover:bg-indigo-50 cursor-pointer"
                    : isPaired
                      ? "border-indigo-300 bg-indigo-50/50 text-[#0B1C30]"
                      : "border-slate-200 bg-white text-[#0B1C30]"
                )}
              >
                <span className="font-bold text-emerald-700 mr-1.5">{item.id}.</span>
                <span>{item.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {Object.keys(currentMap).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
          {Object.entries(currentMap).map(([lId, rId]) => (
            <span
              key={`${lId}-${rId}`}
              className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-semibold text-[#3525CD]"
            >
              {lId} → {rId} ({rightLabelMap.get(rId) ?? rId})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
