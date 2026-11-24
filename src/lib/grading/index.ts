import type {
  AnswerValue,
  CheckboxAnswerKey,
  DictationAnswerKey,
  FieldForGrading,
  GradeResult,
  GradingOptions,
  MultiSelectAnswerKey,
  NumberAnswerKey,
  SingleChoiceAnswerKey,
  SubmissionGradeSummary,
  TextAnswerKey,
  TrueFalseAnswerKey,
} from "./types";
import { gradeDictationText } from "./dictation";

export * from "./types";
export * from "./dictation";

const CURLY_APOSTROPHE_REGEX = /[\u2018\u2019\u201A\u201B\u2032\u0060]/g;
const CURLY_DOUBLE_QUOTE_REGEX = /[\u201C\u201D\u201E\u201F\u2033]/g;
const PUNCTUATION_REGEX = /[.,!?;:()[\]{}"\-–—…]/g;

export function normalizeText(input: string, opts?: GradingOptions | null): string {
  const caseSensitive = opts?.caseSensitive ?? false;
  const ignorePunctuation = opts?.ignorePunctuation ?? false;
  const ignoreExtraSpaces = opts?.ignoreExtraSpaces ?? true;

  let text = input.normalize("NFC");
  // Unify curly quotes/apostrophes with ASCII straight equivalents
  text = text.replace(CURLY_APOSTROPHE_REGEX, "'").replace(CURLY_DOUBLE_QUOTE_REGEX, '"');

  if (ignorePunctuation) {
    text = text.replace(PUNCTUATION_REGEX, "");
  }

  text = text.trim();

  if (ignoreExtraSpaces) {
    text = text.replace(/\s+/g, " ");
  }

  if (!caseSensitive) {
    text = text.toLowerCase();
  }

  return text;
}

function roundScore(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Pure function that grades a single field against a student's answer value.
 */
export function gradeField(field: FieldForGrading, value: AnswerValue): GradeResult {
  const maxPoints = Number.isFinite(field.points) && field.points >= 0 ? field.points : 0;

  if (field.type === "ESSAY") {
    return { isCorrect: null, score: null };
  }

  const key = field.answerKey as Record<string, unknown> | null | undefined;
  if (!key || typeof key !== "object") {
    return { isCorrect: false, score: 0 };
  }

  switch (field.type) {
    case "TEXT": {
      const textKey = key as unknown as TextAnswerKey;
      const accepted = Array.isArray(textKey.accepted)
        ? textKey.accepted.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      if (typeof value !== "string" || value.trim() === "" || accepted.length === 0) {
        return { isCorrect: false, score: 0 };
      }
      const normalizedStudent = normalizeText(value, field.gradingOpts);
      const matched = accepted.some(
        (ans) => normalizeText(ans, field.gradingOpts) === normalizedStudent
      );
      return { isCorrect: matched, score: matched ? roundScore(maxPoints) : 0 };
    }

    case "NUMBER": {
      const numKey = key as unknown as NumberAnswerKey;
      const expected = Number(numKey.value);
      const tolerance =
        numKey.tolerance !== undefined && Number.isFinite(Number(numKey.tolerance))
          ? Math.abs(Number(numKey.tolerance))
          : 0;

      if (!Number.isFinite(expected)) {
        return { isCorrect: false, score: 0 };
      }

      if (value === null || value === undefined || value === "") {
        return { isCorrect: false, score: 0 };
      }

      let numericInput: number;
      if (typeof value === "number") {
        numericInput = value;
      } else if (typeof value === "string") {
        // Accept both dot and comma decimal separators when clearly a single number
        const cleaned = value.trim().replace(/,/g, ".");
        if (cleaned === "") return { isCorrect: false, score: 0 };
        numericInput = Number(cleaned);
      } else {
        return { isCorrect: false, score: 0 };
      }

      if (!Number.isFinite(numericInput)) {
        return { isCorrect: false, score: 0 };
      }

      const diff = Math.abs(numericInput - expected);
      const matched = diff <= tolerance + 1e-9;
      return { isCorrect: matched, score: matched ? roundScore(maxPoints) : 0 };
    }

    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      const choiceKey = key as unknown as SingleChoiceAnswerKey;
      if (typeof choiceKey.correct !== "string" || choiceKey.correct === "") {
        return { isCorrect: false, score: 0 };
      }
      if (typeof value !== "string" || value === "") {
        return { isCorrect: false, score: 0 };
      }
      const matched = value.trim() === choiceKey.correct.trim();
      return { isCorrect: matched, score: matched ? roundScore(maxPoints) : 0 };
    }

    case "MULTI_SELECT": {
      const msKey = key as unknown as MultiSelectAnswerKey;
      const expectedList = Array.isArray(msKey.correct)
        ? Array.from(new Set(msKey.correct.filter((s): s is string => typeof s === "string")))
        : [];
      const selectedList = Array.isArray(value)
        ? Array.from(new Set(value.filter((s): s is string => typeof s === "string")))
        : [];

      if (expectedList.length === 0) {
        return { isCorrect: false, score: 0 };
      }

      const expectedSet = new Set(expectedList);
      let correctPicked = 0;
      let wrongPicked = 0;
      for (const item of selectedList) {
        if (expectedSet.has(item)) {
          correctPicked++;
        } else {
          wrongPicked++;
        }
      }

      const exactMatch = correctPicked === expectedList.length && wrongPicked === 0;
      if (exactMatch) {
        return { isCorrect: true, score: roundScore(maxPoints) };
      }

      const partialCredit = field.gradingOpts?.partialCredit ?? false;
      if (partialCredit && selectedList.length > 0) {
        const netCorrect = Math.max(0, correctPicked - wrongPicked);
        const ratio = netCorrect / expectedList.length;
        return { isCorrect: false, score: roundScore(maxPoints * ratio) };
      }

      return { isCorrect: false, score: 0 };
    }

    case "TRUE_FALSE": {
      const tfKey = key as unknown as TrueFalseAnswerKey;
      if (typeof tfKey.correct !== "boolean") {
        return { isCorrect: false, score: 0 };
      }
      let parsed: boolean | null = null;
      if (typeof value === "boolean") {
        parsed = value;
      } else if (typeof value === "string") {
        const low = value.trim().toLowerCase();
        if (low === "true" || low === "t" || low === "đúng" || low === "1") parsed = true;
        if (low === "false" || low === "f" || low === "sai" || low === "0") parsed = false;
      }
      if (parsed === null) {
        return { isCorrect: false, score: 0 };
      }
      const matched = parsed === tfKey.correct;
      return { isCorrect: matched, score: matched ? roundScore(maxPoints) : 0 };
    }

    case "CHECKBOX": {
      const cbKey = key as unknown as CheckboxAnswerKey;
      const expected = Boolean(cbKey.checked);
      // Blank (never touched) is NOT an answer: only an explicit true/false is graded,
      // otherwise a "do not tick" key would award points to students who skipped the question.
      let actual: boolean | null = null;
      if (value === true || value === "true") actual = true;
      else if (value === false || value === "false") actual = false;
      if (actual === null) {
        return { isCorrect: false, score: 0 };
      }
      const matched = actual === expected;
      return { isCorrect: matched, score: matched ? roundScore(maxPoints) : 0 };
    }

    case "DICTATION": {
      const dictKey = key as unknown as DictationAnswerKey;
      const transcript = typeof dictKey.transcript === "string" ? dictKey.transcript : "";
      const studentText = typeof value === "string" ? value : "";
      const res = gradeDictationText(transcript, studentText, maxPoints, field.gradingOpts);
      return {
        isCorrect: res.isCorrect,
        score: res.score,
        detail: res.detail,
      };
    }

    default:
      return { isCorrect: false, score: 0 };
  }
}

export function gradeSubmission(
  fields: FieldForGrading[],
  answersByFieldId: Record<string, AnswerValue>
): SubmissionGradeSummary {
  const fieldResults: Record<string, GradeResult> = {};
  let autoScore = 0;
  let maxScore = 0;
  let hasManualFields = false;

  for (const field of fields) {
    const pts = Number.isFinite(field.points) && field.points >= 0 ? field.points : 0;
    maxScore += pts;
    const res = gradeField(field, answersByFieldId[field.id]);
    fieldResults[field.id] = res;
    if (res.score === null) {
      hasManualFields = true;
    } else {
      autoScore += res.score;
    }
  }

  return {
    fieldResults,
    autoScore: roundScore(autoScore),
    maxScore: roundScore(maxScore),
    hasManualFields,
  };
}

/**
 * Parses quick-entry answer key strings like:
 * - "ABCDA BCDDA"
 * - "1A 2B 3C 4D"
 * - "1.A, 2:B, 3-C, 4)D"
 * Returns ordered array of uppercase option letters (e.g. ["A", "B", "C", "D"]).
 */
export function parseBulkAnswerString(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Check if numbered pattern like "1A 2B 3C" or "1.A 2:B"
  const numberedMatches = Array.from(trimmed.matchAll(/(\d+)\s*[.:)\-]?\s*([A-Za-z])/g));
  if (numberedMatches.length > 0 && /\d/.test(trimmed)) {
    const byNum = new Map<number, string>();
    for (const m of numberedMatches) {
      const num = Number(m[1]);
      const letter = (m[2] ?? "").toUpperCase();
      if (Number.isFinite(num) && num > 0 && letter) {
        byNum.set(num, letter);
      }
    }
    return Array.from(byNum.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, letter]) => letter);
  }

  // Otherwise treat as contiguous/space-separated letters "ABCDA BCDDA"
  const letters = trimmed.toUpperCase().match(/[A-Z]/g);
  return letters ?? [];
}
