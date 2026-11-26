import type { FieldPlacement, FieldType, SkillTag } from "@prisma/client";
import {
  asOptionList,
  isCodeAnswer,
  isDrawAnswer,
  isPhotoUploadAnswer,
  isSpeakingAnswer,
  isTrueFalseGroupAnswer,
  isVoiceAnswer,
  isWordsearchAnswer,
  type AnswerValue,
  type DictationGradeDetail,
  type FieldOption,
  type FieldOptionsValue,
  type FieldStyle,
  type GradingOptions,
  type PhotoAnnotationMap,
  type RubricCriterion,
  type RubricScoreMap,
} from "@/lib/grading/types";

export interface WorksheetPageDTO {
  id: string;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  imageKey?: string | null;
}

export interface WorksheetAudioDTO {
  id: string;
  title: string;
  fileKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec: number | null;
  order: number;
}

export interface WorksheetPassageDTO {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface EditorFieldDTO {
  id: string; // client temp id or Prisma cuid
  isPersisted?: boolean;
  placement: FieldPlacement;
  type: FieldType;
  label: string;
  prompt?: string | null;
  explanation?: string | null;
  skillTag?: SkillTag | null;
  passageId?: string | null;
  audioId?: string | null;
  imageKey?: string | null;
  order: number;
  points: number;
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  style?: FieldStyle | null;
  options?: FieldOptionsValue | null;
  answerKey: Record<string, unknown>;
  gradingOpts?: GradingOptions | null;
  rubric?: RubricCriterion[] | null;
}

export interface StudentFieldDTO {
  id: string;
  worksheetId: string;
  placement: FieldPlacement;
  type: FieldType;
  label: string;
  prompt?: string | null;
  skillTag?: SkillTag | null;
  passageId?: string | null;
  audioId?: string | null;
  imageKey?: string | null;
  order: number;
  points: number;
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  style?: FieldStyle | null;
  options?: FieldOptionsValue | null;
  // Only populated after submission when assignment.showResult allows it
  rubric?: RubricCriterion[] | null;
  // Only populated after submission when assignment.showResult & showAnswerKey allow it
  revealedAnswer?: Record<string, unknown>;
  explanation?: string | null;
}

export interface StudentAnswerState {
  fieldId: string;
  value: AnswerValue;
  isCorrect?: boolean | null;
  score?: number | null;
  teacherNote?: string | null;
  gradeDetail?: DictationGradeDetail | null;
  rubricScores?: RubricScoreMap | null;
  annotations?: PhotoAnnotationMap | null;
}

export function isAnswerFilled(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPhotoUploadAnswer(value)) {
    return value.files.length > 0 || Boolean(value.note?.trim());
  }
  if (isVoiceAnswer(value)) {
    return Boolean(value.fileKey);
  }
  if (isDrawAnswer(value)) {
    return Boolean(value.fileKey);
  }
  if (isSpeakingAnswer(value)) {
    return value.text.trim().length > 0 || Boolean(value.audioKey);
  }
  if (isCodeAnswer(value)) {
    return value.code.trim().length > 0;
  }
  if (isWordsearchAnswer(value)) {
    return value.found.length > 0;
  }
  if (isTrueFalseGroupAnswer(value)) {
    return Object.values(value).some((v) => typeof v === "boolean");
  }
  if (typeof value === "object") {
    return Object.values(value).some((v) =>
      Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0
    );
  }
  return false;
}

export function formatRevealedAnswer(
  type: FieldType,
  revealedAnswer?: Record<string, unknown>,
  options?: FieldOptionsValue | FieldOption[] | null,
  tr: (viText: string, enText: string) => string = (v) => v
): string {
  if (!revealedAnswer) return "";
  const listOpts = asOptionList(options);
  switch (type) {
    case "TEXT": {
      const acc = revealedAnswer.accepted;
      return Array.isArray(acc) ? acc.join(" | ") : "";
    }
    case "NUMBER": {
      const v = revealedAnswer.value;
      const tol = revealedAnswer.tolerance;
      return tol ? `${v} (±${tol})` : String(v ?? "");
    }
    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      const id = String(revealedAnswer.correct ?? "");
      const found = listOpts.find((o) => o.id === id);
      return found ? (found.text && found.text !== found.id ? `${found.id}. ${found.text}` : found.id) : id;
    }
    case "MULTI_SELECT": {
      const arr = Array.isArray(revealedAnswer.correct) ? revealedAnswer.correct : [];
      return arr.join(", ");
    }
    case "TRUE_FALSE":
      return revealedAnswer.correct === true ? tr("Đúng", "True") : tr("Sai", "False");
    case "TRUE_FALSE_GROUP": {
      const correctMap =
        revealedAnswer.correct && typeof revealedAnswer.correct === "object"
          ? (revealedAnswer.correct as Record<string, boolean>)
          : {};
      const ids =
        listOpts.length > 0
          ? listOpts.map((o) => o.id)
          : Object.keys(correctMap).sort();
      return ids
        .filter((id) => typeof correctMap[id] === "boolean")
        .map((id) => `${id}: ${correctMap[id] ? tr("Đúng", "True") : tr("Sai", "False")}`)
        .join(" · ");
    }
    case "CHECKBOX":
      return revealedAnswer.checked === true
        ? tr("Có đánh dấu (✓)", "Ticked (✓)")
        : tr("Không đánh dấu", "Not ticked");
    case "ESSAY":
      return String(revealedAnswer.rubric ?? tr("Chấm tự luận", "Essay (manual grading)"));
    case "PHOTO_UPLOAD":
    case "VOICE_ANSWER":
    case "DRAW":
      return String(revealedAnswer.rubric ?? revealedAnswer.note ?? "");
    case "DICTATION":
    case "SPEAKING":
      return String(revealedAnswer.transcript ?? "");
    case "MATCH": {
      const pairs = Array.isArray(revealedAnswer.pairs)
        ? (revealedAnswer.pairs as Array<[string, string]>)
        : [];
      return pairs.map(([l, r]) => `${l}→${r}`).join(" · ");
    }
    case "DRAG_DROP": {
      const slots =
        revealedAnswer.slots && typeof revealedAnswer.slots === "object"
          ? (revealedAnswer.slots as Record<string, string[]>)
          : {};
      return Object.entries(slots)
        .map(([slot, toks]) => `${slot}: ${Array.isArray(toks) ? toks.join(", ") : ""}`)
        .join(" | ");
    }
    case "HIGHLIGHT": {
      const indices = Array.isArray(revealedAnswer.indices) ? revealedAnswer.indices : [];
      const ho =
        options && !Array.isArray(options) && "tokens" in options && Array.isArray(options.tokens)
          ? options.tokens
          : [];
      if (ho.length > 0) {
        return indices
          .map((i) => (typeof i === "number" ? ho[i] : ""))
          .filter(Boolean)
          .join(", ");
      }
      return indices.join(", ");
    }
    case "ORDERING": {
      const order = Array.isArray(revealedAnswer.order) ? revealedAnswer.order : [];
      return order.join(" → ");
    }
    case "WORDSEARCH": {
      const words = Array.isArray(revealedAnswer.words) ? revealedAnswer.words : [];
      return words.join(", ");
    }
    case "CODE":
      return String(revealedAnswer.expectedOutput ?? revealedAnswer.referenceCode ?? "");
    default:
      return "";
  }
}
