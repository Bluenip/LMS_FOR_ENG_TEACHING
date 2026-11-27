export type ItemFlag = "GOOD" | "TOO_EASY" | "TOO_HARD" | "CHECK_KEY" | "LOW_DISCRIMINATION" | "NOT_ENOUGH_DATA";

export interface ItemResponse {
  /** Score earned on this item (null = ungraded, skipped). */
  score: number | null;
  /** Chosen option id for single-choice items (distractor analysis). */
  choice?: string | null;
}

export interface ItemInput {
  fieldId: string;
  label: string;
  type: string;
  maxPoints: number;
  options?: Array<{ id: string; text: string }> | null;
  correctOption?: string | null;
}

/** One examinee: their response for each item, keyed by fieldId. */
export interface ExamineeResponses {
  submissionId: string;
  responses: Record<string, ItemResponse>;
}

export interface DistractorRow {
  optionId: string;
  text: string;
  isKey: boolean;
  /** share of the upper / lower 27 % group choosing this option, 0..1 */
  upper: number;
  lower: number;
  overall: number;
}

export interface ItemAnalysisRow {
  fieldId: string;
  label: string;
  type: string;
  n: number;
  pValue: number | null;
  discriminationIndex: number | null;
  pointBiserial: number | null;
  flag: ItemFlag;
  distractors: DistractorRow[];
}

export const MIN_EXAMINEES_FOR_DISCRIMINATION = 6;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Classical test theory per item:
 * - difficulty pValue = mean(score / max) (> 0.85 too easy, < 0.25 too hard)
 * - discrimination D = p(upper 27 %) − p(lower 27 %) (needs ≥ 6 examinees)
 * - corrected point-biserial r between item score and total score of the OTHER items
 * - distractor shares in both groups; D < 0 ⇒ CHECK_KEY (weak students beat strong ones: wrong key?)
 */
export function analyzeItems(items: ItemInput[], examinees: ExamineeResponses[]): ItemAnalysisRow[] {
  const totals = examinees.map((e) =>
    items.reduce((sum, it) => sum + (e.responses[it.fieldId]?.score ?? 0), 0)
  );
  const order = examinees.map((_, i) => i).sort((a, b) => totals[b]! - totals[a]!);
  const groupSize = Math.max(1, Math.round(examinees.length * 0.27));
  const enough = examinees.length >= MIN_EXAMINEES_FOR_DISCRIMINATION;
  const upper = enough ? order.slice(0, groupSize) : [];
  const lower = enough ? order.slice(-groupSize) : [];

  return items.map((it) => {
    const ratio = (i: number) => {
      const s = examinees[i]!.responses[it.fieldId]?.score;
      return s === null || s === undefined || !(it.maxPoints > 0) ? null : Math.max(0, Math.min(1, s / it.maxPoints));
    };
    const graded = examinees.map((_, i) => i).filter((i) => ratio(i) !== null);
    const pValue = graded.length > 0 ? r3(graded.reduce((s, i) => s + ratio(i)!, 0) / graded.length) : null;

    const groupP = (idx: number[]) => {
      const g = idx.filter((i) => ratio(i) !== null);
      return g.length > 0 ? g.reduce((s, i) => s + ratio(i)!, 0) / g.length : null;
    };
    const pu = groupP(upper);
    const pl = groupP(lower);
    const discriminationIndex = enough && pu !== null && pl !== null ? r3(pu - pl) : null;

    const rest = graded.map((i) => totals[i]! - (examinees[i]!.responses[it.fieldId]?.score ?? 0));
    const rpb = enough ? pearson(graded.map((i) => ratio(i)!), rest) : null;

    let distractors: DistractorRow[] = [];
    if (it.options && it.options.length > 0) {
      const share = (idx: number[], opt: string) =>
        idx.length > 0 ? r3(idx.filter((i) => examinees[i]!.responses[it.fieldId]?.choice === opt).length / idx.length) : 0;
      const all = examinees.map((_, i) => i);
      distractors = it.options.map((o) => ({
        optionId: o.id,
        text: o.text,
        isKey: o.id === it.correctOption,
        upper: share(upper, o.id),
        lower: share(lower, o.id),
        overall: share(all, o.id),
      }));
    }

    let flag: ItemFlag;
    if (pValue === null) flag = "NOT_ENOUGH_DATA";
    else if (discriminationIndex !== null && discriminationIndex < 0) flag = "CHECK_KEY";
    else if (pValue > 0.85) flag = "TOO_EASY";
    else if (pValue < 0.25) flag = "TOO_HARD";
    else if (discriminationIndex !== null && discriminationIndex < 0.2) flag = "LOW_DISCRIMINATION";
    else if (!enough) flag = "NOT_ENOUGH_DATA";
    else flag = "GOOD";

    return {
      fieldId: it.fieldId,
      label: it.label,
      type: it.type,
      n: graded.length,
      pValue,
      discriminationIndex,
      pointBiserial: rpb === null ? null : r3(rpb),
      flag,
      distractors,
    };
  });
}
