import type { ScoreScale } from "@prisma/client";

export interface ScaledScoreResult {
  scale: ScoreScale;
  value: number;
  max: number;
  formatted: string;
  shortLabel: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const IELTS_BAND_TABLE: Array<{ minRatio: number; band: number }> = [
  { minRatio: 0.95, band: 9.0 },
  { minRatio: 0.88, band: 8.5 },
  { minRatio: 0.80, band: 8.0 },
  { minRatio: 0.73, band: 7.5 },
  { minRatio: 0.65, band: 7.0 },
  { minRatio: 0.58, band: 6.5 },
  { minRatio: 0.50, band: 6.0 },
  { minRatio: 0.43, band: 5.5 },
  { minRatio: 0.35, band: 5.0 },
  { minRatio: 0.28, band: 4.5 },
  { minRatio: 0.20, band: 4.0 },
  { minRatio: 0.13, band: 3.5 },
  { minRatio: 0.08, band: 3.0 },
];

export function convertScoreToScale(
  score: number,
  maxScore: number,
  scale: ScoreScale = "SCALE_10"
): ScaledScoreResult {
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0;
  const clampedScore = Number.isFinite(score) ? Math.max(0, score) : 0;
  const ratio = safeMax > 0 ? Math.min(1.5, clampedScore / safeMax) : 0;

  switch (scale) {
    case "SCALE_100": {
      const value = round1(ratio * 100);
      return {
        scale,
        value,
        max: 100,
        formatted: `${value}/100`,
        shortLabel: `${value}`,
      };
    }
    case "IELTS": {
      let band = 0;
      if (ratio > 0) {
        const hit = IELTS_BAND_TABLE.find((row) => ratio >= row.minRatio);
        band = hit ? hit.band : 2.5;
      }
      return {
        scale,
        value: band,
        max: 9,
        formatted: `Band ${band.toFixed(1)}`,
        shortLabel: band.toFixed(1),
      };
    }
    case "RAW": {
      const value = round2(clampedScore);
      const max = round2(safeMax);
      return {
        scale,
        value,
        max,
        formatted: `${value}/${max}`,
        shortLabel: `${value}`,
      };
    }
    case "SCALE_10":
    default: {
      const value = round2(ratio * 10);
      return {
        scale: "SCALE_10",
        value,
        max: 10,
        formatted: `${value}/10`,
        shortLabel: `${value}`,
      };
    }
  }
}

export function scoreScaleLabel(scale: ScoreScale, tr: (viText: string, enText: string) => string): string {
  switch (scale) {
    case "SCALE_100":
      return tr("Thang 100", "Scale 100");
    case "IELTS":
      return tr("Thang IELTS (0–9.0)", "IELTS Band (0–9.0)");
    case "RAW":
      return tr("Điểm gốc", "Raw points");
    case "SCALE_10":
    default:
      return tr("Thang 10", "Scale 10");
  }
}
