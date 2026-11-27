"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import type { BubbleGroupReading } from "@/lib/omr/bubble-reader";
import type { OmrQuestionResult, OmrVariantKey } from "@/lib/omr/grader";
import type { OmrTemplateId } from "@/lib/omr/templates";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OmrLegend, OmrScanOverlay } from "./OmrScanOverlay";

export interface OmrScanViewDTO {
  scan: {
    id: string;
    studentId: string | null;
    studentName: string | null;
    detectedSbd: string | null;
    variantCode: string | null;
    imageUrl: string;
    score: number;
    maxScore: number;
    needsReview: boolean;
    confirmedAt: string | null;
  };
  sheet: { id: string; title: string; template: OmrTemplateId; classId: string };
  readings: BubbleGroupReading[];
  perQuestion: OmrQuestionResult[];
  expected: OmrVariantKey | null;
}

/** Read-only view of a graded paper sheet (students, parents, teachers). */
export function OmrScanViewerDialog({
  scanId,
  onOpenChange,
}: {
  scanId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { tr } = useI18n();
  const { data, isLoading, error } = useQuery<OmrScanViewDTO>({
    queryKey: ["omr-scan-view", scanId],
    enabled: Boolean(scanId),
    queryFn: () => apiFetchJson(`/api/omr/scans/${scanId}`),
  });
  return (
    <Dialog open={Boolean(scanId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="omr-viewer">
        <DialogHeader>
          <DialogTitle>{data?.sheet.title ?? tr("Phiếu tô đã chấm", "Graded answer sheet")}</DialogTitle>
          <DialogDescription>
            {data
              ? `${tr("Điểm", "Score")}: ${data.scan.score}/${data.scan.maxScore}${data.scan.studentName ? ` · ${data.scan.studentName}` : ""}`
              : " "}
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
        {error instanceof Error && <p className="text-sm text-red-600">{error.message}</p>}
        {data && (
          <div className="space-y-3">
            <OmrLegend tr={tr} />
            <OmrScanOverlay
              imageUrl={data.scan.imageUrl}
              template={data.sheet.template}
              readings={data.readings}
              perQuestion={data.perQuestion}
              expected={data.expected}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
