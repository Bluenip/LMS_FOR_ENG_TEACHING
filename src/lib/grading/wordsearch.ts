import {
  isWordsearchAnswer,
  type GradeResult,
  type GradingOptions,
  type WordsearchAnswerKey,
  type WordsearchOptions,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic Mulberry32 PRNG for repeatable wordsearch grids across client & server. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeWordsearchWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

const DIRECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1],   // right
  [1, 0],   // down
  [1, 1],   // diag down-right
  [-1, 1],  // diag up-right
  [0, -1],  // left
  [-1, 0],  // up
  [-1, -1], // diag up-left
  [1, -1],  // diag down-left
];

function clampGridSize(n: unknown, fallback: number): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(6, Math.min(20, Math.floor(num)));
}

export function generateWordsearchGrid(
  words: string[],
  rowsInput: number,
  colsInput: number,
  seedInput: number
): { grid: string[][]; placedWords: string[] } {
  const rows = clampGridSize(rowsInput, 10);
  const cols = clampGridSize(colsInput, 10);
  const rng = mulberry32(Number.isFinite(seedInput) ? seedInput : 42);

  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
  const normalized = Array.from(
    new Set(words.map(normalizeWordsearchWord).filter((w) => w.length >= 2 && w.length <= Math.max(rows, cols)))
  ).sort((a, b) => b.length - a.length);

  const placedWords: string[] = [];

  for (const word of normalized) {
    // Shuffle candidate starting cells & directions deterministically
    const candidates: Array<{ r: number; c: number; dr: number; dc: number }> = [];
    for (const [dr, dc] of DIRECTIONS) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const endR = r + dr * (word.length - 1);
          const endC = c + dc * (word.length - 1);
          if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;
          candidates.push({ r, c, dr, dc });
        }
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = candidates[i]!;
      candidates[i] = candidates[j]!;
      candidates[j] = tmp;
    }

    for (const cand of candidates) {
      let fits = true;
      for (let k = 0; k < word.length; k++) {
        const ch = grid[cand.r + cand.dr * k]![cand.c + cand.dc * k]!;
        if (ch !== "" && ch !== word[k]) {
          fits = false;
          break;
        }
      }
      if (fits) {
        for (let k = 0; k < word.length; k++) {
          grid[cand.r + cand.dr * k]![cand.c + cand.dc * k] = word[k]!;
        }
        placedWords.push(word);
        break;
      }
    }
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r]![c] === "") {
        grid[r]![c] = alphabet[Math.floor(rng() * alphabet.length)]!;
      }
    }
  }

  return { grid, placedWords };
}

/**
 * Validates that selected cells form a contiguous straight line on the grid
 * and returns the spelled uppercase string, or `null` if invalid/disjoint.
 */
export function extractWordFromCells(
  grid: string[][],
  cells: Array<[number, number]>
): string | null {
  if (!Array.isArray(cells) || cells.length < 2) return null;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return null;

  const first = cells[0];
  const second = cells[1];
  if (!first || !second) return null;

  const dr = second[0] - first[0];
  const dc = second[1] - first[1];
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) {
    return null;
  }

  let out = "";
  for (let i = 0; i < cells.length; i++) {
    const pt = cells[i];
    if (!pt || !Number.isInteger(pt[0]) || !Number.isInteger(pt[1])) return null;
    const expectedR = first[0] + dr * i;
    const expectedC = first[1] + dc * i;
    if (pt[0] !== expectedR || pt[1] !== expectedC) return null;
    if (pt[0] < 0 || pt[0] >= rows || pt[1] < 0 || pt[1] >= cols) return null;
    out += (grid[pt[0]]?.[pt[1]] ?? "").toUpperCase();
  }
  return out;
}

export function gradeWordsearch(
  answerKey: Partial<WordsearchAnswerKey> | null | undefined,
  options: Partial<WordsearchOptions> | null | undefined,
  value: unknown,
  maxPoints: number,
  gradingOpts?: GradingOptions | null
): GradeResult {
  const rawTargets = Array.isArray(answerKey?.words) ? answerKey.words : [];
  const targets = Array.from(
    new Set(rawTargets.map(normalizeWordsearchWord).filter((w) => w.length >= 2))
  );
  if (targets.length === 0) {
    return { isCorrect: false, score: 0 };
  }

  if (!isWordsearchAnswer(value)) {
    return { isCorrect: false, score: 0 };
  }

  let grid: string[][] | null = null;
  let effectiveTargets = targets;
  if (
    options &&
    typeof options.rows === "number" &&
    typeof options.cols === "number" &&
    typeof options.seed === "number"
  ) {
    const generated = generateWordsearchGrid(targets, options.rows, options.cols, options.seed);
    grid = generated.grid;
    if (generated.placedWords.length > 0) {
      effectiveTargets = generated.placedWords;
    }
  } else if (Array.isArray(options?.grid) && options.grid.length > 0) {
    grid = options.grid;
  }

  const targetSet = new Set(effectiveTargets);
  const foundSet = new Set<string>();

  for (const entry of value.found) {
    if (!entry || typeof entry.word !== "string") continue;
    const norm = normalizeWordsearchWord(entry.word);
    if (!targetSet.has(norm)) continue;

    if (grid) {
      if (!Array.isArray(entry.cells) || entry.cells.length !== norm.length) continue;
      const extracted = extractWordFromCells(grid, entry.cells);
      if (!extracted) continue;
      const reversed = extracted.split("").reverse().join("");
      if (extracted !== norm && reversed !== norm) continue;
    } else if (!Array.isArray(entry.cells) || entry.cells.length < norm.length) {
      continue;
    }

    foundSet.add(norm);
  }

  const matched = foundSet.size;
  const allCorrect = matched === effectiveTargets.length;

  if (gradingOpts?.scoring === "ALL_OR_NOTHING") {
    return {
      isCorrect: allCorrect,
      score: allCorrect ? round2(maxPoints) : 0,
    };
  }

  return {
    isCorrect: allCorrect,
    score: round2((maxPoints * matched) / effectiveTargets.length),
  };
}
