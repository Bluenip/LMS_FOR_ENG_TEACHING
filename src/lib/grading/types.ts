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

export type AnswerKey =
  | TextAnswerKey
  | NumberAnswerKey
  | SingleChoiceAnswerKey
  | MultiSelectAnswerKey
  | TrueFalseAnswerKey
  | CheckboxAnswerKey
  | EssayAnswerKey;

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
}

export interface SubmissionGradeSummary {
  fieldResults: Record<string, GradeResult>;
  autoScore: number;
  maxScore: number;
  hasManualFields: boolean;
}
