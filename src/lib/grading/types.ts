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

export type TrueFalseScoringMode = "THPT_2025" | "ALL_OR_NOTHING" | "EQUAL";

export interface GradingOptions {
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  ignoreExtraSpaces?: boolean;
  partialCredit?: boolean;
  scoring?: "WORD_ACCURACY" | "ALL_OR_NOTHING";
  tfScoring?: TrueFalseScoringMode;
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

export interface TrueFalseGroupAnswerKey {
  correct: Record<string, boolean>;
}

export interface CheckboxAnswerKey {
  checked: boolean;
}

export interface EssayAnswerKey {
  rubric?: string;
}

export interface PhotoUploadAnswerKey {
  rubric?: string;
  maxFiles?: number;
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
  | TrueFalseGroupAnswerKey
  | CheckboxAnswerKey
  | EssayAnswerKey
  | PhotoUploadAnswerKey
  | DictationAnswerKey;

export interface UploadedAnswerFile {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface PhotoUploadAnswerValue {
  files: UploadedAnswerFile[];
  note?: string;
}

export type TrueFalseGroupAnswerValue = Record<string, boolean | null>;

export type AnswerValue =
  | string
  | string[]
  | boolean
  | number
  | TrueFalseGroupAnswerValue
  | PhotoUploadAnswerValue
  | null
  | undefined;

export function isManualFieldType(type: FieldType): boolean {
  return type === "ESSAY" || type === "PHOTO_UPLOAD";
}

export function isPhotoUploadAnswer(val: unknown): val is PhotoUploadAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    Array.isArray((val as PhotoUploadAnswerValue).files)
  );
}

export function isTrueFalseGroupAnswer(val: unknown): val is TrueFalseGroupAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    !isPhotoUploadAnswer(val)
  );
}

export interface FieldForGrading {
  id: string;
  type: FieldType;
  points: number;
  answerKey: unknown;
  gradingOpts?: GradingOptions | null;
}

export interface GradeResult {
  isCorrect: boolean | null; // null = requires manual grading (ESSAY, PHOTO_UPLOAD)
  score: number | null; // null = requires manual grading (ESSAY, PHOTO_UPLOAD)
  detail?: DictationGradeDetail | null;
}

export interface SubmissionGradeSummary {
  fieldResults: Record<string, GradeResult>;
  autoScore: number;
  maxScore: number;
  hasManualFields: boolean;
}
