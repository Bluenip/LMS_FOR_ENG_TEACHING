/**
 * Local plagiarism detection (no external API): token normalisation + Winnowing fingerprints
 * (Schleimer, Wilkerson & Aiken 2003). Essays use word k-grams, code uses normalised token k-grams
 * so renaming variables or reformatting does not hide copying.
 */

export interface Token {
  /** Normalised token text. */
  t: string;
  /** Character offsets in the ORIGINAL text (end exclusive). */
  start: number;
  end: number;
}

export type CodeLanguage = "python" | "javascript" | "cpp" | "pascal";

export const ESSAY_K = 5;
export const CODE_K = 7;
export const WINDOW = 4;

/** Lower-cased words (Vietnamese diacritics kept, punctuation dropped) with original offsets. */
export function normalizeEssayText(text: string): Token[] {
  const out: Token[] = [];
  const src = text.normalize("NFC");
  const re = /[\p{L}\p{M}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ t: m[0].toLocaleLowerCase("vi"), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const KEYWORDS: Record<CodeLanguage, Set<string>> = {
  python: new Set(
    "and as assert break class continue def del elif else except false finally for from global if import in is lambda none nonlocal not or pass raise return true try while with yield print input range len int float str list dict set".split(" ")
  ),
  javascript: new Set(
    "break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof undefined var void while with yield async await of console log math".split(" ")
  ),
  cpp: new Set(
    "auto bool break case catch char class const continue default delete do double else enum extern false float for friend goto if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void while include std cin cout endl vector string main".split(" ")
  ),
  pascal: new Set(
    "and array begin case const div do downto else end false file for function goto if in integer real boolean char string label mod nil not of or packed procedure program record repeat set then to true type until var while with write writeln read readln uses".split(" ")
  ),
};

function stripCodeComments(code: string, lang: CodeLanguage): string {
  // Replace comments by spaces of equal length so offsets stay aligned with the original text.
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  let out = code;
  if (lang === "python") {
    out = out.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, blank).replace(/#[^\n]*/g, blank);
  } else if (lang === "pascal") {
    out = out.replace(/\{[\s\S]*?\}/g, blank).replace(/\(\*[\s\S]*?\*\)/g, blank).replace(/\/\/[^\n]*/g, blank);
  } else {
    out = out.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
  }
  return out;
}

/**
 * Code tokens with identifiers → "ID", string literals → "S", numbers → "N" (keywords and
 * operators kept), so renamed variables and changed messages still match.
 */
export function normalizeCodeTokens(code: string, language: CodeLanguage): Token[] {
  const src = stripCodeComments(code, language);
  const kw = KEYWORDS[language];
  const caseInsensitive = language === "pascal";
  const re = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<=|>=|:=|\+\+|--|&&|\|\||<<|>>|[^\sA-Za-z0-9_])/g;
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let t: string;
    if (m[1]) t = "S";
    else if (m[2]) t = "N";
    else if (m[3]) {
      const word = caseInsensitive ? m[3].toLowerCase() : m[3];
      t = kw.has(word.toLowerCase()) ? word.toLowerCase() : "ID";
    } else t = m[4]!;
    out.push({ t, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** 32-bit FNV-1a of a k-gram. */
function hashGram(tokens: Token[], i: number, k: number): number {
  let h = 0x811c9dc5;
  for (let j = i; j < i + k; j++) {
    const s = tokens[j]!.t;
    for (let c = 0; c < s.length; c++) {
      h ^= s.charCodeAt(c);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function kgramHashes(tokens: Token[], k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + k <= tokens.length; i++) out.push(hashGram(tokens, i, k));
  return out;
}

/** Winnowing: in every window of `w` consecutive k-gram hashes keep the (rightmost) minimum. */
export function winnow(hashes: number[], w: number): Map<number, number[]> {
  const fp = new Map<number, number[]>();
  if (hashes.length === 0) return fp;
  if (hashes.length < w) {
    let min = 0;
    for (let i = 1; i < hashes.length; i++) if (hashes[i]! <= hashes[min]!) min = i;
    fp.set(hashes[min]!, [min]);
    return fp;
  }
  let lastPicked = -1;
  for (let start = 0; start + w <= hashes.length; start++) {
    let min = start;
    for (let i = start + 1; i < start + w; i++) if (hashes[i]! <= hashes[min]!) min = i;
    if (min !== lastPicked) {
      const list = fp.get(hashes[min]!) ?? [];
      list.push(min);
      fp.set(hashes[min]!, list);
      lastPicked = min;
    }
  }
  return fp;
}

export interface MatchedSpan {
  startA: number;
  endA: number;
  startB: number;
  endB: number;
}

export interface SimilarityResult {
  /** |A ∩ B| / |A ∪ B| over fingerprints. */
  jaccard: number;
  /** |A ∩ B| / min(|A|, |B|): high when one answer is copied inside a longer one. */
  containment: number;
  /** Score used for reports (= containment, 0..1). */
  similarity: number;
  matchedSpans: MatchedSpan[];
}

function emptyResult(): SimilarityResult {
  return { jaccard: 0, containment: 0, similarity: 0, matchedSpans: [] };
}

/** Compares two token streams; spans are character ranges in each ORIGINAL text. */
export function compareTokens(a: Token[], b: Token[], k: number, w: number = WINDOW): SimilarityResult {
  if (a.length < k || b.length < k) return emptyResult();
  const ha = kgramHashes(a, k);
  const hb = kgramHashes(b, k);
  const fa = winnow(ha, w);
  const fb = winnow(hb, w);
  let shared = 0;
  for (const h of fa.keys()) if (fb.has(h)) shared++;
  const union = fa.size + fb.size - shared;
  const jaccard = union > 0 ? shared / union : 0;
  const containment = Math.min(fa.size, fb.size) > 0 ? shared / Math.min(fa.size, fb.size) : 0;

  // Highlight every common k-gram (not only fingerprints) so the side-by-side view is readable.
  const firstInB = new Map<number, number>();
  hb.forEach((h, j) => {
    if (!firstInB.has(h)) firstInB.set(h, j);
  });
  const pairs: Array<[number, number]> = [];
  ha.forEach((h, i) => {
    const j = firstInB.get(h);
    if (j !== undefined) pairs.push([i, j]);
  });

  const spans: MatchedSpan[] = [];
  let run: { i0: number; j0: number; i1: number; j1: number } | null = null;
  const flush = () => {
    if (!run) return;
    spans.push({
      startA: a[run.i0]!.start,
      endA: a[run.i1 + k - 1]!.end,
      startB: b[run.j0]!.start,
      endB: b[run.j1 + k - 1]!.end,
    });
    run = null;
  };
  for (const [i, j] of pairs) {
    if (run && i === run.i1 + 1 && j === run.j1 + 1) {
      run.i1 = i;
      run.j1 = j;
    } else {
      flush();
      run = { i0: i, j0: j, i1: i, j1: j };
    }
  }
  flush();

  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { jaccard: round(jaccard), containment: round(containment), similarity: round(containment), matchedSpans: spans };
}

export function compareEssays(a: string, b: string): SimilarityResult {
  return compareTokens(normalizeEssayText(a), normalizeEssayText(b), ESSAY_K);
}

export function compareCode(a: string, b: string, language: CodeLanguage): SimilarityResult {
  return compareTokens(normalizeCodeTokens(a, language), normalizeCodeTokens(b, language), CODE_K);
}

/** Merges overlapping [start, end) ranges of one side, for highlighting. */
export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}
