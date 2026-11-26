import { parseFillBlankText } from "./fill-blank-parser";

export type ParsedExamFieldType =
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE_GROUP"
  | "TEXT"
  | "ESSAY";

export interface ParsedWordExamField {
  label: string;
  type: ParsedExamFieldType;
  prompt: string;
  points: number;
  options?: Array<{ id: string; text: string }>;
  answerKey: Record<string, unknown>;
  gradingOpts?: Record<string, unknown>;
}

export interface WordExamParseResult {
  fields: ParsedWordExamField[];
  skippedLines: string[];
  warnings: string[];
  counts: {
    multipleChoice: number;
    trueFalseGroup: number;
    fillBlank: number;
    essay: number;
  };
}

const EMP_OPEN = "«E»";
const EMP_CLOSE = "«/E»";

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function normalizeInlineMath(line: string): string {
  // Turn clean standalone math fragments like x^{2} or H_{2}O outside $...$ into $...$
  if (line.includes("$")) return line;
  return line.replace(/(?<![A-Za-z0-9$])([A-Za-z0-9]+(?:\^\{[^}]+\}|_\{[^}]+\})+)/g, "$$$1$$");
}

function htmlToAnnotatedLines(html: string): { lines: string[]; tableRows: string[][] } {
  const tableRows: string[][] = [];
  const tableMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const rowMatch of tableMatches) {
    const cells: string[] = [];
    const cellMatches = rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
    for (const c of cellMatches) {
      const clean = decodeHtmlEntities(c[1]!.replace(/<[^>]+>/g, " "))
        .replace(/[\u00A0\s]+/g, " ")
        .trim();
      if (clean) cells.push(clean);
    }
    if (cells.length >= 2) tableRows.push(cells);
  }

  let prepared = html
    .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => `^{${decodeHtmlEntities(inner.replace(/<[^>]+>/g, "")).trim()}}`)
    .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner) => `_{${decodeHtmlEntities(inner.replace(/<[^>]+>/g, "")).trim()}}`)
    .replace(/<(?:strong|b|u)(?:\s+[^>]*)?>/gi, EMP_OPEN)
    .replace(/<\/(?:strong|b|u)>/gi, EMP_CLOSE)
    .replace(/<\/(?:p|li|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "");

  prepared = decodeHtmlEntities(prepared);

  const lines = prepared
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u00A0\t]+/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .filter((l) => l.length > 0);

  return { lines, tableRows };
}

function stripEmp(text: string): string {
  return text.replace(/«\/?E»/g, "").replace(/\s+/g, " ").trim();
}

const ANSWER_SECTION_RE =
  /^(?:đáp\s*án|dap\s*an|bảng\s*đáp\s*án|answer\s*key|keys?)\b\s*[:\-–—]?/i;
const Q_HEADER_RE =
  /^(?:(?:câu|cau|question|bài|bai|q)\s*(\d+)\s*[:.)\-–—]\s*|(\d+)\s*[.)]\s+)(.*)$/i;
const POINTS_SUFFIX_RE =
  /\(\s*(\d+(?:[.,]\d+)?)\s*(?:đ|đ\.|điểm|pt|pts|points?)\s*\)\s*$/i;
const ESSAY_TAG_RE = /\[(?:tự\s*luận|tu\s*luan|essay)\]/i;

interface ExtractedKeys {
  mcq: Record<string, string>;
  tf: Record<string, Record<string, boolean>>;
  endIdx: number;
}

function parseBooleanToken(tok: string): boolean | null {
  const clean = tok.trim().toLowerCase();
  if (/^(?:đ|đúng|d|t|true)$/i.test(clean)) return true;
  if (/^(?:s|sai|f|false)$/i.test(clean)) return false;
  return null;
}

