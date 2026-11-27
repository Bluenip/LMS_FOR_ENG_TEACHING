import { XMLParser } from "fast-xml-parser";

/** Draft question produced by every importer (maps 1:1 to a Field / QuestionBankItem). */
export interface ImportedQuestion {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "TEXT" | "ESSAY";
  prompt: string;
  options: Array<{ id: string; text: string }> | null;
  answerKey: Record<string, unknown>;
  points: number;
  explanation: string | null;
}

export interface ImportResult {
  questions: ImportedQuestion[];
  warnings: string[];
}

const LETTERS = "ABCDEFGH";
const MAX_QUESTIONS = 300;

/**
 * Aiken format:
 *   Question text
 *   A. option
 *   B) option
 *   ANSWER: B
 * Blocks are separated by the ANSWER line (blank lines optional).
 */
export function parseAikenText(text: string): ImportResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  let prompt: string[] = [];
  let options: Array<{ id: string; text: string }> = [];
  let block = 1;
  for (const line of lines) {
    if (!line) continue;
    const opt = /^([A-H])[.)]\s+(.+)$/.exec(line);
    const ans = /^ANSWER:\s*([A-H])\s*$/i.exec(line);
    if (ans) {
      const key = ans[1]!.toUpperCase();
      if (prompt.length === 0 || options.length < 2) warnings.push(`Câu ${block}: thiếu đề hoặc phương án`);
      else if (!options.some((o) => o.id === key)) warnings.push(`Câu ${block}: đáp án ${key} không có trong phương án`);
      else questions.push({ type: "MULTIPLE_CHOICE", prompt: prompt.join("\n"), options, answerKey: { correct: key }, points: 1, explanation: null });
      prompt = [];
      options = [];
      block++;
    } else if (opt && prompt.length > 0) {
      options.push({ id: opt[1]!, text: opt[2]! });
    } else {
      if (options.length > 0) {
        warnings.push(`Câu ${block}: thiếu dòng ANSWER`);
        prompt = [];
        options = [];
        block++;
      }
      prompt.push(line);
    }
    if (questions.length >= MAX_QUESTIONS) break;
  }
  if (prompt.length > 0) warnings.push(`Câu ${block}: thiếu dòng ANSWER`);
  return { questions, warnings };
}

