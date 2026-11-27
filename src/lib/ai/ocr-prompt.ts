import type { WorksheetSubject } from "@prisma/client";
import { parseAndSanitizeAiQuestions, type AiGeneratedQuestionDraft } from "./gemini-prompt";

export const OCR_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE_GROUP", "TEXT", "ESSAY"] as const;
export type OcrQuestionType = (typeof OCR_QUESTION_TYPES)[number];

export interface OcrImagePart {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** base64 without the data: prefix */
  data: string;
}

export const OCR_MAX_IMAGES = 5;

/** Instruction text for Gemini Vision: transcribe printed exam pages into Pivora field JSON. */
export function buildOcrPrompt(subject?: WorksheetSubject | null): string {
  return [
    "You are transcribing photos of a printed exam paper (1-5 pages, in order) into structured questions.",
    "Return STRICT JSON ONLY: an array of objects, no prose, no markdown. Each object matches one schema:",
    "- MULTIPLE_CHOICE: { type: 'MULTIPLE_CHOICE', prompt, points: 1, options: [{id:'A',text},{id:'B',text},{id:'C',text},{id:'D',text}], answerKey: { correct: 'A'|'B'|'C'|'D' }, explanation: null, topicTag: null }",
    "- TRUE_FALSE_GROUP (Vietnamese 'Đúng/Sai' with statements a-d): { type: 'TRUE_FALSE_GROUP', prompt, points: 1, options: [{id:'a',text},{id:'b',text},{id:'c',text},{id:'d',text}], answerKey: { correct: { a: true|false, ... } }, explanation: null, topicTag: null }",
    "- TEXT (short answer / fill in): { type: 'TEXT', prompt, points: 1, options: null, answerKey: { accepted: ['...'] }, explanation: null, topicTag: null }",
    "- ESSAY (open answer): { type: 'ESSAY', prompt, points: 2, options: null, answerKey: {}, explanation: null, topicTag: null }",
    "",
    "Rules:",
    "1. Copy question text faithfully in the original language. Do not translate, do not invent questions.",
    "2. Write every math / physics / chemistry expression in LaTeX: inline $...$, display $$...$$ (e.g. $x^2+1$, $\\frac{a}{b}$, $H_2SO_4$).",
    "3. If the correct answer is marked on the paper use it; otherwise give the most likely key (the teacher reviews everything).",
    "4. For TEXT questions with no visible answer, put your best answer in accepted.",
    "5. Ignore page headers, school names, student names, scores and handwriting that is not part of a question.",
    subject ? `Subject: ${subject}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Gemini `generateContent` body with the prompt + inline images, JSON output forced. */
export function buildOcrRequestBody(images: OcrImagePart[], subject?: WorksheetSubject | null) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildOcrPrompt(subject) },
          ...images
            .slice(0, OCR_MAX_IMAGES)
            .map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };
}

/** Converts \( \) and \[ \] LaTeX delimiters to the $ / $$ form KaTeX renders in Pivora. */
export function normalizeMathDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `$$${m.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
}

function normalizeDeep(value: unknown): unknown {
  if (typeof value === "string") return normalizeMathDelimiters(value);
  if (Array.isArray(value)) return value.map(normalizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeDeep(v)]));
  }
  return value;
}

/** Parses Gemini output into validated drafts of the 4 OCR-supported types. */
export function parseOcrQuestions(raw: string): AiGeneratedQuestionDraft[] {
  const allowed = new Set<string>(OCR_QUESTION_TYPES);
  return parseAndSanitizeAiQuestions(raw)
    .filter((q) => allowed.has(q.type))
    .map((q) => normalizeDeep(q) as AiGeneratedQuestionDraft);
}