function extractAnswerKeysFromTail(lines: string[], tableRows: string[][]): ExtractedKeys {
  const mcq: Record<string, string> = {};
  const tf: Record<string, Record<string, boolean>> = {};

  // Check HTML tables first (e.g. "1 | A", "1. A | 2. B" etc.)
  for (const row of tableRows) {
    for (let i = 0; i < row.length - 1; i++) {
      const qCell = row[i]!.trim();
      const aCell = row[i + 1]!.trim();
      const qMatch = /^(?:câu\s*)?(\d+)([abcd])?$/i.exec(qCell);
      if (qMatch) {
        const qNum = qMatch[1]!;
        const sub = qMatch[2]?.toLowerCase();
        if (sub) {
          const b = parseBooleanToken(aCell);
          if (b !== null) {
            tf[qNum] = { ...(tf[qNum] ?? {}), [sub]: b };
          }
        } else if (/^[A-Da-d]$/.test(aCell)) {
          mcq[qNum] = aCell.toUpperCase();
        } else {
          const tfPairs = [...aCell.matchAll(/([abcd])\s*[-–:.]?\s*(đ|đúng|s|sai|true|false|t|f)/gi)];
          for (const pair of tfPairs) {
            const b = parseBooleanToken(pair[2]!);
            if (b !== null) {
              tf[qNum] = { ...(tf[qNum] ?? {}), [pair[1]!.toLowerCase()]: b };
            }
          }
        }
      }
    }
  }

  let endIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const clean = stripEmp(lines[i]!);
    if (ANSWER_SECTION_RE.test(clean)) {
      endIdx = i;
      break;
    }
  }

  for (let i = endIdx; i < lines.length; i++) {
    const clean = stripEmp(lines[i]!);
    // e.g. "1.A  2.C  3-B" or "1: A" or "Câu 1: B"
    const tfLineMatch = /(?:câu\s*)?(\d+)\s*[:.)\-–]?\s*((?:[abcd]\s*[-–:.]\s*(?:đ|đúng|s|sai|true|false|t|f)[\s,;]*)+)/gi;
    let tm: RegExpExecArray | null;
    let foundTf = false;
    while ((tm = tfLineMatch.exec(clean)) !== null) {
      foundTf = true;
      const qNum = tm[1]!;
      const pairs = [...tm[2]!.matchAll(/([abcd])\s*[-–:.]\s*(đ|đúng|s|sai|true|false|t|f)/gi)];
      for (const p of pairs) {
        const b = parseBooleanToken(p[2]!);
        if (b !== null) tf[qNum] = { ...(tf[qNum] ?? {}), [p[1]!.toLowerCase()]: b };
      }
    }
    if (!foundTf) {
      const mcqPairs = clean.matchAll(/(?:câu\s*)?(\d+)\s*[:.)\-–\s]\s*([A-D])\b/gi);
      for (const p of mcqPairs) {
        mcq[p[1]!] = p[2]!.toUpperCase();
      }
    }
  }

  return { mcq, tf, endIdx };
}

function splitInlineMcqOptions(lineWithEmp: string): Array<{ id: string; raw: string }> | null {
  // Match "*A. foo   B. bar   C. baz   D. qux" OR single line "A. foo"
  const re = /(?:^|\s)((?:«E»)?\*?\s*([A-D])\s*[.)]\s*(?:«\/E»)?)/g;
  const matches: Array<{ id: string; start: number; tokenLen: number; marker: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineWithEmp)) !== null) {
    const leadingWs = m[0]!.length - m[1]!.length;
    matches.push({
      id: m[2]!.toUpperCase(),
      start: m.index + leadingWs,
      tokenLen: m[1]!.length,
      marker: m[1]!,
    });
  }
  if (matches.length === 0) return null;
  // Require first token at start of trimmed line (or multiple options A..D on same line)
  if (matches[0]!.start > 0 && matches.length < 2) return null;

  const opts: Array<{ id: string; raw: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const nextStart = i + 1 < matches.length ? matches[i + 1]!.start : lineWithEmp.length;
    const body = lineWithEmp.slice(cur.start + cur.tokenLen, nextStart).trim();
    const hadEmpBefore = lineWithEmp.slice(0, cur.start).split(EMP_OPEN).length > lineWithEmp.slice(0, cur.start).split(EMP_CLOSE).length;
    const raw = (hadEmpBefore ? EMP_OPEN : "") + cur.marker + body;
    opts.push({ id: cur.id, raw });
  }
  return opts;
}

