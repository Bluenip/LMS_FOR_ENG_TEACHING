import type { FieldType } from "@prisma/client";

export interface FieldOption {
  id: string;
  text: string;
}

export interface FieldStyle {
  fontSize?: number;
  align?: "left" | "center" | "right";
  color?: string;
  transparentBg?: boolean;
}

export interface GradingOptions {
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  ignoreExtraSpaces?: boolean;
  partialCredit?: boolean;
  scoring?: "WORD_ACCURACY" | "ALL_OR_NOTHING";
}

export interface TextAnswerKey {
  accepted: string[];
}

export interface NumberAnswerKey {
  value: number;
  tolerance?: number;
}

export interface SingleChoiceAnswerKey {
  correct: string;
}

export interface MultiSelectAnswerKey {
  correct: string[];
}

export interface TrueFalseAnswerKey {
  correct: boolean;
}

export interface CheckboxAnswerKey {
  checked: boolean;
}

export interface EssayAnswerKey {
  rubric?: string;
}

export interface DictationAnswerKey {
  transcript: string;
}

export interface DictationDiffToken {
  kind: "correct" | "wrong" | "missing" | "extra";
  text: string;
  expected?: string;
}

export interface DictationGradeDetail {
  kind: "DICTATION";
  correctWords: number;
  totalWords: number;
  wrongWords: number;
  missingWords: number;
  extraWords: number;
  accuracy: number;
  tokens: DictationDiffToken[];
}

export type AnswerKey =
  | TextAnswerKey
  | NumberAnswerKey
  | SingleChoiceAnswerKey
  | MultiSelectAnswerKey
  | TrueFalseAnswerKey
  | CheckboxAnswerKey
  | EssayAnswerKey
  | DictationAnswerKey;

export type AnswerValue = string | string[] | boolean | number | null | undefined;

export interface FieldForGrading {
  id: string;
  type: FieldType;
  points: number;
  answerKey: unknown;
  gradingOpts?: GradingOptions | null;
}

export interface GradeResult {
  isCorrect: boolean | null; // null = requires manual grading (ESSAY)
  score: number | null; // null = requires manual grading (ESSAY)
  detail?: DictationGradeDetail | null;
}

export interface SubmissionGradeSummary {
  fieldResults: Record<string, GradeResult>;
  autoScore: number;
  maxScore: number;
  hasManualFields: boolean;
}
