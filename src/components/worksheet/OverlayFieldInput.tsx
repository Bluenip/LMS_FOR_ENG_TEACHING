"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { AnswerValue } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { formatRevealedAnswer, type StudentFieldDTO } from "./types";

interface OverlayFieldInputProps {
  field: StudentFieldDTO;
  pageWidthPx: number;
  pageHeightPx: number;
  zoom: number;
  value: AnswerValue;
  onChange?: (value: AnswerValue) => void;
  disabled?: boolean;
  revealResult?: boolean;
  revealKey?: boolean;
  isCorrect?: boolean | null;
  score?: number | null;
  teacherNote?: string | null;
  highlighted?: boolean;
}

export function OverlayFieldInput({
  field,
  pageWidthPx,
  pageHeightPx,
  zoom,
  value,
  onChange,
  disabled = false,
  revealResult = false,
  revealKey = false,
  isCorrect,
  teacherNote,
  highlighted = false,
}: OverlayFieldInputProps) {
  const x = field.x ?? 0;
  const y = field.y ?? 0;
  const w = field.w ?? 0.15;
  const h = field.h ?? 0.04;

  // Use exact percentage coordinates relative to page canvas container (pixel-locked across all zoom/viewports)
  const baseFontSize = field.style?.fontSize ?? 13;
  const scaledFontSize = Math.max(9, Math.round(baseFontSize * (pageWidthPx / 760)));
  const align = field.style?.align ?? "left";
  const transparentBg = field.style?.transparentBg ?? false;

  const resultBorder = revealResult
    ? isCorrect === true
      ? "border-emerald-500 bg-emerald-50/90 text-emerald-950"
      : isCorrect === false
        ? "border-red-500 bg-red-50/90 text-red-950"
        : "border-amber-400 bg-amber-50/90 text-amber-950"
    : transparentBg
      ? "border-indigo-400/70 bg-white/75 focus-within:border-[#4F46E5] focus-within:bg-white"
      : "border-[#4F46E5]/70 bg-white/95 focus-within:border-[#3525CD] focus-within:ring-2 focus-within:ring-indigo-200";

  const revealedText =
    revealKey && field.revealedAnswer
      ? formatRevealedAnswer(field.type, field.revealedAnswer, field.options)
      : "";

  // Reference pageHeightPx & zoom cleanly so props remain meaningful
  void pageHeightPx;
  void zoom;

  return (
    <div
      data-overlay-field-id={field.id}
      data-field-label={field.label}
      data-norm-x={x}
      data-norm-y={y}
      data-norm-w={w}
      data-norm-h={h}
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        fontSize: `${scaledFontSize}px`,
      }}
      className={cn(
        "group z-10 flex items-center rounded-md border-2 transition-colors",
        resultBorder,
        highlighted && "ring-4 ring-orange-400/70 z-20"
      )}
    >
      {/* Question number micro-tag */}
      <span
        className="pointer-events-none absolute -top-4 left-0 rounded bg-[#4F46E5] px-1 py-0.2 text-[9px] font-bold leading-tight text-white shadow-sm"
      >
        {field.label}
      </span>

      {/* Real HTML interactive control */}
      {field.type === "TEXT" && (
        <input
          type="text"
          aria-label={`Câu ${field.label}`}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Nhập đáp án…"
          style={{ textAlign: align, fontSize: "inherit" }}
          className="h-full w-full rounded bg-transparent px-1.5 outline-none placeholder:text-slate-400"
        />
      )}

      {field.type === "NUMBER" && (
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Câu ${field.label}`}
          disabled={disabled}
          value={value !== null && value !== undefined ? String(value) : ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="0"
          style={{ textAlign: align, fontSize: "inherit" }}
          className="h-full w-full rounded bg-transparent px-1.5 outline-none tabular-nums placeholder:text-slate-400"
        />
      )}

      {field.type === "DROPDOWN" && (
        <select
          aria-label={`Câu ${field.label}`}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange?.(e.target.value)}
          style={{ fontSize: "inherit" }}
          className="h-full w-full cursor-pointer rounded bg-transparent px-1 outline-none"
        >
          <option value="">Chọn đáp án…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.text || opt.id}
            </option>
          ))}
        </select>
      )}

      {field.type === "CHECKBOX" && (
        // Tri-state: chưa trả lời → ✓ (tick) → ✗ (không tick) → ✓ ...
        <button
          type="button"
          aria-label={`Câu ${field.label}: ${
            value === true ? "đã tick" : value === false ? "không tick" : "chưa trả lời"
          }`}
          title="Nhấn 1 lần để tick, nhấn lần nữa để chọn 'Không tick'"
          disabled={disabled}
          onClick={() => onChange?.(value === true ? false : true)}
          className={cn(
            "flex h-full w-full cursor-pointer items-center justify-center rounded text-[1em] font-bold leading-none",
            value === true && "text-[#4F46E5]",
            value === false && "text-red-600",
            value !== true && value !== false && "border border-dashed border-indigo-300"
          )}
        >
          {value === true ? "✓" : value === false ? "✗" : ""}
        </button>
      )}

      {field.type === "TRUE_FALSE" && (
        <div className="flex h-full w-full items-center justify-around gap-1 px-1">
          {[
            { v: true, label: "Đúng" },
            { v: false, label: "Sai" },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(opt.v)}
              className={cn(
                "flex-1 rounded px-1 py-0.5 text-[0.8em] font-semibold transition",
                value === opt.v
                  ? "bg-[#4F46E5] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-indigo-100"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {field.type === "MULTIPLE_CHOICE" && (
        <div className="flex h-full w-full flex-wrap items-center justify-around gap-1 overflow-auto p-0.5">
          {(field.options ?? []).map((opt) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange?.(opt.id)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[0.85em] font-semibold transition",
                  active
                    ? "bg-[#4F46E5] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-indigo-100"
                )}
              >
                {opt.id}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "MULTI_SELECT" && (
        <div className="flex h-full w-full flex-wrap items-center gap-1 overflow-auto p-1">
          {(field.options ?? []).map((opt) => {
            const selected = Array.isArray(value) && value.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const prev = Array.isArray(value) ? value : [];
                  const next = selected
                    ? prev.filter((id) => id !== opt.id)
                    : [...prev, opt.id];
                  onChange?.(next);
                }}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[0.8em] font-semibold transition",
                  selected
                    ? "bg-[#4F46E5] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-indigo-100"
                )}
              >
                {opt.id}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "ESSAY" && (
        <textarea
          aria-label={`Câu ${field.label}`}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Nhập câu trả lời tự luận của bạn…"
          style={{ textAlign: align, fontSize: "inherit" }}
          className="h-full w-full resize-none rounded bg-transparent p-1.5 leading-snug outline-none placeholder:text-slate-400"
        />
      )}

      {/* Result indicator badge */}
      {revealResult && isCorrect !== null && isCorrect !== undefined && (
        <span className="pointer-events-none absolute -right-2.5 -top-2.5 rounded-full bg-white shadow">
          {isCorrect ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )}
        </span>
      )}

      {/* Revealed answer / teacher note popover on hover */}
      {revealResult && (revealedText || teacherNote || field.explanation) && (
        <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden min-w-[180px] max-w-[260px] rounded-lg border border-slate-200 bg-slate-900 p-2 text-[11px] leading-snug text-white shadow-xl group-hover:block">
          {revealedText && (
            <p className="font-semibold text-emerald-300">Đáp án đúng: {revealedText}</p>
          )}
          {field.explanation && (
            <p className="mt-1 text-slate-200">{field.explanation}</p>
          )}
          {teacherNote && (
            <p className="mt-1 text-amber-300">Nhận xét GV: {teacherNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
