import type {
  DragDropAnswerKey,
  DragDropAnswerValue,
  GradeResult,
  GradingOptions,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function gradeDragDrop(
  answerKey: Partial<DragDropAnswerKey> | null | undefined,
  value: unknown,
  maxPoints: number,
  gradingOpts?: GradingOptions | null
): GradeResult {
  const expectedSlots =
    answerKey?.slots && typeof answerKey.slots === "object" && !Array.isArray(answerKey.slots)
      ? answerKey.slots
      : {};
  const slotEntries = Object.entries(expectedSlots).filter(
    ([slotId, tokens]) => slotId.length > 0 && Array.isArray(tokens) && tokens.length > 0
  );

  if (slotEntries.length === 0) {
    return { isCorrect: false, score: 0 };
  }

  const studentSlots =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as DragDropAnswerValue)
      : {};

  let matched = 0;
  for (const [slotId, expectedTokens] of slotEntries) {
    const rawActual = studentSlots[slotId];
    const actual = Array.isArray(rawActual)
      ? rawActual.filter((s): s is string => typeof s === "string")
      : [];
    if (
      actual.length === expectedTokens.length &&
      expectedTokens.every((tok, idx) => actual[idx] === tok)
    ) {
      matched++;
    }
  }

  const allCorrect = matched === slotEntries.length;
  if (gradingOpts?.scoring === "ALL_OR_NOTHING") {
    return {
      isCorrect: allCorrect,
      score: allCorrect ? round2(maxPoints) : 0,
    };
  }

  return {
    isCorrect: allCorrect,
    score: round2((maxPoints * matched) / slotEntries.length),
  };
}
