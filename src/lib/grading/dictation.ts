import type { DictationDiffToken, DictationGradeDetail, GradingOptions } from "./types";

const CURLY_APOSTROPHE_REGEX = /[\u2018\u2019\u201A\u201B\u2032\u0060]/g;
const CURLY_DOUBLE_QUOTE_REGEX = /[\u201C\u201D\u201E\u201F\u2033]/g;
const PUNCTUATION_STRIP_REGEX = /[.,!?;:()[\]{}"\-–—…/\\@#$%^&*_+=~|<>]/g;
const EDGE_APOSTROPHE_REGEX = /^'+|'+$/g;

interface WordToken {
  raw: string;
  norm: string;
}

export function tokenizeDictationWords(
  input: string,
  opts?: GradingOptions | null
): WordToken[] {
  const caseSensitive = opts?.caseSensitive ?? false;
  const ignorePunctuation = opts?.ignorePunctuation ?? true;

  const unified = input
    .normalize("NFC")
    .replace(CURLY_APOSTROPHE_REGEX, "'")
    .replace(CURLY_DOUBLE_QUOTE_REGEX, '"')
    .trim();

  if (!unified) return [];

  const rawParts = unified.split(/\s+/);
  const tokens: WordToken[] = [];

  for (const part of rawParts) {
    let norm = part;
    if (ignorePunctuation) {
      norm = norm.replace(PUNCTUATION_STRIP_REGEX, "").replace(EDGE_APOSTROPHE_REGEX, "");
    }
    if (!caseSensitive) {
      norm = norm.toLowerCase();
    }
    if (norm.length > 0) {
      tokens.push({ raw: part, norm });
    }
  }

  return tokens;
}

/**
 * Word-level Levenshtein alignment between an expected transcript and a student's dictation.
 * Produces colored diff tokens (correct / wrong / missing / extra) and computes accuracy.
 */
export function gradeDictationText(
  transcript: string,
  studentText: string,
  maxPoints: number,
  opts?: GradingOptions | null
): {
  isCorrect: boolean;
  score: number;
  detail: DictationGradeDetail;
} {
  const expected = tokenizeDictationWords(transcript, opts);
  const actual = tokenizeDictationWords(studentText, opts);
  const scoring = opts?.scoring ?? "WORD_ACCURACY";

  if (expected.length === 0) {
    return {
      isCorrect: false,
      score: 0,
      detail: {
        kind: "DICTATION",
        correctWords: 0,
        totalWords: 0,
        wrongWords: 0,
        missingWords: 0,
        extraWords: actual.length,
        accuracy: 0,
        tokens: actual.map((w) => ({ kind: "extra", text: w.raw })),
      },
    };
  }

  const m = expected.length;
  const n = actual.length;

  // DP table (m+1) x (n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    const expNorm = expected[i - 1]!.norm;
    for (let j = 1; j <= n; j++) {
      const actNorm = actual[j - 1]!.norm;
      if (expNorm === actNorm) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        const sub = dp[i - 1]![j - 1]! + 1;
        const del = dp[i - 1]![j]! + 1;
        const ins = dp[i]![j - 1]! + 1;
        dp[i]![j] = Math.min(sub, del, ins);
      }
    }
  }

  // Backtrack to construct token diff
  const rev: DictationDiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      expected[i - 1]!.norm === actual[j - 1]!.norm &&
      dp[i]![j] === dp[i - 1]![j - 1]
    ) {
      rev.push({ kind: "correct", text: actual[j - 1]!.raw, expected: expected[i - 1]!.raw });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + 1) {
      rev.push({ kind: "wrong", text: actual[j - 1]!.raw, expected: expected[i - 1]!.raw });
      i--;
      j--;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      rev.push({ kind: "missing", text: expected[i - 1]!.raw, expected: expected[i - 1]!.raw });
      i--;
    } else {
      rev.push({ kind: "extra", text: actual[j - 1]!.raw });
      j--;
    }
  }

  const tokens = rev.reverse();
  let correctWords = 0;
  let wrongWords = 0;
  let missingWords = 0;
  let extraWords = 0;
  for (const t of tokens) {
    if (t.kind === "correct") correctWords++;
    else if (t.kind === "wrong") wrongWords++;
    else if (t.kind === "missing") missingWords++;
    else extraWords++;
  }

  const denom = Math.max(m, n);
  const accuracy = denom > 0 ? correctWords / denom : 0;
  const exactMatch = correctWords === m && wrongWords === 0 && missingWords === 0 && extraWords === 0;

  const rawScore =
    scoring === "ALL_OR_NOTHING"
      ? exactMatch
        ? maxPoints
        : 0
      : maxPoints * accuracy;

  const score = Math.round(rawScore * 100) / 100;

  return {
    isCorrect: exactMatch,
    score,
    detail: {
      kind: "DICTATION",
      correctWords,
      totalWords: m,
      wrongWords,
      missingWords,
      extraWords,
      accuracy: Math.round(accuracy * 1000) / 1000,
      tokens,
    },
  };
}

/**
 * Strips expected/missing transcript words when the student is NOT yet permitted
 * to view the answer key (e.g. while additional attempts remain), so the transcript
 * can never be leaked while still showing the student's score/accuracy and own-word feedback.
 */
export function sanitizeDictationDetail(
  detail: unknown,
  revealKey: boolean
): DictationGradeDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Partial<DictationGradeDetail>;
  if (d.kind !== "DICTATION" || !Array.isArray(d.tokens)) return null;

  if (revealKey) {
    return d as DictationGradeDetail;
  }

  return {
    kind: "DICTATION",
    correctWords: d.correctWords ?? 0,
    totalWords: d.totalWords ?? 0,
    wrongWords: d.wrongWords ?? 0,
    missingWords: d.missingWords ?? 0,
    extraWords: d.extraWords ?? 0,
    accuracy: d.accuracy ?? 0,
    tokens: d.tokens
      .filter((t) => t.kind !== "missing")
      .map((t) => ({
        kind: t.kind,
        text: t.text,
      })),
  };
}
