"use client";

import { useMemo } from "react";
import type { BubbleGroupReading } from "@/lib/omr/bubble-reader";
import type { OmrQuestionResult, OmrVariantKey } from "@/lib/omr/grader";
import {
  OMR_CANONICAL_HEIGHT,
  OMR_CANONICAL_WIDTH,
  getOmrTemplate,
  type OmrBubbleGroup,
  type OmrTemplateId,
} from "@/lib/omr/templates";

const GREEN = "#16a34a";
const RED = "#dc2626";
const YELLOW = "#eab308";
const BLUE = "#4f46e5";

/** Maps a bubble group to its graded question key ("tf:2:c" → "tf:2"). */
function questionKeyOf(g: OmrBubbleGroup): string | null {
  if (g.kind === "MC") return `mc:${g.question}`;
  if (g.kind === "TF") return `tf:${g.question}`;
  if (g.kind === "SA") return `sa:${g.question}`;
  return null;
}

function expectedValue(g: OmrBubbleGroup, key: OmrVariantKey | null | undefined): string | null {
  if (!key) return null;
  if (g.kind === "MC") return key.mc?.[String(g.question)] ?? null;
  if (g.kind === "TF") {
    const v = key.tf?.[String(g.question)]?.[g.sub as "a"];
    return v === undefined ? null : v ? "T" : "F";
  }
  if (g.kind === "SA") {
    const ans = key.sa?.[String(g.question)];
    return ans?.[Number(g.sub)] ?? null;
  }
  return null;
}

/**
 * Flattened sheet image with coloured rings: green = correct, red = wrong, yellow = needs review.
 * When `onPick` is set, tapping any bubble of a group changes that group's answer (teacher fix).
 */
export function OmrScanOverlay({
  imageUrl,
  template,
  readings,
  perQuestion,
  expected,
  reviewKeys,
  onPick,
}: {
  imageUrl: string;
  template: OmrTemplateId;
  readings: BubbleGroupReading[];
  perQuestion: OmrQuestionResult[];
  expected?: OmrVariantKey | null;
  reviewKeys?: string[];
  onPick?: (groupKey: string, value: string | null) => void;
}) {
  const t = getOmrTemplate(template);
  const byKey = useMemo(() => new Map(readings.map((r) => [r.key, r])), [readings]);
  const result = useMemo(() => new Map(perQuestion.map((q) => [q.key, q])), [perQuestion]);
  const review = useMemo(
    () => new Set(reviewKeys ?? readings.filter((r) => r.status === "FAINT" || r.status === "MULTI").map((r) => r.key)),
    [reviewKeys, readings]
  );

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700" data-testid="omr-overlay">
      {/* eslint-disable-next-line @next/next/no-img-element -- scan image served by /api/files or a local blob URL */}
      <img src={imageUrl} alt="" className="block w-full select-none" draggable={false} />
      <svg
        viewBox={`0 0 ${OMR_CANONICAL_WIDTH} ${OMR_CANONICAL_HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {t.groups.map((g) => {
          const reading = byKey.get(g.key);
          const flagged = review.has(g.key);
          const qKey = questionKeyOf(g);
          const res = qKey ? result.get(qKey) : undefined;
          const exp = expectedValue(g, expected);
          let isRight: boolean | null = null;
          if (res && reading?.value) {
            if (g.kind === "TF") isRight = Boolean(res.correctStatements?.includes(g.sub!));
            else if (g.kind === "SA") isRight = res.correct;
            else isRight = res.correct;
          }
          return (
            <g key={g.key} data-group={g.key}>
              {g.bubbles.map((b, i) => {
                const chosen = reading?.value === b.value;
                const fill = reading?.fills?.[i] ?? 0;
                let stroke: string | null = null;
                if (flagged && (chosen || fill >= 0.28)) stroke = YELLOW;
                else if (chosen) stroke = g.kind === "SBD" || g.kind === "VARIANT" ? BLUE : isRight === false ? RED : isRight ? GREEN : BLUE;
                else if (exp === b.value && isRight === false) stroke = GREEN;
                const dashed = !chosen && exp === b.value;
                return (
                  <g key={b.value}>
                    {stroke && (
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={17}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={flagged ? 5 : 4}
                        strokeDasharray={dashed && !flagged ? "6 4" : undefined}
                      />
                    )}
                    {onPick && (
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={15}
                        fill="transparent"
                        className="cursor-pointer"
                        data-testid={`omr-bubble-${g.key}-${b.value}`}
                        // a flagged group's tentative value is confirmed by tapping it; otherwise a tap toggles
                        onClick={() => onPick(g.key, chosen && !flagged ? null : b.value)}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function OmrLegend({ tr }: { tr: (vi: string, en: string) => string }) {
  const item = (color: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full border-[3px]" style={{ borderColor: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
      {item(GREEN, tr("Đúng", "Correct"))}
      {item(RED, tr("Sai", "Wrong"))}
      {item(YELLOW, tr("Tô mờ / tô 2 ô — cần duyệt", "Faint / double mark — review"))}
    </div>
  );
}
