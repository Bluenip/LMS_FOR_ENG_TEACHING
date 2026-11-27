"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { OmrScanViewerDialog } from "./OmrScanViewerDialog";

interface MyScan {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  confirmedAt: string;
}

/** Student view: graded paper answer sheets of one class (opens ?omrScan=<id> from notifications). */
export function MyOmrScansCard({ classId }: { classId: string }) {
  const { tr } = useI18n();
  const searchParams = useSearchParams();
  const [viewId, setViewId] = useState<string | null>(null);
  const { data } = useQuery<{ scans: MyScan[] }>({
    queryKey: ["my-omr-scans", classId],
    queryFn: () => apiFetchJson(`/api/omr/my-scans?classId=${encodeURIComponent(classId)}`),
  });

  useEffect(() => {
    const id = searchParams.get("omrScan");
    if (id) setViewId(id);
  }, [searchParams]);

  if (!data || data.scans.length === 0) return <OmrScanViewerDialog scanId={viewId} onOpenChange={(o) => !o && setViewId(null)} />;

  return (
    <div className="stitch-card space-y-2 p-4" data-testid="my-omr-scans">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
        <ScanLine className="h-4 w-4 text-[#4F46E5]" /> {tr("Bài kiểm tra trên giấy", "Paper tests")}
      </h3>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.scans.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setViewId(s.id)}
              className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-left text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.title}</span>
                <span className="text-xs text-slate-500">{formatDateTime(s.confirmedAt)}</span>
              </span>
              <span className="shrink-0 font-mono font-bold text-[#3525CD] dark:text-indigo-300">
                {s.score}/{s.maxScore}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <OmrScanViewerDialog scanId={viewId} onOpenChange={(o) => !o && setViewId(null)} />
    </div>
  );
}
