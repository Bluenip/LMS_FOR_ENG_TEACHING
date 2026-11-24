export interface ParsedFillBlankField {
  label: string;
  prompt: string;
  accepted: string[];
  points: number;
  originalLine: string;
}

export interface FillBlankParseResult {
  fields: ParsedFillBlankField[];
  skippedLines: string[];
  warnings: string[];
}

/** Matches __answer__ or __ans1/ans2__ (including leading/trailing spaces inside __ ... __). */
const BLANK_TOKEN_REGEX = /__([^_\r\n]+?(?:_[^_\r\n]+?)*)__/g;

/** Recognizes Vietnamese / English question prefixes like "Câu 1:", "Question 2.", "3)", "Bài 4 -". */
const QUESTION_PREFIX_REGEX =
  /^(?:(?:câu|cau|question|q|bài|bai)\s*(\d+)\s*[:.)\-–—]\s*|(\d+)\s*[.):\-–—]\s+)/i;

/** Optional inline points tag like "(2đ)" or "(1.5pt)" at end of line. */
const POINTS_TAG_REGEX = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:đ|đ\.|điểm|pt|pts|points?)\s*\)\s*$/i;

function joinPromptWithBlank(before: string, rawInner: string, blankMarker: string, after: string): string {
  const leadSpaceInside = /^\s/.test(rawInner);
  const trailSpaceInside = /\s$/.test(rawInner);
  const needSpaceBefore =
    before.length > 0 &&
    !/[\s(\[{"'“‘]$/.test(before) &&
    (leadSpaceInside || /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]$/.test(before));
  const needSpaceAfter =
    after.length > 0 &&
    !/^[\s.,!?;:)\]}"'”’]/.test(after) &&
    (trailSpaceInside || /^[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(after));

  return (
    before +
    (needSpaceBefore ? " " : "") +
    blankMarker +
    (needSpaceAfter ? " " : "") +
    after
  );
}

/**
 * Parses teacher-authored fill-in-the-blank lines (from Word .docx / .txt / pasted text)
 * into EngClass TEXT fields.
 *
 * Handles real-world Word exports including:
 *   - Non-breaking spaces (\u00A0) and tabs
 *   - Double numbering like "Câu 1: 1.   What __do you know about jungles__?"
 *   - Accidental spaces inside underscores like "Jungles__ are very beautiful__."
 *   - Multiple accepted answers separated by "/" or "|"
 *   - Multiple blanks in a single sentence (split into 7a, 7b, 10a, 10b, 10c...)
 */
export function parseFillBlankText(
  rawText: string,
  opts?: { defaultPoints?: number; startNumber?: number }
): FillBlankParseResult {
  const defaultPoints =
    opts?.defaultPoints && opts.defaultPoints > 0 ? opts.defaultPoints : 1;
  let autoNum = opts?.startNumber && opts.startNumber > 0 ? opts.startNumber : 1;

  const lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u00A0\t]+/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .filter((l) => l.length > 0);

  const fields: ParsedFillBlankField[] = [];
  const skippedLines: string[] = [];
  const warnings: string[] = [];

  for (const rawLine of lines) {
    let working = rawLine;
    let points = defaultPoints;

    const ptsMatch = POINTS_TAG_REGEX.exec(working);
    if (ptsMatch) {
      const parsedPts = Number((ptsMatch[1] ?? "").replace(",", "."));
      if (Number.isFinite(parsedPts) && parsedPts > 0 && parsedPts <= 1000) {
        points = parsedPts;
      }
      working = working.slice(0, ptsMatch.index).trim();
    }

    // Strip up to 2 leading question numbers (e.g. "Câu 1: 1. What ...")
    let explicitNum: string | null = null;
    for (let pass = 0; pass < 2; pass++) {
      const prefixMatch = QUESTION_PREFIX_REGEX.exec(working);
      if (!prefixMatch) break;
      if (!explicitNum) {
        explicitNum = prefixMatch[1] || prefixMatch[2] || null;
      }
      working = working.slice(prefixMatch[0].length).trim();
    }

    // Find all __...__ tokens in this line
    const matches: Array<{ rawInner: string; trimmed: string; start: number; end: number }> = [];
    BLANK_TOKEN_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BLANK_TOKEN_REGEX.exec(working)) !== null) {
      const rawInner = m[1] ?? "";
      const trimmed = rawInner.trim();
      if (trimmed.length > 0 && !/^_+$/.test(trimmed)) {
        matches.push({
          rawInner,
          trimmed,
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    }

    if (matches.length === 0) {
      skippedLines.push(rawLine);
      continue;
    }

    const baseLabel = explicitNum ?? String(autoNum);
    if (explicitNum) {
      const asInt = Number(explicitNum);
      if (Number.isFinite(asInt) && asInt >= autoNum) {
        autoNum = asInt + 1;
      }
    } else {
      autoNum++;
    }

    if (matches.length === 1) {
      const single = matches[0]!;
      const accepted = splitAcceptedAnswers(single.trimmed);
      if (accepted.length === 0) {
        warnings.push(`Câu ${baseLabel}: ô điền trống không có đáp án hợp lệ.`);
        continue;
      }
      const prompt = joinPromptWithBlank(
        working.slice(0, single.start),
        single.rawInner,
        "________",
        working.slice(single.end)
      ).replace(/ {2,}/g, " ").trim();

      fields.push({
        label: baseLabel,
        prompt,
        accepted,
        points,
        originalLine: rawLine,
      });
    } else {
      // Multiple blanks in a single sentence -> split into 7a, 7b, 10a, 10b, 10c...
      const perBlankPoints = Math.round((points / matches.length) * 100) / 100;
      matches.forEach((blank, idx) => {
        const subLetter = String.fromCharCode(97 + (idx % 26));
        const subLabel = `${baseLabel}${subLetter}`;
        const accepted = splitAcceptedAnswers(blank.trimmed);
        if (accepted.length === 0) {
          warnings.push(`Câu ${subLabel}: ô điền trống không có đáp án hợp lệ.`);
          return;
        }
        // Build prompt showing all blanks, highlighting this blank with ____ [7a] ____
        let prompt = "";
        let cursor = 0;
        matches.forEach((other, j) => {
          const seg = working.slice(cursor, other.start);
          const marker = j === idx ? `____ [${subLabel}] ____` : "________";
          prompt = joinPromptWithBlank(prompt + seg, other.rawInner, marker, "");
          cursor = other.end;
        });
        const tail = working.slice(cursor);
        const last = matches[matches.length - 1]!;
        const needSpaceTail =
          tail.length > 0 &&
          !/^[\s.,!?;:)\]}"'”’]/.test(tail) &&
          (/\s$/.test(last.rawInner) || /^[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(tail));
        prompt = (prompt + (needSpaceTail ? " " : "") + tail).replace(/ {2,}/g, " ").trim();

        fields.push({
          label: subLabel,
          prompt,
          accepted,
          points: perBlankPoints > 0 ? perBlankPoints : defaultPoints,
          originalLine: rawLine,
        });
      });
    }
  }

  return { fields, skippedLines, warnings };
}

function splitAcceptedAnswers(inner: string): string[] {
  const parts = inner
    .split(/[/|]/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(parts));
}
