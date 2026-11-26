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

export interface RubricCriterion {
  id: string;
  title: string;
  description?: string;
  maxPoints: number;
}

export type RubricScoreMap = Record<string, number>;

export type PhotoAnnotationType = "pen" | "rect" | "circle" | "check" | "cross" | "text";

export interface PhotoAnnotationItem {
  id: string;
  type: PhotoAnnotationType;
  color: string;
  strokeWidth: number;
  points?: Array<[number, number]>;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
}

export type PhotoAnnotationMap = Record<string, PhotoAnnotationItem[]>;

export type TrueFalseScoringMode = "THPT_2025" | "ALL_OR_NOTHING" | "EQUAL";

export interface GradingOptions {
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  ignoreExtraSpaces?: boolean;
  partialCredit?: boolean;
  scoring?: "WORD_ACCURACY" | "ALL_OR_NOTHING";
  tfScoring?: TrueFalseScoringMode;
  orderingScoring?: "LCS" | "EXACT_POS";
}

export interface MatchItem {
  id: string;
  text: string;
  x?: number;
  y?: number;
}

export interface MatchOptions {
  left: MatchItem[];
  right: MatchItem[];
}

export interface DragDropToken {
  id: string;
  text: string;
  imageKey?: string;
}

export interface DragDropSlot {
  id: string;
  label: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface DragDropOptions {
  tokens: DragDropToken[];
  slots: DragDropSlot[];
  singleUse?: boolean;
}

export interface SpeakingOptions {
  lang?: "en-US" | "en-GB";
  maxTries?: number;
}

export interface VoiceAnswerOptions {
  maxDurationSec?: number;
}

export interface HighlightOptions {
  tokens: string[];
}

export interface OrderingOptions {
  items: Array<{ id: string; text: string }>;
}

export interface WordsearchOptions {
  rows: number;
  cols: number;
  seed: number;
  showWordList?: boolean;
  wordHints?: string[];
  grid?: string[][];
  wordCount?: number;
}

export interface DrawOptions {
  width?: number;
  height?: number;
  backgroundKey?: string;
}

export interface CodeOptions {
  language: "python" | "cpp" | "javascript" | "pascal";
  starterCode?: string;
  sampleInput?: string;
  sampleOutput?: string;
}

export type FieldOptionsValue =
  | FieldOption[]
  | MatchOptions
  | DragDropOptions
  | SpeakingOptions
  | VoiceAnswerOptions
  | HighlightOptions
  | OrderingOptions
  | WordsearchOptions
  | DrawOptions
  | CodeOptions;

export function asOptionList(options: unknown): FieldOption[] {
  return Array.isArray(options) ? (options as FieldOption[]) : [];
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

export interface MatchAnswerKey {
  pairs: Array<[string, string]>;
}

export interface DragDropAnswerKey {
  slots: Record<string, string[]>;
}

export interface SpeakingAnswerKey {
  transcript: string;
}

export interface VoiceAnswerKey {
  note?: string;
}

export interface HighlightAnswerKey {
  indices: number[];
}

export interface OrderingAnswerKey {
  order: string[];
}

export interface WordsearchAnswerKey {
  words: string[];
}

export interface DrawAnswerKey {
  note?: string;
}

export interface CodeAnswerKey {
  referenceCode?: string;
  expectedOutput?: string;
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
  | DictationAnswerKey
  | MatchAnswerKey
  | DragDropAnswerKey
  | SpeakingAnswerKey
  | VoiceAnswerKey
  | HighlightAnswerKey
  | OrderingAnswerKey
  | WordsearchAnswerKey
  | DrawAnswerKey
  | CodeAnswerKey;

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

export type MatchAnswerValue = Record<string, string>;

export type DragDropAnswerValue = Record<string, string[]>;

export interface SpeakingAnswerValue {
  text: string;
  tries: number;
  audioKey?: string;
}

export interface VoiceAnswerValue {
  fileKey: string;
  mimeType: string;
  durationSec?: number;
}

export type HighlightAnswerValue = number[];

export type OrderingAnswerValue = string[];

export interface WordsearchFoundEntry {
  word: string;
  cells: Array<[number, number]>;
}

export interface WordsearchAnswerValue {
  found: WordsearchFoundEntry[];
}

export interface DrawAnswerValue {
  fileKey: string;
}

export interface CodeAnswerValue {
  code: string;
  lastOutput?: string;
}

export type AnswerValue =
  | string
  | string[]
  | number[]
  | boolean
  | number
  | TrueFalseGroupAnswerValue
  | PhotoUploadAnswerValue
  | MatchAnswerValue
  | DragDropAnswerValue
  | SpeakingAnswerValue
  | VoiceAnswerValue
  | WordsearchAnswerValue
  | DrawAnswerValue
  | CodeAnswerValue
  | null
  | undefined;

export function isManualFieldType(type: FieldType): boolean {
  return (
    type === "ESSAY" ||
    type === "PHOTO_UPLOAD" ||
    type === "VOICE_ANSWER" ||
    type === "DRAW" ||
    type === "CODE"
  );
}

export function isPhotoUploadAnswer(val: unknown): val is PhotoUploadAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    Array.isArray((val as PhotoUploadAnswerValue).files)
  );
}

export function isSpeakingAnswer(val: unknown): val is SpeakingAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof (val as SpeakingAnswerValue).text === "string" &&
    typeof (val as SpeakingAnswerValue).tries === "number"
  );
}

export function isVoiceAnswer(val: unknown): val is VoiceAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof (val as VoiceAnswerValue).fileKey === "string" &&
    typeof (val as VoiceAnswerValue).mimeType === "string"
  );
}

export function isDrawAnswer(val: unknown): val is DrawAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof (val as DrawAnswerValue).fileKey === "string" &&
    typeof (val as VoiceAnswerValue).mimeType !== "string"
  );
}

export function isCodeAnswer(val: unknown): val is CodeAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof (val as CodeAnswerValue).code === "string"
  );
}

export function isWordsearchAnswer(val: unknown): val is WordsearchAnswerValue {
  return (
    Boolean(val) &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    Array.isArray((val as WordsearchAnswerValue).found)
  );
}

export function isNumberArray(val: unknown): val is number[] {
  return Array.isArray(val) && val.every((x) => typeof x === "number");
}

export function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((x) => typeof x === "string");
}

export function isTrueFalseGroupAnswer(val: unknown): val is TrueFalseGroupAnswerValue {
  if (!val || typeof val !== "object" || Array.isArray(val) || isPhotoUploadAnswer(val)) {
    return false;
  }
  const vals = Object.values(val);
  return vals.length > 0 && vals.every((v) => typeof v === "boolean" || v === null);
}

export interface FieldForGrading {
  id: string;
  type: FieldType;
  points: number;
  options?: unknown;
  answerKey: unknown;
  gradingOpts?: GradingOptions | null;
}

export interface GradeResult {
  isCorrect: boolean | null; // null = requires manual grading (ESSAY, PHOTO_UPLOAD, VOICE_ANSWER, DRAW, CODE)
  score: number | null; // null = requires manual grading
  detail?: DictationGradeDetail | null;
}

export interface SubmissionGradeSummary {
  fieldResults: Record<string, GradeResult>;
  autoScore: number;
  maxScore: number;
  hasManualFields: boolean;
}
