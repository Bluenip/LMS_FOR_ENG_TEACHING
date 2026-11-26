"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { AnswerValue, DragDropAnswerValue, DragDropOptions } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface DragDropQuestionInputProps {
  fieldId: string;
  options: DragDropOptions;
  value: AnswerValue;
  onChange: (val: DragDropAnswerValue) => void;
  disabled?: boolean;
}

export function DragDropQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: DragDropQuestionInputProps) {
  const { tr } = useI18n();
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  const tokens = useMemo(() => (Array.isArray(options.tokens) ? options.tokens : []), [options.tokens]);
  const slots = useMemo(() => (Array.isArray(options.slots) ? options.slots : []), [options.slots]);
  const singleUse = options.singleUse !== false;

  const currentSlots: DragDropAnswerValue = useMemo(() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: DragDropAnswerValue = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
    }
    return out;
  }, [value]);

  const tokenById = useMemo(() => new Map(tokens.map((t) => [t.id, t])), [tokens]);
  const usedIds = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(currentSlots)) {
      for (const id of list) set.add(id);
    }
    return set;
  }, [currentSlots]);

  const placeTokenInSlot = (tokenId: string, slotId: string) => {
    if (disabled) return;
    const next: DragDropAnswerValue = {};
    for (const s of slots) {
      const existing = currentSlots[s.id] ?? [];
      next[s.id] = singleUse ? existing.filter((id) => id !== tokenId) : [...existing];
    }
    const targetList = next[slotId] ?? [];
    if (!targetList.includes(tokenId) || !singleUse) {
      next[slotId] = [...targetList, tokenId];
    }
    setSelectedTokenId(null);
    onChange(next);
  };

  const removeTokenFromSlot = (slotId: string, tokenIndex: number) => {
    if (disabled) return;
    const existing = currentSlots[slotId] ?? [];
    onChange({
      ...currentSlots,
      [slotId]: existing.filter((_, idx) => idx !== tokenIndex),
    });
  };

  return (
    <div className="space-y-3" data-testid={`drag-drop-input-${fieldId}`}>
      {/* Token bank */}
      <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3 space-y-2">
        <p className="text-[11px] font-semibold text-[#464555]">
          {tr("Thẻ từ / đáp án (kéo hoặc chạm thẻ rồi chạm ô đích):", "Tokens (drag or tap a token, then tap a target slot):")}
        </p>
        <div className="flex flex-wrap gap-2">
          {tokens.map((tok) => {
            const hiddenByUse = singleUse && usedIds.has(tok.id);
            if (hiddenByUse) return null;
            const active = selectedTokenId === tok.id;
            return (
              <button
                key={tok.id}
                type="button"
                disabled={disabled}
                draggable={!disabled}
                data-testid={`drag-token-${fieldId}-${tok.id}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", tok.id);
                }}
                onClick={() => setSelectedTokenId(active ? null : tok.id)}
                className={cn(
                  "min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-bold transition shadow-sm",
                  active
                    ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                    : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-300"
                )}
              >
                {tok.text}
              </button>
            );
          })}
          {tokens.every((t) => singleUse && usedIds.has(t.id)) && (
            <span className="text-[11px] italic text-slate-400">
              {tr("Đã đặt hết tất cả thẻ.", "All tokens placed.")}
            </span>
          )}
        </div>
      </div>

      {/* Drop slots */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {slots.map((slot) => {
          const placed = currentSlots[slot.id] ?? [];
          return (
            <div
              key={slot.id}
              data-testid={`drop-slot-${fieldId}-${slot.id}`}
              onDragOver={(e) => {
                if (!disabled) e.preventDefault();
              }}
              onDrop={(e) => {
                if (disabled) return;
                e.preventDefault();
                const droppedId = e.dataTransfer.getData("text/plain");
                if (droppedId && tokenById.has(droppedId)) {
                  placeTokenInSlot(droppedId, slot.id);
                }
              }}
              onClick={() => {
                if (selectedTokenId) placeTokenInSlot(selectedTokenId, slot.id);
              }}
              className={cn(
                "min-h-[54px] rounded-xl border-2 border-dashed p-3 transition space-y-1.5",
                selectedTokenId && !disabled
                  ? "border-[#4F46E5] bg-indigo-50/40 cursor-pointer"
                  : "border-slate-200 bg-white"
              )}
            >
              <p className="text-[11px] font-bold text-[#464555]">{slot.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {placed.length === 0 ? (
                  <span className="text-[11px] text-slate-400">
                    {selectedTokenId
                      ? tr("Chạm để thả vào đây", "Tap to drop here")
                      : tr("Trống", "Empty")}
                  </span>
                ) : (
                  placed.map((tid, idx) => (
                    <span
                      key={`${tid}-${idx}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-[#3525CD]"
                    >
                      {tokenById.get(tid)?.text ?? tid}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTokenFromSlot(slot.id, idx);
                          }}
                          className="rounded p-0.5 hover:bg-indigo-100"
                          aria-label={tr("Gỡ thẻ", "Remove token")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
