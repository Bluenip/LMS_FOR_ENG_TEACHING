import type { FieldType } from "@prisma/client";
import { fisherYatesShuffle } from "./matrix-picker";

export interface VariantFieldInput {
  id: string;
  placement: "OVERLAY" | "ANSWER_SHEET";
  type: FieldType;
  options?: unknown;
}

export interface GeneratedVariant {
  code: string;
  questionOrder: string[];
  optionOrder: Record<string, string[]>;
}

function buildOneVariant(
  answerSheetIds: string[],
  mcOptionIds: Array<{ fieldId: string; optIds: string[] }>,
  rng: () => number
): { questionOrder: string[]; optionOrder: Record<string, string[]> } {
  const questionOrder =
    answerSheetIds.length > 1 ? fisherYatesShuffle(answerSheetIds, rng) : [...answerSheetIds];
  const optionOrder: Record<string, string[]> = {};
  for (const mc of mcOptionIds) {
    optionOrder[mc.fieldId] = fisherYatesShuffle(mc.optIds, rng);
  }
  return { questionOrder, optionOrder };
}

/**
 * Generates `count` distinct exam variants (`startCode` 101, 102, 103, ...)
 * shuffling `ANSWER_SHEET` question order and option order for MC/MULTI_SELECT fields.
 */
export function buildExamVariants(
  fields: VariantFieldInput[],
  count: number,
  startCode = 101,
  rng: () => number = Math.random
): GeneratedVariant[] {
  const safeCount = Math.max(1, Math.min(24, Math.floor(count)));
  const answerSheetIds = fields
    .filter((f) => f.placement === "ANSWER_SHEET")
    .map((f) => f.id);

  const mcOptionIds: Array<{ fieldId: string; optIds: string[] }> = [];
  for (const f of fields) {
    if (
      (f.type === "MULTIPLE_CHOICE" || f.type === "MULTI_SELECT") &&
      Array.isArray(f.options) &&
      f.options.length > 1
    ) {
      const optIds = (f.options as Array<{ id?: unknown }>)
        .map((o) => (typeof o?.id === "string" ? o.id : null))
        .filter((id): id is string => Boolean(id));
      if (optIds.length > 1) {
        mcOptionIds.push({ fieldId: f.id, optIds });
      }
    }
  }

  const seen = new Set<string>();
  const variants: GeneratedVariant[] = [];

  for (let i = 0; i < safeCount; i++) {
    let candidate = buildOneVariant(answerSheetIds, mcOptionIds, rng);
    for (let attempt = 0; attempt < 12; attempt++) {
      const sig = JSON.stringify(candidate);
      if (!seen.has(sig)) {
        seen.add(sig);
        break;
      }
      candidate = buildOneVariant(answerSheetIds, mcOptionIds, rng);
      if (attempt === 11) {
        seen.add(sig);
      }
    }
    variants.push({
      code: String(startCode + i),
      questionOrder: candidate.questionOrder,
      optionOrder: candidate.optionOrder,
    });
  }

  return variants;
}
