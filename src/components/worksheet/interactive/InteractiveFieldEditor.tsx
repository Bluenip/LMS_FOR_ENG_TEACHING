"use client";

import type { FieldType } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import {
  type CodeOptions,
  type DragDropOptions,
  type DrawOptions,
  type FieldOptionsValue,
  type GradingOptions,
  type HighlightOptions,
  type MatchOptions,
  type OrderingOptions,
  type RubricCriterion,
  type SpeakingOptions,
  type VoiceAnswerOptions,
  type WordsearchOptions,
} from "@/lib/grading/types";
import { generateWordsearchGrid as buildWordsearchGrid } from "@/lib/grading/wordsearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RubricEditor } from "@/components/worksheet/RubricEditor";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface InteractiveFieldEditorProps {
  fieldId: string;
  type: FieldType;
  points: number;
  options: FieldOptionsValue | null | undefined;
  answerKey: Record<string, unknown>;
  gradingOpts: GradingOptions | null | undefined;
  rubric?: RubricCriterion[] | null;
  onChange: (patch: {
    options?: FieldOptionsValue | null;
    answerKey?: Record<string, unknown>;
    gradingOpts?: GradingOptions | null;
    rubric?: RubricCriterion[] | null;
    points?: number;
  }) => void;
}

export function InteractiveFieldEditor({
  fieldId,
  type,
  points,
  options,
  answerKey,
  gradingOpts,
  rubric,
  onChange,
}: InteractiveFieldEditorProps) {
  const { tr } = useI18n();
  const optsObj = (options && !Array.isArray(options) ? options : {}) as Record<string, unknown>;

  if (type === "MATCH") {
    const mo = optsObj as unknown as MatchOptions;
    const left = Array.isArray(mo.left) ? mo.left : [];
    const right = Array.isArray(mo.right) ? mo.right : [];
    const pairs = Array.isArray(answerKey.pairs) ? (answerKey.pairs as Array<[string, string]>) : [];
    const pairMap = new Map(pairs.map(([l, r]) => [l, r]));

    const setPairsFromMap = (nextMap: Map<string, string>) => {
      onChange({
        answerKey: {
          pairs: left
            .map((l) => [l.id, nextMap.get(l.id) ?? ""] as [string, string])
            .filter(([, r]) => r.length > 0),
        },
      });
    };

    return (
      <div className="space-y-2.5 text-xs" data-testid={`match-editor-${fieldId}`}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">{tr("Cặp nối trái → phải", "Left ↔ Right pairs")}</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const idx = left.length + 1;
                const lId = `L${idx}`;
                const rId = `R${idx}`;
                onChange({
                  options: {
                    left: [...left, { id: lId, text: `Item ${idx}` }],
                    right: [...right, { id: rId, text: `Match ${idx}` }],
                  },
                  answerKey: { pairs: [...pairs, [lId, rId]] },
                });
              }}
              className="h-7 px-2 text-[11px]"
            >
              <Plus className="h-3 w-3" /> {tr("Thêm cặp", "Add pair")}
            </Button>
          </div>
          {left.map((lItem, i) => {
            const linkedRight = pairMap.get(lItem.id) ?? right[i]?.id ?? "";
            return (
              <div key={lItem.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
                <Input
                  value={lItem.text}
                  onChange={(e) => {
                    const nextLeft = left.map((x, idx) =>
                      idx === i ? { ...x, text: e.target.value } : x
                    );
                    onChange({ options: { left: nextLeft, right } });
                  }}
                  placeholder={lItem.id}
                  className="h-8 text-xs"
                />
                <div className="flex items-center gap-1">
                  <Input
                    value={right[i]?.text ?? ""}
                    onChange={(e) => {
                      const nextRight = right.map((x, idx) =>
                        idx === i ? { ...x, text: e.target.value } : x
                      );
                      onChange({ options: { left, right: nextRight } });
                    }}
                    placeholder={right[i]?.id ?? `R${i + 1}`}
                    className="h-8 text-xs"
                  />
                  <select
                    value={linkedRight}
                    onChange={(e) => {
                      const nextMap = new Map(pairMap);
                      nextMap.set(lItem.id, e.target.value);
                      setPairsFromMap(nextMap);
                    }}
                    className="h-8 rounded border border-slate-200 bg-white px-1 text-[11px]"
                    title={tr("Cặp đúng", "Correct right item")}
                  >
                    {right.map((r) => (
                      <option key={r.id} value={r.id}>
                        → {r.id}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={left.length <= 2}
                  onClick={() => {
                    const nextLeft = left.filter((_, idx) => idx !== i);
                    const removedR = right[i]?.id;
                    const nextRight = right.filter((_, idx) => idx !== i);
                    onChange({
                      options: { left: nextLeft, right: nextRight },
                      answerKey: {
                        pairs: pairs.filter(([l, r]) => l !== lItem.id && r !== removedR),
                      },
                    });
                  }}
                  className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === "DRAG_DROP") {
    const dd = optsObj as unknown as DragDropOptions;
    const tokens = Array.isArray(dd.tokens) ? dd.tokens : [];
    const slots = Array.isArray(dd.slots) ? dd.slots : [];
    const slotKeyMap =
      answerKey.slots && typeof answerKey.slots === "object"
        ? (answerKey.slots as Record<string, string[]>)
        : {};

    return (
      <div className="space-y-2.5 text-xs" data-testid={`drag-drop-editor-${fieldId}`}>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">{tr("Ô trống & Thẻ đúng", "Slots & Expected Tokens")}</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const n = slots.length + 1;
              const sId = `S${n}`;
              const tId = `T${n}`;
              onChange({
                options: {
                  tokens: [...tokens, { id: tId, text: `Word ${n}` }],
                  slots: [...slots, { id: sId, label: `Slot ${n}` }],
                  singleUse: dd.singleUse ?? true,
                },
                answerKey: { slots: { ...slotKeyMap, [sId]: [tId] } },
              });
            }}
            className="h-7 px-2 text-[11px]"
          >
            <Plus className="h-3 w-3" /> {tr("Thêm ô", "Add slot")}
          </Button>
        </div>
        {slots.map((slot, i) => {
          const pickedTok = slotKeyMap[slot.id]?.[0] ?? tokens[i]?.id ?? "";
          return (
            <div key={slot.id} className="grid grid-cols-2 gap-1.5">
              <Input
                value={slot.label}
                onChange={(e) => {
                  const nextSlots = slots.map((s, idx) =>
                    idx === i ? { ...s, label: e.target.value } : s
                  );
                  onChange({ options: { ...dd, tokens, slots: nextSlots } });
                }}
                placeholder={slot.id}
                className="h-8 text-xs"
              />
              <Input
                value={tokens.find((t) => t.id === pickedTok)?.text ?? ""}
                onChange={(e) => {
                  const targetTokId = pickedTok || tokens[i]?.id || `T${i + 1}`;
                  const exists = tokens.some((t) => t.id === targetTokId);
                  const nextTokens = exists
                    ? tokens.map((t) =>
                        t.id === targetTokId ? { ...t, text: e.target.value } : t
                      )
                    : [...tokens, { id: targetTokId, text: e.target.value }];
                  onChange({
                    options: { ...dd, tokens: nextTokens, slots },
                    answerKey: { slots: { ...slotKeyMap, [slot.id]: [targetTokId] } },
                  });
                }}
                placeholder={tr("Thẻ đúng", "Correct token")}
                className="h-8 text-xs"
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (type === "SPEAKING") {
    const so = optsObj as unknown as SpeakingOptions;
    return (
      <div className="space-y-2 text-xs" data-testid={`speaking-editor-${fieldId}`}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">{tr("Ngôn ngữ chấm phát âm", "Speech locale")}</Label>
            <select
              value={so.lang ?? "en-US"}
              onChange={(e) =>
                onChange({
                  options: { ...so, lang: e.target.value as "en-US" | "en-GB" },
                })
              }
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">{tr("Số lần thử tối đa", "Max tries")}</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={so.maxTries ?? 3}
              onChange={(e) =>
                onChange({
                  options: { ...so, maxTries: Math.max(1, Number(e.target.value) || 3) },
                })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Câu mẫu chuẩn cần nói", "Expected spoken transcript")}</Label>
          <Textarea
            rows={2}
            value={String(answerKey.transcript ?? "")}
            onChange={(e) => onChange({ answerKey: { transcript: e.target.value } })}
            placeholder="Nice to meet you"
            className="text-xs"
          />
        </div>
      </div>
    );
  }

  if (type === "VOICE_ANSWER") {
    const vo = optsObj as unknown as VoiceAnswerOptions;
    return (
      <div className="space-y-2 text-xs" data-testid={`voice-editor-${fieldId}`}>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Thời lượng ghi tối đa (giây)", "Max duration (seconds)")}</Label>
          <Input
            type="number"
            min={5}
            max={600}
            value={vo.maxDurationSec ?? 120}
            onChange={(e) =>
              onChange({
                options: { maxDurationSec: Math.max(5, Math.min(600, Number(e.target.value) || 120)) },
              })
            }
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Gợi ý chấm nói", "Grading note")}</Label>
          <Textarea
            rows={2}
            value={String(answerKey.note ?? "")}
            onChange={(e) => onChange({ answerKey: { note: e.target.value } })}
            className="text-xs"
          />
        </div>
        <RubricEditor
          rubric={rubric}
          fieldPoints={points}
          compact
          onChange={(nextRubric, syncedPoints) =>
            onChange({
              rubric: nextRubric.length > 0 ? nextRubric : null,
              ...(syncedPoints !== undefined ? { points: syncedPoints } : {}),
            })
          }
        />
      </div>
    );
  }

  if (type === "HIGHLIGHT") {
    const ho = optsObj as unknown as HighlightOptions;
    const tokens = Array.isArray(ho.tokens) ? ho.tokens : [];
    const selectedSet = new Set(
      Array.isArray(answerKey.indices)
        ? (answerKey.indices as unknown[]).filter((n): n is number => Number.isInteger(n))
        : []
    );

    return (
      <div className="space-y-2 text-xs" data-testid={`highlight-editor-${fieldId}`}>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Đoạn văn bản (tự tách theo từ)", "Passage (auto-tokenized)")}</Label>
          <Textarea
            rows={2}
            value={tokens.join(" ")}
            onChange={(e) => {
              const nextTokens = e.target.value.split(/\s+/).filter(Boolean);
              const nextIndices = Array.from(selectedSet).filter((i) => i < nextTokens.length);
              onChange({
                options: { tokens: nextTokens },
                answerKey: { indices: nextIndices },
              });
            }}
            placeholder="She goes to school every day."
            className="text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Bấm các từ đáp án đúng:", "Click expected highlighted words:")}</Label>
          <div className="flex flex-wrap gap-1">
            {tokens.map((tok, idx) => (
              <button
                key={`${idx}-${tok}`}
                type="button"
                data-testid={`highlight-key-${fieldId}-${idx}`}
                onClick={() => {
                  const next = new Set(selectedSet);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  onChange({ answerKey: { indices: Array.from(next).sort((a, b) => a - b) } });
                }}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs border",
                  selectedSet.has(idx)
                    ? "border-amber-500 bg-amber-200 font-bold text-amber-950"
                    : "border-slate-200 bg-white text-[#0B1C30]"
                )}
              >
                {tok}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === "ORDERING") {
    const oo = optsObj as unknown as OrderingOptions;
    const items = Array.isArray(oo.items) ? oo.items : [];
    const order = Array.isArray(answerKey.order)
      ? (answerKey.order as string[])
      : items.map((i) => i.id);

    return (
      <div className="space-y-2 text-xs" data-testid={`ordering-editor-${fieldId}`}>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">{tr("Mục theo thứ tự ĐÚNG (trên → dưới)", "Items in CORRECT order")}</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const id = String(items.length + 1);
              const nextItems = [...items, { id, text: `Step ${id}` }];
              onChange({
                options: { items: nextItems },
                answerKey: { order: nextItems.map((x) => x.id) },
              });
            }}
            className="h-7 px-2 text-[11px]"
          >
            <Plus className="h-3 w-3" /> {tr("Thêm mục", "Add item")}
          </Button>
        </div>
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-1.5">
            <span className="w-5 text-center font-bold text-[#3525CD]">{i + 1}.</span>
            <Input
              value={it.text}
              onChange={(e) => {
                const nextItems = items.map((x, idx) =>
                  idx === i ? { ...x, text: e.target.value } : x
                );
                onChange({
                  options: { items: nextItems },
                  answerKey: { order: order.length ? order : nextItems.map((x) => x.id) },
                });
              }}
              className="h-8 text-xs"
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Chấm thứ tự", "Ordering scoring")}</Label>
          <select
            value={gradingOpts?.orderingScoring ?? "LCS"}
            onChange={(e) =>
              onChange({
                gradingOpts: {
                  ...gradingOpts,
                  orderingScoring: e.target.value as "LCS" | "EXACT_POS",
                },
              })
            }
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="LCS">{tr("Chuỗi con đúng dài nhất (LCS)", "Longest common subsequence (LCS)")}</option>
            <option value="EXACT_POS">{tr("Đúng chính xác từng vị trí", "Exact position match")}</option>
          </select>
        </div>
      </div>
    );
  }

  if (type === "WORDSEARCH") {
    const wo = optsObj as unknown as WordsearchOptions;
    const rows = typeof wo.rows === "number" ? wo.rows : 8;
    const cols = typeof wo.cols === "number" ? wo.cols : 8;
    const seed = typeof wo.seed === "number" ? wo.seed : 42;
    const words = Array.isArray(answerKey.words) ? (answerKey.words as string[]) : [];
    const preview = buildWordsearchGrid(words, rows, cols, seed);

    return (
      <div className="space-y-2 text-xs" data-testid={`wordsearch-editor-${fieldId}`}>
        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <Label className="text-[10px]">Rows</Label>
            <Input
              type="number"
              min={6}
              max={20}
              value={rows}
              onChange={(e) =>
                onChange({ options: { ...wo, rows: Number(e.target.value) || 8, cols, seed } })
              }
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Cols</Label>
            <Input
              type="number"
              min={6}
              max={20}
              value={cols}
              onChange={(e) =>
                onChange({ options: { ...wo, rows, cols: Number(e.target.value) || 8, seed } })
              }
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">Seed</Label>
            <Input
              type="number"
              value={seed}
              onChange={(e) =>
                onChange({ options: { ...wo, rows, cols, seed: Number(e.target.value) || 42 } })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Danh sách từ ẩn (cách bởi dấu phẩy)", "Target words (comma-separated)")}</Label>
          <Input
            data-testid={`wordsearch-words-input-${fieldId}`}
            value={words.join(", ")}
            onChange={(e) =>
              onChange({
                answerKey: {
                  words: e.target.value
                    .split(",")
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean),
                },
              })
            }
            placeholder="CAT, DOG, SUN"
            className="h-8 text-xs font-mono uppercase"
          />
        </div>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={Boolean(wo.showWordList)}
            onChange={(e) =>
              onChange({
                options: { ...wo, rows, cols, seed, showWordList: e.target.checked },
              })
            }
          />
          {tr("Hiện danh sách từ gợi ý cho học sinh", "Show word bank hints to students")}
        </label>
        <p className="text-[10px] text-slate-400">
          {tr("Đã xếp được", "Placed")}: {preview.placedWords.join(", ") || "—"}
        </p>
      </div>
    );
  }

  if (type === "DRAW") {
    const doOpts = optsObj as unknown as DrawOptions;
    return (
      <div className="space-y-2 text-xs" data-testid={`draw-editor-${fieldId}`}>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label className="text-[10px]">{tr("Rộng (px)", "Width (px)")}</Label>
            <Input
              type="number"
              min={240}
              max={1200}
              value={doOpts.width ?? 560}
              onChange={(e) =>
                onChange({ options: { ...doOpts, width: Number(e.target.value) || 560 } })
              }
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px]">{tr("Cao (px)", "Height (px)")}</Label>
            <Input
              type="number"
              min={160}
              max={900}
              value={doOpts.height ?? 300}
              onChange={(e) =>
                onChange({ options: { ...doOpts, height: Number(e.target.value) || 300 } })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Yêu cầu / Ghi chú chấm vẽ", "Drawing rubric / notes")}</Label>
          <Textarea
            rows={2}
            value={String(answerKey.note ?? "")}
            onChange={(e) => onChange({ answerKey: { note: e.target.value } })}
            className="text-xs"
          />
        </div>
        <RubricEditor
          rubric={rubric}
          fieldPoints={points}
          compact
          onChange={(nextRubric, syncedPoints) =>
            onChange({
              rubric: nextRubric.length > 0 ? nextRubric : null,
              ...(syncedPoints !== undefined ? { points: syncedPoints } : {}),
            })
          }
        />
      </div>
    );
  }

  if (type === "CODE") {
    const co = optsObj as unknown as CodeOptions;
    return (
      <div className="space-y-2 text-xs" data-testid={`code-editor-panel-${fieldId}`}>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Ngôn ngữ lập trình", "Language")}</Label>
          <select
            value={co.language ?? "javascript"}
            onChange={(e) =>
              onChange({
                options: {
                  ...co,
                  language: e.target.value as CodeOptions["language"],
                },
              })
            }
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="javascript">JavaScript (Chạy thử Web Worker)</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="pascal">Pascal</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Starter code", "Starter code")}</Label>
          <Textarea
            rows={2}
            value={co.starterCode ?? ""}
            onChange={(e) =>
              onChange({ options: { ...co, language: co.language ?? "javascript", starterCode: e.target.value } })
            }
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("Code tham khảo / Output mong đợi", "Reference code")}</Label>
          <Textarea
            rows={2}
            value={String(answerKey.referenceCode ?? "")}
            onChange={(e) => onChange({ answerKey: { ...answerKey, referenceCode: e.target.value } })}
            className="font-mono text-xs"
          />
        </div>
        <RubricEditor
          rubric={rubric}
          fieldPoints={points}
          compact
          onChange={(nextRubric, syncedPoints) =>
            onChange({
              rubric: nextRubric.length > 0 ? nextRubric : null,
              ...(syncedPoints !== undefined ? { points: syncedPoints } : {}),
            })
          }
        />
      </div>
    );
  }

  return null;
}
