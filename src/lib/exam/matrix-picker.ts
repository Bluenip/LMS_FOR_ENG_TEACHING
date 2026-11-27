import type { FieldType, SkillTag, WorksheetSubject } from "@prisma/client";

export interface PoolQuestion {
  id: string;
  subject: WorksheetSubject;
  type: FieldType;
  topicTag?: string | null;
  skillTag?: SkillTag | null;
  level?: string | null;
  difficulty: number;
  tags: string[];
}

export interface MatrixRowSpec {
  subject?: WorksheetSubject;
  type?: FieldType;
  topicTag?: string;
  skillTag?: SkillTag;
  level?: string;
  difficultyMin?: number;
  difficultyMax?: number;
  tags?: string[];
  count: number;
  points?: number;
}

export interface MatrixShortage {
  rowIndex: number;
  requested: number;
  available: number;
  availableUnique: number;
}

export interface MatrixPickedItem<T extends PoolQuestion = PoolQuestion> {
  item: T;
  rowIndex: number;
  points?: number;
}

export type MatrixPickResult<T extends PoolQuestion = PoolQuestion> =
  | { ok: true; picked: MatrixPickedItem<T>[] }
  | { ok: false; shortages: MatrixShortage[] };

/** Checks whether a question bank item matches all active constraints of one matrix row. */
export function matchesMatrixRow(q: PoolQuestion, row: MatrixRowSpec): boolean {
  if (row.subject && q.subject !== row.subject) return false;
  if (row.type && q.type !== row.type) return false;
  if (row.skillTag && q.skillTag !== row.skillTag) return false;

  if (row.topicTag && row.topicTag.trim().length > 0) {
    const target = row.topicTag.trim().toLowerCase();
    const actual = (q.topicTag ?? "").trim().toLowerCase();
    if (!actual || actual !== target) return false;
  }

  if (row.level && row.level.trim().length > 0) {
    const target = row.level.trim().toLowerCase();
    const actual = (q.level ?? "").trim().toLowerCase();
    if (!actual || actual !== target) return false;
  }

  if (row.difficultyMin !== undefined && q.difficulty < row.difficultyMin) return false;
  if (row.difficultyMax !== undefined && q.difficulty > row.difficultyMax) return false;

  if (row.tags && row.tags.length > 0) {
    const qTags = new Set(q.tags.map((t) => t.trim().toLowerCase()));
    for (const reqTag of row.tags) {
      const clean = reqTag.trim().toLowerCase();
      if (clean && !qTags.has(clean)) return false;
    }
  }

  return true;
}

/** Counts how many questions in the pool satisfy a matrix row. */
export function countAvailableForMatrixRow<T extends PoolQuestion>(
  pool: T[],
  row: MatrixRowSpec
): number {
  let total = 0;
  for (const q of pool) {
    if (matchesMatrixRow(q, row)) total++;
  }
  return total;
}

/** Non-mutating Fisher-Yates shuffle. */
export function fisherYatesShuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Picks non-overlapping random questions matching every matrix row.
 * Evaluates narrowest rows (fewest matching pool items) first so overlapping broader rows
 * cannot starve narrower constraints.
 */
export function pickQuestionsByMatrix<T extends PoolQuestion>(
  pool: T[],
  rows: MatrixRowSpec[],
  rng: () => number = Math.random
): MatrixPickResult<T> {
  if (rows.length === 0) {
    return { ok: true, picked: [] };
  }

  const rowCandidates = rows.map((row, rowIndex) => ({
    rowIndex,
    row,
    candidates: pool.filter((q) => matchesMatrixRow(q, row)),
  }));

  // Satisfy narrowest rows first; break ties by higher requested count then original index
  const sortedEntries = [...rowCandidates].sort(
    (a, b) =>
      a.candidates.length - b.candidates.length ||
      b.row.count - a.row.count ||
      a.rowIndex - b.rowIndex
  );

  const usedIds = new Set<string>();
  const pickedByRow = new Map<number, MatrixPickedItem<T>[]>();
  const shortages: MatrixShortage[] = [];

  for (const entry of sortedEntries) {
    const unused = entry.candidates.filter((c) => !usedIds.has(c.id));
    if (unused.length < entry.row.count) {
      shortages.push({
        rowIndex: entry.rowIndex,
        requested: entry.row.count,
        available: entry.candidates.length,
        availableUnique: unused.length,
      });
      continue;
    }

    const chosen = fisherYatesShuffle(unused, rng).slice(0, entry.row.count);
    for (const item of chosen) usedIds.add(item.id);
    pickedByRow.set(
      entry.rowIndex,
      chosen.map((item) => ({
        item,
        rowIndex: entry.rowIndex,
        points: entry.row.points,
      }))
    );
  }

  if (shortages.length > 0) {
    shortages.sort((a, b) => a.rowIndex - b.rowIndex);
    return { ok: false, shortages };
  }

  const orderedPicked: MatrixPickedItem<T>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowItems = pickedByRow.get(i) ?? [];
    orderedPicked.push(...rowItems);
  }

  return { ok: true, picked: orderedPicked };
}
