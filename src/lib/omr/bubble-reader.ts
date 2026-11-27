import type { GrayImage } from "./perspective-warp";
import { grayPercentile } from "./perspective-warp";
import {
  OMR_BUBBLE_RADIUS,
  OMR_CANONICAL_WIDTH,
  getOmrTemplate,
  type OmrBubbleGroup,
  type OmrTemplateId,
} from "./templates";

export const FILL_CERTAIN = 0.42;
export const FILL_FAINT = 0.28;
export const FILL_MARGIN = 0.15;

export type BubbleGroupStatus = "OK" | "BLANK" | "FAINT" | "MULTI";

export interface BubbleGroupReading {
  key: string;
  /** Chosen value (argmax) or null when blank / several bubbles are filled. */
  value: string | null;
  status: BubbleGroupStatus;
  fills: number[];
}

/** TF answers per statement (true = Đúng). */
export type OmrTfAnswer = Partial<Record<"a" | "b" | "c" | "d", boolean | null>>;

export interface OmrResolvedAnswers {
  sbd: string | null;
  variantCode: string | null;
  mc: Record<string, string | null>;
  tf: Record<string, OmrTfAnswer>;
  sa: Record<string, string | null>;
}

export interface OmrReadResult {
  readings: BubbleGroupReading[];
  answers: OmrResolvedAnswers;
  needsReview: boolean;
  /** Share of groups read without doubt (OK or clearly BLANK), 0..1. */
  confidence: number;
  /** Keys of groups a teacher should look at (faint / multiple marks). */
  reviewKeys: string[];
}

/** Classifies one group from its fill ratios (pure; exported for tests). */
export function classifyFills(fills: number[]): { index: number | null; status: BubbleGroupStatus } {
  if (fills.length === 0) return { index: null, status: "BLANK" };
  let first = 0;
  for (let i = 1; i < fills.length; i++) if (fills[i]! > fills[first]!) first = i;
  let second = -1;
  for (let i = 0; i < fills.length; i++) {
    if (i !== first && (second === -1 || fills[i]! > fills[second]!)) second = i;
  }
  const f1 = fills[first]!;
  const f2 = second >= 0 ? fills[second]! : 0;
  if (f1 < FILL_FAINT) return { index: null, status: "BLANK" };
  if (f1 >= FILL_CERTAIN && f2 >= FILL_CERTAIN) return { index: null, status: "MULTI" };
  if (f1 >= FILL_CERTAIN && f1 - f2 >= FILL_MARGIN) return { index: first, status: "OK" };
  // faint mark, or a second bubble that is nearly as dark (half-erased / double mark)
  return { index: first, status: f2 >= FILL_FAINT ? "MULTI" : "FAINT" };
}

/**
 * Darkness of the inner disc of one bubble (printed outline excluded), 0 = paper, 1 = solid ink.
 * Continuous rather than binary so a light pencil mark lands in the "faint" band instead of vanishing.
 */
function fillRatio(img: GrayImage, cx: number, cy: number, r: number, paper: number): number {
  const inner = r * 0.62;
  const ink = paper * 0.25;
  const span = Math.max(1, paper - ink);
  let sum = 0;
  let total = 0;
  const x0 = Math.max(0, Math.floor(cx - inner));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + inner));
  const y0 = Math.max(0, Math.floor(cy - inner));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + inner));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > inner * inner) continue;
      total++;
      sum += Math.min(1, Math.max(0, (paper - img.data[y * img.width + x]!) / span));
    }
  }
  return total === 0 ? 0 : sum / total;
}

function readGroup(img: GrayImage, group: OmrBubbleGroup, scale: number): BubbleGroupReading {
  const r = OMR_BUBBLE_RADIUS * scale;
  const xs = group.bubbles.map((b) => b.u * img.width);
  const ys = group.bubbles.map((b) => b.v * img.height);
  // Local adaptive threshold: paper brightness around this row/column of bubbles.
  const paper = grayPercentile(img, 0.85, {
    x0: Math.min(...xs) - 3 * r,
    y0: Math.min(...ys) - 3 * r,
    x1: Math.max(...xs) + 3 * r,
    y1: Math.max(...ys) + 3 * r,
  });
  const fills = group.bubbles.map((_, i) => Math.round(fillRatio(img, xs[i]!, ys[i]!, r, Math.max(60, paper)) * 1000) / 1000);
  const { index, status } = classifyFills(fills);
  return {
    key: group.key,
    value: index !== null && status !== "MULTI" ? group.bubbles[index]!.value : null,
    status,
    fills,
  };
}

/** Builds the structured answers from group readings (also used after a teacher edits a reading). */
export function resolveAnswers(templateId: OmrTemplateId, readings: BubbleGroupReading[]): OmrResolvedAnswers {
  const t = getOmrTemplate(templateId);
  const byKey = new Map(readings.map((r) => [r.key, r]));
  const digits = (kind: "SBD" | "VARIANT") => {
    const cols = t.groups.filter((g) => g.kind === kind);
    const vals = cols.map((g) => byKey.get(g.key)?.value ?? null);
    if (vals.every((v) => v === null)) return null;
    return vals.map((v) => v ?? "?").join("");
  };
  const answers: OmrResolvedAnswers = { sbd: digits("SBD"), variantCode: digits("VARIANT"), mc: {}, tf: {}, sa: {} };
  for (const g of t.groups) {
    const val = byKey.get(g.key)?.value ?? null;
    if (g.kind === "MC") answers.mc[String(g.question)] = val;
    if (g.kind === "TF") {
      const q = String(g.question);
      answers.tf[q] ??= {};
      answers.tf[q]![g.sub as "a"] = val === null ? null : val === "T";
    }
    if (g.kind === "SA") {
      const q = String(g.question);
      answers.sa[q] = (answers.sa[q] ?? "") + (val ?? "");
    }
  }
  for (const q of Object.keys(answers.sa)) if (answers.sa[q] === "") answers.sa[q] = null;
  return answers;
}

/** Reads every bubble of a template from a flattened (canonical) sheet image. */
export function readBubbles(img: GrayImage, templateId: OmrTemplateId): OmrReadResult {
  const t = getOmrTemplate(templateId);
  const scale = img.width / OMR_CANONICAL_WIDTH;
  const readings = t.groups.map((g) => readGroup(img, g, scale));
  return summarizeReadings(templateId, readings);
}

export function summarizeReadings(templateId: OmrTemplateId, readings: BubbleGroupReading[]): OmrReadResult {
  const reviewKeys = readings.filter((r) => r.status === "FAINT" || r.status === "MULTI").map((r) => r.key);
  const answers = resolveAnswers(templateId, readings);
  const idUnreadable = (s: string | null) => s !== null && s.includes("?");
  return {
    readings,
    answers,
    needsReview: reviewKeys.length > 0 || idUnreadable(answers.sbd) || idUnreadable(answers.variantCode),
    confidence: readings.length === 0 ? 0 : Math.round(((readings.length - reviewKeys.length) / readings.length) * 1000) / 1000,
    reviewKeys,
  };
}