function splitInlineTfItems(lineWithEmp: string): Array<{ id: string; raw: string }> | null {
  const re = /(?:^|\s)((?:«E»)?\*?\s*([a-d])\s*[).]\s*(?:«\/E»)?)/g;
  const matches: Array<{ id: string; start: number; tokenLen: number; marker: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineWithEmp)) !== null) {
    const leadingWs = m[0]!.length - m[1]!.length;
    matches.push({
      id: m[2]!.toLowerCase(),
      start: m.index + leadingWs,
      tokenLen: m[1]!.length,
      marker: m[1]!,
    });
  }
  if (matches.length === 0) return null;
  if (matches[0]!.start > 0 && matches.length < 2) return null;

  const items: Array<{ id: string; raw: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const nextStart = i + 1 < matches.length ? matches[i + 1]!.start : lineWithEmp.length;
    const body = lineWithEmp.slice(cur.start + cur.tokenLen, nextStart).trim();
    const hadEmpBefore = lineWithEmp.slice(0, cur.start).split(EMP_OPEN).length > lineWithEmp.slice(0, cur.start).split(EMP_CLOSE).length;
    items.push({ id: cur.id, raw: (hadEmpBefore ? EMP_OPEN : "") + cur.marker + body });
  }
  return items;
}

function hasEmphasisOrAsterisk(raw: string): boolean {
  if (/\*\s*[A-Da-d]\s*[.)]/.test(raw.replace(/«\/?E»/g, ""))) return true;
  if (/«E»[^«]*«\/E»/.test(raw) || /«E»/.test(raw)) {
    // Make sure emphasis includes the label letter or significant content, not empty
    const empSegments = [...raw.matchAll(/«E»([\s\S]*?)(?:«\/E»|$)/g)].map((m) => m[1]!.trim());
    return empSegments.some((s) => s.length > 0);
  }
  return false;
}

function cleanOptionText(raw: string): string {
  let clean = stripEmp(raw);
  clean = clean.replace(/^\*?\s*[A-Da-d]\s*[.)]\s*/, "").trim();
  return normalizeInlineMath(clean);
}

/**
 * Parses HTML from mammoth.convertToHtml() (supporting bold/underline correct cues,
 * HTML answer tables, MCQ, THPT 2025 True/False groups, fill-in-the-blank, and Essay).
 */
export function parseWordExamHtml(
  html: string,
  opts?: { defaultPoints?: number; startNumber?: number }
): WordExamParseResult {
  const { lines, tableRows } = htmlToAnnotatedLines(html);
  return parseAnnotatedLines(lines, tableRows, opts);
}

/**
 * Parses plain text (pasted or .txt/.md) into structured exam fields.
 */
export function parseWordExamText(
  rawText: string,
  opts?: { defaultPoints?: number; startNumber?: number }
): WordExamParseResult {
  const lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u00A0\t]+/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .filter((l) => l.length > 0);
  return parseAnnotatedLines(lines, [], opts);
}

