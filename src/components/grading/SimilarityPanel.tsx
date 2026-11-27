"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ScanSearch, XCircle } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { mergeRanges, type MatchedSpan } from "@/lib/plagiarism/winnowing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Status = "OPEN" | "DISMISSED" | "CONFIRMED";

interface ReportRow {
  id: string;
  fieldLabel: string;
  fieldType: string;
  studentAName: string;
  studentBName: string;
  similarity: number;
  status: Status;
}

interface ReportDetail {
  id: string;
  similarity: number;
  status: Status;
  field: { label: string; type: string; prompt: string | null };
  a: { studentName: string; text: string };
  b: { studentName: string; text: string };
  matchedSpans: MatchedSpan[];
}

function Highlighted({ text, ranges, mono }: { text: string; ranges: Array<[number, number]>; mono: boolean }) {
  const parts: Array<{ t: string; hit: boolean }> = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) parts.push({ t: text.slice(pos, s), hit: false });
    parts.push({ t: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) parts.push({ t: text.slice(pos), hit: false });
  return (
    <div className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", mono && "font-mono text-xs")}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p.hit ? <mark className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-700/60">{p.t}</mark> : p.t}
        </Fragment>
      ))}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SimilarityPanel({ assignmentId }: { assignmentId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const listKey = ["similarity", assignmentId];
  const { data, isLoading } = useQuery<{ reports: ReportRow[] }>({
    queryKey: listKey,
    queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/similarity`),
  });
  const [scanning, setScanning] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    try {
      const res = await apiFetchJson<{ pairsCompared: number; flagged: number }>(`/api/assignments/${assignmentId}/similarity/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      toast.success(
        tr(`Đã so ${res.pairsCompared} cặp bài, ${res.flagged} cặp giống cao`, `Compared ${res.pairsCompared} pairs, ${res.flagged} highly similar`)
      );
      await qc.invalidateQueries({ queryKey: listKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setScanning(false);
    }
  };

  const statusBadge = (s: Status) =>
    s === "CONFIRMED" ? (
      <Badge variant="danger">{tr("Đã xác nhận", "Confirmed")}</Badge>
    ) : s === "DISMISSED" ? (
      <Badge variant="neutral">{tr("Đã bỏ qua", "Dismissed")}</Badge>
    ) : (
      <Badge variant="orange">{tr("Chờ xem", "Open")}</Badge>
    );

  return (
    <div className="space-y-4" data-testid="similarity-panel">
      <div className="stitch-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-bold text-[#0B1C30] dark:text-slate-100">{tr("Kiểm tra tương đồng", "Similarity check")}</h2>
          <p className="text-xs text-slate-500">
            {tr(
              "So sánh chéo câu tự luận và lập trình giữa các học sinh (xử lý nội bộ, không gửi bài ra ngoài).",
              "Cross-compares essay and code answers between students (processed locally, nothing leaves the server)."
            )}
          </p>
        </div>
        <Button onClick={() => void scan()} disabled={scanning} data-testid="similarity-scan">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          {tr("Quét", "Scan")}
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
      ) : !data || data.reports.length === 0 ? (
        <div className="stitch-card p-8 text-center text-sm text-slate-500">
          {tr("Chưa có cặp bài nào giống nhau đáng kể. Bấm Quét để kiểm tra.", "No notably similar pairs. Press Scan to check.")}
        </div>
      ) : (
        <ul className="stitch-card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
          {data.reports.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                data-testid={`similarity-row-${r.id}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {r.studentAName} ↔ {r.studentBName}
                  </span>
                  <span className="text-xs text-slate-500">
                    {tr("Câu", "Q")} {r.fieldLabel} · {r.fieldType === "CODE" ? tr("Lập trình", "Code") : tr("Tự luận", "Essay")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {statusBadge(r.status)}
                  <span
                    className={cn(
                      "w-12 text-right font-mono font-bold",
                      r.similarity >= 0.7 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {pct(r.similarity)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CompareDialog
        assignmentId={assignmentId}
        reportId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => void qc.invalidateQueries({ queryKey: listKey })}
      />
    </div>
  );
}

function CompareDialog({
  assignmentId,
  reportId,
  onClose,
  onChanged,
}: {
  assignmentId: string;
  reportId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { tr } = useI18n();
  const { data } = useQuery<ReportDetail>({
    queryKey: ["similarity-detail", assignmentId, reportId],
    enabled: Boolean(reportId),
    queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/similarity/${reportId}`),
  });
  const [busy, setBusy] = useState(false);
  const rangesA = useMemo(() => mergeRanges((data?.matchedSpans ?? []).map((s) => [s.startA, s.endA])), [data]);
  const rangesB = useMemo(() => mergeRanges((data?.matchedSpans ?? []).map((s) => [s.startB, s.endB])), [data]);

  const setStatus = async (status: Status) => {
    setBusy(true);
    try {
      await apiFetchJson(`/api/assignments/${assignmentId}/similarity/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const mono = data?.field.type === "CODE";
  return (
    <Dialog open={Boolean(reportId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" data-testid="similarity-compare">
        <DialogHeader>
          <DialogTitle>
            {tr("Đối chiếu bài làm", "Side-by-side comparison")} {data ? `· ${pct(data.similarity)}` : ""}
          </DialogTitle>
          <DialogDescription>
            {tr("Đoạn tô vàng là phần trùng khớp. Kết quả chỉ để tham khảo — hãy tự đánh giá trước khi kết luận.", "Yellow = matching passages. Use as a hint and judge for yourself.")}
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { side: data.a, ranges: rangesA },
              { side: data.b, ranges: rangesB },
            ].map(({ side, ranges }, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-semibold">{side.studentName}</p>
                <Highlighted text={side.text} ranges={ranges} mono={mono} />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => void setStatus("DISMISSED")} disabled={busy || !data} data-testid="similarity-dismiss">
            <XCircle className="h-4 w-4" /> {tr("Bỏ qua", "Dismiss")}
          </Button>
          <Button variant="destructive" onClick={() => void setStatus("CONFIRMED")} disabled={busy || !data} data-testid="similarity-confirm">
            <CheckCircle2 className="h-4 w-4" /> {tr("Xác nhận sao chép", "Confirm copying")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
