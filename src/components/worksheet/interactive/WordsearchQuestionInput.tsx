"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  isWordsearchAnswer,
  type AnswerValue,
  type WordsearchAnswerValue,
  type WordsearchOptions,
} from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface WordsearchQuestionInputProps {
  fieldId: string;
  options: WordsearchOptions;
  value: AnswerValue;
  onChange: (val: WordsearchAnswerValue) => void;
  disabled?: boolean;
}

function buildStraightLineCells(
  start: [number, number],
  end: [number, number]
): Array<[number, number]> | null {
  const dr = end[0] - start[0];
  const dc = end[1] - start[1];
  if (dr === 0 && dc === 0) return null;
  const isHorizontal = dr === 0;
  const isVertical = dc === 0;
  const isDiagonal = Math.abs(dr) === Math.abs(dc);
  if (!isHorizontal && !isVertical && !isDiagonal) return null;

  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const len = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < len; i++) {
    cells.push([start[0] + stepR * i, start[1] + stepC * i]);
  }
  return cells;
}

export function WordsearchQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: WordsearchQuestionInputProps) {
  const { tr } = useI18n();
  const [startCell, setStartCell] = useState<[number, number] | null>(null);

  const grid = useMemo(() => (Array.isArray(options.grid) ? options.grid : []), [options.grid]);
  const found = useMemo(() => (isWordsearchAnswer(value) ? value.found : []), [value]);

  const foundCellKeys = useMemo(() => {
    const s = new Set<string>();
    for (const entry of found) {
      for (const [r, c] of entry.cells) s.add(`${r}:${c}`);
    }
    return s;
  }, [found]);

  const handleCellClick = (r: number, c: number) => {
    if (disabled) return;
    if (!startCell) {
      setStartCell([r, c]);
      return;
    }
    if (startCell[0] === r && startCell[1] === c) {
      setStartCell(null);
      return;
    }
    const cells = buildStraightLineCells(startCell, [r, c]);
    setStartCell(null);
    if (!cells || cells.length < 2) return;

    const word = cells.map(([rr, cc]) => (grid[rr]?.[cc] ?? "").toUpperCase()).join("");
    if (word.length < 2) return;

    const exists = found.some(
      (e) =>
        e.cells.length === cells.length &&
        e.cells.every(([er, ec], idx) => er === cells[idx]![0] && ec === cells[idx]![1])
    );
    if (exists) return;

    onChange({
      found: [...found, { word, cells }],
    });
  };

  const removeFound = (idx: number) => {
    if (disabled) return;
    onChange({
      found: found.filter((_, i) => i !== idx),
    });
  };

  if (grid.length === 0) {
    return (
      <p className="text-xs italic text-slate-400">
        {tr("Chưa có bảng chữ cái Wordsearch.", "Wordsearch grid not generated yet.")}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid={`wordsearch-input-${fieldId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#464555]">
        <span>
          {tr(
            "Chạm ô chữ cái đầu rồi chạm ô chữ cái cuối cùng theo hàng ngang, dọc hoặc chéo.",
            "Click the first letter cell, then click the last letter cell (horizontal, vertical, or diagonal)."
          )}
        </span>
        {typeof options.wordCount === "number" && (
          <span className="font-semibold text-[#3525CD]">
            {tr(`Đã chọn: ${found.length} / ${options.wordCount} từ`, `Selected: ${found.length} / ${options.wordCount} words`)}
          </span>
        )}
      </div>

      {options.showWordList && Array.isArray(options.wordHints) && options.wordHints.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid={`wordsearch-hints-${fieldId}`}>
          {options.wordHints.map((hint) => {
            const matched = found.some((f) => f.word.toUpperCase() === hint.toUpperCase());
            return (
              <span
                key={hint}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                  matched
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 line-through"
                    : "border-slate-200 bg-slate-50 text-[#0B1C30]"
                )}
              >
                {hint}
              </span>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div
          className="inline-grid gap-1 rounded-xl border border-slate-200 bg-[#F8F9FF] p-2.5"
          style={{
            gridTemplateColumns: `repeat(${grid[0]?.length ?? 1}, minmax(28px, 34px))`,
          }}
        >
          {grid.map((row, r) =>
            row.map((letter, c) => {
              const isStart = startCell?.[0] === r && startCell?.[1] === c;
              const isFound = foundCellKeys.has(`${r}:${c}`);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  disabled={disabled}
                  data-testid={`ws-cell-${fieldId}-${r}-${c}`}
                  onClick={() => handleCellClick(r, c)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border font-mono text-xs font-bold transition",
                    isStart
                      ? "border-[#4F46E5] bg-[#4F46E5] text-white ring-2 ring-[#4F46E5]/30"
                      : isFound
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                        : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-300"
                  )}
                >
                  {letter}
                </button>
              );
            })
          )}
        </div>
      </div>

      {found.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {found.map((entry, idx) => (
            <span
              key={`${entry.word}-${idx}`}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800"
            >
              {entry.word}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeFound(idx)}
                  aria-label={tr("Xoá từ", "Remove word")}
                  className="rounded-full p-0.5 hover:bg-emerald-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
