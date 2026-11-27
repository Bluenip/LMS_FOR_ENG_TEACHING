import type { OmrAnswerKeyByVariant, OmrPointsConfig } from "@/lib/omr/grader";
import type { OmrTemplateId } from "@/lib/omr/templates";

export interface OmrScanRowDTO {
  id: string;
  studentId: string | null;
  studentName: string | null;
  detectedSbd: string | null;
  variantCode: string | null;
  imageUrl: string;
  score: number;
  maxScore: number;
  confidence: number;
  needsReview: boolean;
  confirmedAt: string | null;
  createdAt: string;
}

export interface OmrSheetDetailDTO {
  sheet: {
    id: string;
    classId: string;
    className: string;
    title: string;
    template: OmrTemplateId;
    answerKeyByVariant: OmrAnswerKeyByVariant;
    pointsConfig: OmrPointsConfig;
    offlineColumnId: string | null;
    createdAt: string;
  };
  roster: Array<{ id: string; name: string; sbd: string; sbdUnique: boolean }>;
  scans: OmrScanRowDTO[];
  questionStats: Array<{ key: string; correct: number; total: number; ratePct: number }>;
}

export const OMR_TEMPLATE_LABELS: Record<OmrTemplateId, { vi: string; en: string }> = {
  MC_20: { vi: "Trắc nghiệm 20 câu", en: "20 multiple-choice" },
  MC_40: { vi: "Trắc nghiệm 40 câu", en: "40 multiple-choice" },
  MC_50: { vi: "Trắc nghiệm 50 câu", en: "50 multiple-choice" },
  THPT_2025: { vi: "Mẫu THPT 2025 (12 TN + 4 Đ/S + 6 TL ngắn)", en: "THPT 2025 (12 MC + 4 T/F + 6 short)" },
};