function parseAnnotatedLines(
  lines: string[],
  tableRows: string[][],
  opts?: { defaultPoints?: number; startNumber?: number }
): WordExamParseResult {
  const defaultPoints = opts?.defaultPoints && opts.defaultPoints > 0 ? opts.defaultPoints : 1;
  let nextNum = opts?.startNumber && opts.startNumber > 0 ? opts.startNumber : 1;

  const { mcq: tailMcq, tf: tailTf, endIdx } = extractAnswerKeysFromTail(lines, tableRows);
  const bodyLines = lines.slice(0, endIdx);

  // Group bodyLines into logical question blocks
  interface QuestionBlock {
    explicitNum: string | null;
    lines: string[];
  }

  const blocks: QuestionBlock[] = [];
  const skippedLines: string[] = [];

  for (const line of bodyLines) {
    const clean = stripEmp(line);
    // Do not mistake "a) ..." or "A. ..." for a question header
    const qm = Q_HEADER_RE.exec(clean);
    if (qm) {
      const explicitNum = qm[1] || qm[2] || null;
      // Preserve emphasis on the prompt tail after prefix
      const rawTail = line.replace(
        /^(?:«\/?E»|\s)*(?:(?:câu|cau|question|bài|bai|q)\s*\d+\s*[:.)\-–—]\s*|\d+\s*[.)]\s+)/i,
        ""
      );
      blocks.push({ explicitNum, lines: rawTail.trim() ? [rawTail.trim()] : [] });
      continue;
    }

    if (blocks.length === 0) {
      // Top-level fill-blank line without Question prefix
      if (clean.includes("__")) {
        blocks.push({ explicitNum: null, lines: [line] });
      } else {
        skippedLines.push(clean);
      }
      continue;
    }

    blocks[blocks.length - 1]!.lines.push(line);
  }

  const fields: ParsedWordExamField[] = [];
  const warnings: string[] = [];
  const counts = { multipleChoice: 0, trueFalseGroup: 0, fillBlank: 0, essay: 0 };

  for (const block of blocks) {
    const rawJoined = block.lines.join("\n");
    const cleanJoined = stripEmp(rawJoined);

    // 1) Fill-in-the-blank lines (__answer__)
    if (cleanJoined.includes("__")) {
      const fillParsed = parseFillBlankText(cleanJoined, {
        defaultPoints,
        startNumber: block.explicitNum ? Number(block.explicitNum) || nextNum : nextNum,
      });
      for (const ff of fillParsed.fields) {
        fields.push({
          label: ff.label,
          type: "TEXT",
          prompt: normalizeInlineMath(ff.prompt),
          points: ff.points,
          answerKey: { accepted: ff.accepted },
        });
        counts.fillBlank++;
      }
      nextNum++;
      continue;
    }

    const qNum = block.explicitNum || String(nextNum);
    nextNum = (Number(block.explicitNum) || nextNum) + 1;

    // Extract optional points from first prompt line
    let blockPoints = defaultPoints;
    const promptLines: string[] = [];
    const mcqOpts: Array<{ id: string; text: string; hintedCorrect: boolean }> = [];
    const tfOpts: Array<{ id: string; text: string; explicitBool: boolean | null }> = [];

    for (const ln of block.lines) {
      const cleanLn = stripEmp(ln);
      // Could the prompt end with inline A. B. C. D. on the same line?
      const inlineMcq = splitInlineMcqOptions(ln);
      if (inlineMcq) {
        // Check if prompt text existed before A.
        const firstOptMatch = /(?:^|\s)((?:«E»)?\*?\s*A\s*[.)])/.exec(ln);
        if (firstOptMatch && firstOptMatch.index > 0 && promptLines.length === 0) {
          const beforePrompt = stripEmp(ln.slice(0, firstOptMatch.index));
          if (beforePrompt) promptLines.push(beforePrompt);
        }
        for (const o of inlineMcq) {
          mcqOpts.push({
            id: o.id,
            text: cleanOptionText(o.raw),
            hintedCorrect: hasEmphasisOrAsterisk(o.raw),
          });
        }
        continue;
      }

      const inlineTf = splitInlineTfItems(ln);
      if (inlineTf && (mcqOpts.length === 0)) {
        const firstTfMatch = /(?:^|\s)((?:«E»)?\*?\s*a\s*[).])/.exec(ln);
        if (firstTfMatch && firstTfMatch.index > 0 && promptLines.length === 0) {
          const beforePrompt = stripEmp(ln.slice(0, firstTfMatch.index));
          if (beforePrompt) promptLines.push(beforePrompt);
        }
        for (const item of inlineTf) {
          const cleanItem = stripEmp(item.raw);
          const boolMatch = /\(\s*(đ|đúng|s|sai|true|false|t|f)\s*\)\s*$/i.exec(cleanItem);
          const explicitBool = boolMatch ? parseBooleanToken(boolMatch[1]!) : null;
          let text = cleanOptionText(item.raw);
          if (boolMatch) {
            text = text.replace(/\(\s*(?:đ|đúng|s|sai|true|false|t|f)\s*\)\s*$/i, "").trim();
          }
          tfOpts.push({
            id: item.id,
            text,
            explicitBool: explicitBool ?? (hasEmphasisOrAsterisk(item.raw) ? true : null),
          });
        }
        continue;
      }

      promptLines.push(cleanLn);
    }

    let prompt = promptLines.join(" ").replace(/\s+/g, " ").trim();
    const ptsMatch = POINTS_SUFFIX_RE.exec(prompt);
    if (ptsMatch) {
      const parsedPts = Number((ptsMatch[1] ?? "").replace(",", "."));
      if (Number.isFinite(parsedPts) && parsedPts > 0 && parsedPts <= 1000) {
        blockPoints = parsedPts;
      }
      prompt = prompt.slice(0, ptsMatch.index).trim();
    }
    const isExplicitEssay = ESSAY_TAG_RE.test(prompt);
    prompt = normalizeInlineMath(prompt.replace(ESSAY_TAG_RE, "").trim());

    // 2) Multiple choice (has >= 2 A/B/C/D options)
    if (mcqOpts.length >= 2 && !isExplicitEssay) {
      const uniqueOpts = mcqOpts.map((o) => ({ id: o.id, text: o.text }));
      const detectedFromMark = mcqOpts.find((o) => o.hintedCorrect)?.id;
      const correct = tailMcq[qNum] ?? detectedFromMark ?? uniqueOpts[0]!.id;
      if (!tailMcq[qNum] && !detectedFromMark) {
        warnings.push(
          `Câu ${qNum}: Chưa phát hiện đáp án đúng (in đậm, gạch chân, dấu * hoặc bảng đáp án), tạm chọn ${correct}.`
        );
      }
      fields.push({
        label: qNum,
        type: "MULTIPLE_CHOICE",
        prompt,
        points: blockPoints,
        options: uniqueOpts,
        answerKey: { correct },
      });
      counts.multipleChoice++;
      continue;
    }

    // 3) True/False group (THPT 2025: a/b/c/d items)
    if (tfOpts.length >= 2 && !isExplicitEssay) {
      const correctMap: Record<string, boolean> = {};
      const tfTableForQ = tailTf[qNum] ?? {};
      let missingBool = false;
      for (const item of tfOpts) {
        const val = tfTableForQ[item.id] ?? item.explicitBool;
        if (val === null || val === undefined) {
          correctMap[item.id] = false;
          missingBool = true;
        } else {
          correctMap[item.id] = val;
        }
      }
      if (missingBool) {
        warnings.push(
          `Câu ${qNum}: Một số ý Đúng/Sai chưa rõ đáp án (Đ)/(S) — hãy kiểm tra lại.`
        );
      }
      fields.push({
        label: qNum,
        type: "TRUE_FALSE_GROUP",
        prompt,
        points: blockPoints,
        options: tfOpts.map((o) => ({ id: o.id, text: o.text })),
        answerKey: { correct: correctMap },
        gradingOpts: { tfScoring: "THPT_2025" },
      });
      counts.trueFalseGroup++;
      continue;
    }

    // 4) Essay fallback
    if (prompt.length > 0) {
      fields.push({
        label: qNum,
        type: "ESSAY",
        prompt,
        points: blockPoints,
        answerKey: { rubric: "" },
      });
      counts.essay++;
    }
  }

  return { fields, skippedLines, warnings, counts };
}