function stripHtml(v: unknown): string {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : (v as { "#text"?: unknown })?.["#text"] !== undefined ? String((v as { "#text": unknown })["#text"]) : "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Moodle XML (multichoice, truefalse, shortanswer, essay). DTDs and entity expansion are disabled
 * (no XXE / billion-laughs): documents containing <!DOCTYPE or <!ENTITY are rejected outright.
 */
export function parseMoodleXml(xml: string): ImportResult {
  if (xml.length > 5_000_000) throw new Error("XML_TOO_LARGE");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML_DTD_NOT_ALLOWED");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    htmlEntities: false,
    allowBooleanAttributes: true,
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xml) as { quiz?: { question?: unknown } };
  const items = asArray(doc.quiz?.question as Record<string, unknown> | Array<Record<string, unknown>>);
  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  for (const [i, q] of items.entries()) {
    const type = String(q["@_type"] ?? "");
    if (type === "category" || type === "description") continue;
    const qt = q.questiontext as { text?: unknown } | undefined;
    const prompt = stripHtml(qt?.text);
    const points = Number((q.defaultgrade as unknown) ?? 1) || 1;
    const feedback = stripHtml((q.generalfeedback as { text?: unknown } | undefined)?.text) || null;
    if (!prompt) {
      warnings.push(`Câu ${i + 1}: thiếu đề`);
      continue;
    }
    const answers = asArray(q.answer as Record<string, unknown> | Array<Record<string, unknown>>).map((a) => ({
      text: stripHtml(a.text),
      fraction: Number(a["@_fraction"] ?? 0),
    }));
    if (type === "multichoice") {
      const opts = answers.slice(0, 8).map((a, k) => ({ id: LETTERS[k]!, text: a.text }));
      const best = answers.reduce((bi, a, k) => (a.fraction > (answers[bi]?.fraction ?? -1) ? k : bi), 0);
      if (opts.length < 2 || !(answers[best]!.fraction > 0)) {
        warnings.push(`Câu ${i + 1}: trắc nghiệm thiếu phương án hoặc đáp án đúng`);
        continue;
      }
      questions.push({ type: "MULTIPLE_CHOICE", prompt, options: opts, answerKey: { correct: LETTERS[best] }, points, explanation: feedback });
    } else if (type === "truefalse") {
      const right = answers.find((a) => a.fraction > 0)?.text.toLowerCase();
      questions.push({ type: "TRUE_FALSE", prompt, options: null, answerKey: { correct: right === "true" }, points, explanation: feedback });
    } else if (type === "shortanswer" || type === "numerical") {
      const accepted = answers.filter((a) => a.fraction > 0).map((a) => a.text).filter(Boolean);
      if (accepted.length === 0) {
        warnings.push(`Câu ${i + 1}: trả lời ngắn thiếu đáp án`);
        continue;
      }
      questions.push({ type: "TEXT", prompt, options: null, answerKey: { accepted }, points, explanation: feedback });
    } else if (type === "essay") {
      questions.push({ type: "ESSAY", prompt, options: null, answerKey: {}, points, explanation: feedback });
    } else {
      warnings.push(`Câu ${i + 1}: dạng "${type}" chưa hỗ trợ`);
    }
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return { questions, warnings };
}

/** RFC 4180-ish CSV/TSV splitter (quoted fields, doubled quotes, CRLF). */
export function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Quizizz spreadsheet export as CSV:
 * Question Text, Question Type, Option 1..5, Correct Answer (1-based, "1,3" for multi), Time, Image Link.
 * Only single-answer multiple choice and fill-in-the-blank rows are imported.
 */
export function parseQuizizzCsv(csv: string): ImportResult {
  const rows = splitDelimited(csv, csv.includes("\t") && !csv.includes(",") ? "\t" : ",");
  const questions: ImportedQuestion[] = [];
  const warnings: string[] = [];
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const hasHeader = header.some((h) => h.includes("question"));
  for (const [i, r] of (hasHeader ? rows.slice(1) : rows).entries()) {
    const [text, type, o1, o2, o3, o4, o5, correct] = r.map((c) => c.trim());
    if (!text) continue;
    const t = (type ?? "").toLowerCase();
    if (t.includes("fill") || t.includes("open")) {
      const accepted = [o1, o2, o3, o4, o5].filter((x): x is string => Boolean(x));
      if (t.includes("open") || accepted.length === 0) questions.push({ type: "ESSAY", prompt: text, options: null, answerKey: {}, points: 1, explanation: null });
      else questions.push({ type: "TEXT", prompt: text, options: null, answerKey: { accepted }, points: 1, explanation: null });
      continue;
    }
    const texts = [o1, o2, o3, o4, o5].filter((x): x is string => Boolean(x));
    const idx = Number((correct ?? "").split(/[,;]/)[0]) - 1;
    if (texts.length < 2 || !(idx >= 0 && idx < texts.length)) {
      warnings.push(`Dòng ${i + (hasHeader ? 2 : 1)}: thiếu phương án hoặc đáp án`);
      continue;
    }
    if ((correct ?? "").includes(",")) warnings.push(`Dòng ${i + (hasHeader ? 2 : 1)}: nhiều đáp án — chỉ lấy đáp án đầu`);
    questions.push({
      type: "MULTIPLE_CHOICE",
      prompt: text,
      options: texts.map((tx, k) => ({ id: LETTERS[k]!, text: tx })),
      answerKey: { correct: LETTERS[idx] },
      points: 1,
      explanation: null,
    });
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return { questions, warnings };
}

export interface AnkiCard {
  front: string;
  back: string;
}

/** Anki "Notes in Plain Text" (tab separated, `#` comment lines) or a 2-column CSV. */
export function parseAnkiCsv(text: string): { cards: AnkiCard[]; warnings: string[] } {
  const body = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n");
  const delimiter = body.includes("\t") ? "\t" : body.includes(";") && !body.includes(",") ? ";" : ",";
  const rows = splitDelimited(body, delimiter);
  const cards: AnkiCard[] = [];
  const warnings: string[] = [];
  for (const [i, r] of rows.entries()) {
    const front = stripHtml(r[0] ?? "");
    const back = stripHtml(r[1] ?? "");
    if (!front || !back) {
      warnings.push(`Dòng ${i + 1}: thiếu mặt trước hoặc mặt sau`);
      continue;
    }
    cards.push({ front: front.slice(0, 500), back: back.slice(0, 1000) });
    if (cards.length >= 2000) break;
  }
  return { cards, warnings };
}

/** Anki-importable plain text: one `front<TAB>back` per line, with the import header directives. */
export function exportAnkiCsv(cards: AnkiCard[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  return ["#separator:tab", "#html:false", ...cards.map((c) => `${clean(c.front)}\t${clean(c.back)}`)].join("\n") + "\n";
}
