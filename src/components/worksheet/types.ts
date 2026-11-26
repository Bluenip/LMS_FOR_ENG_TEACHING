import type { FieldPlacement, FieldType, SkillTag } from "@prisma/client";
import {
  isPhotoUploadAnswer,
  isTrueFalseGroupAnswer,
  type AnswerValue,
  type DictationGradeDetail,
  type FieldOption,
  type FieldStyle,
  type GradingOptions,
} from "@/lib/grading/types";

export interface WorksheetPageDTO {
  id: string;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
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
  order: number;
  points: number;
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  style?: FieldStyle | null;
  options?: FieldOption[] | null;
  answerKey: Record<string, unknown>;
  gradingOpts?: GradingOptions | null;
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
  order: number;
  points: number;
  pageIndex?: number | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  style?: FieldStyle | null;
  options?: FieldOption[] | null;
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
  if (isTrueFalseGroupAnswer(value)) {
    return Object.values(value).some((v) => typeof v === "boolean");
  }
  return false;
}

export function formatRevealedAnswer(
  type: FieldType,
  revealedAnswer?: Record<string, unknown>,
  options?: FieldOption[] | null,
  tr: (viText: string, enText: string) => string = (v) => v
): string {
  if (!revealedAnswer) return "";
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
      const found = options?.find((o) => o.id === id);
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
        options && options.length > 0
          ? options.map((o) => o.id)
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
      return String(revealedAnswer.rubric ?? "");
    case "DICTATION":
      return String(revealedAnswer.transcript ?? "");
    default:
      return "";
  }
}
