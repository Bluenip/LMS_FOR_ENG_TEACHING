"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Camera, FileDown, Loader2, Table2, Trash2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDateTime } from "@/lib/utils";
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
import { OmrKeyEditor } from "./OmrKeyEditor";
import { OmrLegend, OmrScanOverlay } from "./OmrScanOverlay";
import type { OmrScanViewDTO } from "./OmrScanViewerDialog";
import { OMR_TEMPLATE_LABELS, type OmrSheetDetailDTO } from "./types";

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm";

function questionLabel(key: string, tr: (vi: string, en: string) => string) {
  const [kind, q] = key.split(":");
  if (kind === "tf") return `${tr("Đ/S", "T/F")} ${q}`;
  if (kind === "sa") return `${tr("TL", "SA")} ${q}`;
  return `${tr("Câu", "Q")} ${q}`;
}

export function OmrSheetDetail({ sheetId }: { sheetId: string }) {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const queryKey = ["omr-sheet", sheetId];
  const { data, isLoading, error } = useQuery<OmrSheetDetailDTO>({
    queryKey,
    queryFn: () => apiFetchJson(`/api/omr/sheets/${sheetId}`),
  });
  const [syncing, setSyncing] = useState(false);
  const [editScanId, setEditScanId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey });

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetchJson<{ syncedCount: number; skippedCount: number }>(`/api/omr/sheets/${sheetId}/sync-gradebook`, {
        method: "POST",
      });
      toast.success(
        tr(`Đã đẩy điểm ${res.syncedCount} học sinh vào Sổ điểm`, `Sent ${res.syncedCount} scores to the gradebook`) +
          (res.skippedCount > 0 ? ` · ${tr(`${res.skippedCount} phiếu còn cần duyệt`, `${res.skippedCount} still need review`)}` : "")
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !data) {
    return <div className="stitch-card p-6 text-center">{error instanceof Error ? error.message : "—"}</div>;
  }

  const { sheet } = data;
  const reviewCount = data.scans.filter((s) => s.needsReview || !s.studentId).length;
  const keyEmpty = Object.values(sheet.answerKeyByVariant).every(
    (k) => Object.keys(k.mc ?? {}).length + Object.keys(k.tf ?? {}).length + Object.keys(k.sa ?? {}).length === 0
  );

  return (
    <div className="space-y-5" data-testid="omr-sheet-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/teacher/classes/${sheet.classId}/omr`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-4 w-4" /> {sheet.className}
          </Link>
          <h1 className="text-2xl font-bold text-[#0B1C30] dark:text-slate-100">{sheet.title}</h1>
          <p className="text-sm text-slate-500">{tr(OMR_TEMPLATE_LABELS[sheet.template].vi, OMR_TEMPLATE_LABELS[sheet.template].en)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/omr/sheets/${sheetId}/pdf`} download>
              <FileDown className="h-4 w-4" /> {tr("Phiếu trống", "Blank sheet")}
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/omr/sheets/${sheetId}/pdf?prefill=1`} download data-testid="omr-pdf-prefill">
              <FileDown className="h-4 w-4" /> {tr("In sẵn tên HS", "Pre-filled per student")}
            </a>
          </Button>
          <Button asChild>
            <Link href={`/teacher/omr/${sheetId}/scan`} data-testid="omr-open-scanner">
              <Camera className="h-4 w-4" /> {tr("Quét phiếu", "Scan")}
            </Link>
          </Button>
        </div>
      </div>

      {keyEmpty && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {tr("Chưa có đáp án — hãy nhập đáp án để chấm.", "No answer key yet — enter it to grade.")}
        </div>
      )}

      <div className="stitch-card p-4">
        <button type="button" className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setShowKey((v) => !v)}>
          {tr("Đáp án theo mã đề", "Answer key per exam code")}
          <span className="text-sm text-slate-500">{showKey || keyEmpty ? "▲" : "▼"}</span>
        </button>
        {(showKey || keyEmpty) && (
          <div className="mt-4">
            <OmrKeyEditor sheetId={sheetId} template={sheet.template} initial={sheet.answerKeyByVariant} onSaved={refresh} />
          </div>
        )}
      </div>

      <div className="stitch-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">
            {tr("Phiếu đã quét", "Scanned sheets")} ({data.scans.length})
            {reviewCount > 0 && (
              <Badge variant="orange" className="ml-2">
                {reviewCount} {tr("cần duyệt", "to review")}
              </Badge>
            )}
          </h2>
          <Button onClick={() => void sync()} disabled={syncing || data.scans.length === 0} data-testid="omr-sync">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
            {tr("Đẩy điểm vào Sổ điểm lớp", "Send to class gradebook")}
          </Button>
        </div>
        {data.scans.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{tr("Chưa quét phiếu nào.", "No sheets scanned yet.")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.scans.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setEditScanId(s.id)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  data-testid={`omr-scan-row-${s.id}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {s.studentName ?? <span className="text-amber-600">{tr("Chưa gán học sinh", "No student")}</span>}
                    </span>
                    <span className="block text-xs text-slate-500">
                      SBD {s.detectedSbd ?? "—"} · {tr("Mã", "Code")} {s.variantCode ?? "—"} · {formatDateTime(s.createdAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {s.needsReview && <Badge variant="orange">{tr("Cần duyệt", "Review")}</Badge>}
                    {s.confirmedAt && !s.needsReview && <Badge variant="mint">{tr("Đã vào sổ", "In gradebook")}</Badge>}
                    <span className="font-mono font-bold">
                      {s.score}/{s.maxScore}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.questionStats.length > 0 && (
        <div className="stitch-card space-y-2 p-4">
          <h2 className="font-semibold">{tr("Tỉ lệ đúng từng câu", "Correct rate per question")}</h2>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {data.questionStats.map((q) => (
              <div key={q.key} className="flex items-center gap-2 text-sm">
                <span className="w-14 shrink-0 text-slate-600 dark:text-slate-300">{questionLabel(q.key, tr)}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span
                    className={cn("block h-full rounded-full", q.ratePct >= 70 ? "bg-emerald-500" : q.ratePct >= 40 ? "bg-amber-500" : "bg-rose-500")}
                    style={{ width: `${q.ratePct}%` }}
                  />
                </span>
                <span className="w-10 text-right font-mono text-xs">{q.ratePct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stitch-card p-4">
        <button type="button" className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setShowRoster((v) => !v)}>
          {tr("Số báo danh của lớp", "Class student numbers")} ({data.roster.length})
          <span className="text-sm text-slate-500">{showRoster ? "▲" : "▼"}</span>
        </button>
        {showRoster && (
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {data.roster.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800">
                <span className="truncate">{r.name}</span>
                <span className={cn("font-mono", !r.sbdUnique && "text-amber-600")}>{r.sbd}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScanEditDialog
        scanId={editScanId}
        roster={data.roster}
        locale={locale}
        onClose={() => setEditScanId(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function ScanEditDialog({
  scanId,
  roster,
  onClose,
  onChanged,
}: {
  scanId: string | null;
  roster: OmrSheetDetailDTO["roster"];
  locale: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const viewKey = ["omr-scan-view", scanId];
  const { data } = useQuery<OmrScanViewDTO>({
    queryKey: viewKey,
    enabled: Boolean(scanId),
    queryFn: () => apiFetchJson(`/api/omr/scans/${scanId}`),
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await apiFetchJson(`/api/omr/scans/${scanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await qc.invalidateQueries({ queryKey: viewKey });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiFetchJson(`/api/omr/scans/${scanId}`, { method: "DELETE" });
      setConfirmDelete(false);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const flagged = data?.readings.filter((r) => r.status === "FAINT" || r.status === "MULTI").length ?? 0;

  return (
    <>
      <Dialog open={Boolean(scanId)} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="omr-scan-edit">
          <DialogHeader>
            <DialogTitle>
              {data ? `${data.scan.studentName ?? tr("Chưa gán học sinh", "No student")} · ${data.scan.score}/${data.scan.maxScore}` : "…"}
            </DialogTitle>
            <DialogDescription>
              {flagged > 0
                ? tr(`${flagged} ô vàng cần duyệt: chạm vào ô đúng (chạm lại để bỏ trống).`, `${flagged} yellow marks to review: tap the right bubble (tap again to clear).`)
                : tr("Chạm vào bất kỳ ô nào để sửa đáp án đã đọc.", "Tap any bubble to correct the reading.")}
            </DialogDescription>
          </DialogHeader>
          {data && (
            <div className="space-y-3">
              <select
                className={SELECT_CLASS}
                value={data.scan.studentId ?? ""}
                disabled={busy}
                onChange={(e) => void patch({ studentId: e.target.value || null })}
                aria-label={tr("Học sinh", "Student")}
                data-testid="omr-edit-student"
              >
                <option value="">{tr("— Chưa gán học sinh —", "— No student —")}</option>
                {roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.sbd})
                  </option>
                ))}
              </select>
              <OmrLegend tr={tr} />
              <OmrScanOverlay
                imageUrl={data.scan.imageUrl}
                template={data.sheet.template}
                readings={data.readings}
                perQuestion={data.perQuestion}
                expected={data.expected}
                onPick={(key, value) => {
                  if (!busy) void patch({ edits: { [key]: value } });
                }}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 className="h-4 w-4" /> {tr("Xoá phiếu", "Delete")}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {tr("Đóng", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá phiếu đã quét?", "Delete this scan?")}</DialogTitle>
            <DialogDescription>{tr("Ảnh và kết quả đọc của phiếu này sẽ bị xoá.", "The photo and its reading will be removed.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {tr("Xoá", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
