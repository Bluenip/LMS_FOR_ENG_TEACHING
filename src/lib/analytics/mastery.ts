export type MasteryLevel = "MASTERED" | "DEVELOPING" | "NEEDS_WORK" | "NO_DATA";

export interface TaggedAnswer {
  studentId: string;
  /** topicTag, or the skillTag when the question has no topic. */
  tag: string;
  earned: number;
  max: number;
}

export interface MasteryCell {
  tag: string;
  accuracy: number | null;
  attemptsCount: number;
  level: MasteryLevel;
}

export interface MasteryRow {
  student: { id: string; name: string };
  cells: Record<string, MasteryCell>;
}

export function masteryLevel(accuracy: number | null, attempts: number): MasteryLevel {
  if (attempts === 0 || accuracy === null) return "NO_DATA";
  if (accuracy >= 0.8) return "MASTERED";
  if (accuracy >= 0.5) return "DEVELOPING";
  return "NEEDS_WORK";
}

/**
 * Student × topic matrix: accuracy = Σ earned / Σ max points of every graded answer with that tag.
 * Tags are sorted by class-wide accuracy (weakest first) so problem topics come first.
 */
export function computeMasteryMatrix(
  students: Array<{ id: string; name: string }>,
  answers: TaggedAnswer[]
): { tags: Array<{ tag: string; classAccuracy: number | null }>; rows: MasteryRow[] } {
  const acc = new Map<string, Map<string, { earned: number; max: number; n: number }>>();
  const classAcc = new Map<string, { earned: number; max: number }>();
  for (const a of answers) {
    if (!(a.max > 0) || !Number.isFinite(a.earned)) continue;
    const earned = Math.max(0, Math.min(a.max, a.earned));
    let byTag = acc.get(a.studentId);
    if (!byTag) acc.set(a.studentId, (byTag = new Map()));
    const cell = byTag.get(a.tag) ?? { earned: 0, max: 0, n: 0 };
    cell.earned += earned;
    cell.max += a.max;
    cell.n++;
    byTag.set(a.tag, cell);
    const c = classAcc.get(a.tag) ?? { earned: 0, max: 0 };
    c.earned += earned;
    c.max += a.max;
    classAcc.set(a.tag, c);
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const tags = Array.from(classAcc.entries())
    .map(([tag, c]) => ({ tag, classAccuracy: c.max > 0 ? round(c.earned / c.max) : null }))
    .sort((x, y) => (x.classAccuracy ?? 1) - (y.classAccuracy ?? 1) || x.tag.localeCompare(y.tag));

  const rows = students.map((s) => {
    const byTag = acc.get(s.id);
    const cells: Record<string, MasteryCell> = {};
    for (const { tag } of tags) {
      const c = byTag?.get(tag);
      const accuracy = c && c.max > 0 ? round(c.earned / c.max) : null;
      cells[tag] = { tag, accuracy, attemptsCount: c?.n ?? 0, level: masteryLevel(accuracy, c?.n ?? 0) };
    }
    return { student: s, cells };
  });
  return { tags, rows };
}

/** Strengths (≥ 80 %) and topics to review (< 50 %, weakest first) for one student. */
export function summarizeStudentMastery(cells: MasteryCell[]) {
  const withData = cells.filter((c) => c.level !== "NO_DATA");
  return {
    strengths: withData.filter((c) => c.level === "MASTERED").sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0)),
    toReview: withData.filter((c) => c.level === "NEEDS_WORK").sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)),
    developing: withData.filter((c) => c.level === "DEVELOPING"),
  };
}

export const SKILL_TAGS = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING", "SPEAKING"] as const;

const SKILL_LABELS: Record<string, { vi: string; en: string }> = {
  GRAMMAR: { vi: "Kỹ năng Ngữ pháp", en: "Grammar skill" },
  VOCABULARY: { vi: "Kỹ năng Từ vựng", en: "Vocabulary skill" },
  READING: { vi: "Kỹ năng Đọc", en: "Reading skill" },
  LISTENING: { vi: "Kỹ năng Nghe", en: "Listening skill" },
  WRITING: { vi: "Kỹ năng Viết", en: "Writing skill" },
  SPEAKING: { vi: "Kỹ năng Nói", en: "Speaking skill" },
};

/**
 * Display label of a mastery tag: skill enums get an explicit "… skill" name so they never look like a
 * teacher topic of the same name (e.g. topic "Đọc hiểu" vs skill READING); topics stay as written.
 */
export function masteryTagLabel(tag: string, locale: string): { label: string; isSkill: boolean } {
  const skill = SKILL_LABELS[tag];
  return skill ? { label: locale === "en" ? skill.en : skill.vi, isSkill: true } : { label: tag, isSkill: false };
}
