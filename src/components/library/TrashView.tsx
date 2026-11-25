"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Cloud, FileText, Paperclip, RotateCcw, Search, Trash2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { cn, formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { foldText } from "@/lib/text-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TrashKind = "WORKSHEET" | "LESSON" | "LESSON_ITEM";

interface TrashEntry {
  kind: TrashKind;
  id: string;
  title: string;
  parentTitle: string | null;
  ownerName: string | null;
  deletedAt: string;
  source: "USER" | "DRIVE";
  daysLeft: number;
}

/**
 * Library › Trash: deleted worksheets, lessons and lesson materials for 30 days.
 * Restoring also restores the files from Google Drive's trash; items whose file was deleted directly
 * in Google Drive appear here too (marked "Deleted in Google Drive").
 */
export function TrashView({ isAdmin }: { isAdmin: boolean }) {
  const { tr, locale } = useI18n();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TrashEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["library-trash"],
    queryFn: () =>
      apiFetchJson<{ items: TrashEntry[]; retentionDays: number }>(
        "/api/trash",
        undefined,
        tr("Không tải được thùng rác", "Could not load the trash")
      ),
  });

  const items = useMemo(() => {
    const needle = foldText(query.trim());
    return (data?.items ?? []).filter(
      (i) => !needle || foldText(`${i.title} ${i.parentTitle ?? ""} ${i.ownerName ?? ""}`).includes(needle)
    );
  }, [data, query]);

  const kindLabel = (k: TrashKind) =>
    k === "WORKSHEET" ? tr("Worksheet", "Worksheet") : k === "LESSON" ? tr("Bài giảng", "Lesson") : tr("Tài liệu bài giảng", "Lesson material");
  const kindIcon = (k: TrashKind) =>
    k === "WORKSHEET" ? <FileText className="h-4 w-4" /> : k === "LESSON" ? <BookOpen className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />;

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library-trash"] }),
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] }),
      queryClient.invalidateQueries({ queryKey: ["lesson-library"] }),
    ]);
  };

  const restore = async (item: TrashEntry) => {
    setBusy(item.id);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không khôi phục được", "Could not restore"));
      if (json.missingFiles > 0) {
        toast.warning(
          tr(
            `Đã khôi phục “${item.title}”, nhưng ${json.missingFiles} file đã bị xoá hẳn khỏi Google Drive.`,
            `Restored “${item.title}”, but ${json.missingFiles} file(s) were permanently deleted from Google Drive.`
          )
        );
      } else {
        toast.success(tr(`Đã khôi phục “${item.title}”.`, `Restored “${item.title}”.`));
      }
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Có lỗi xảy ra", "Something went wrong"));
    } finally {
      setBusy(null);
    }
  };

  const deleteForever = async () => {
    if (!confirming) return;
    const item = confirming;
    setBusy(item.id);
    try {
      const res = await fetch("/api/trash", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không xoá được", "Could not delete"));
      toast.success(tr("Đã xoá vĩnh viễn.", "Deleted forever."));
      setConfirming(null);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Có lỗi xảy ra", "Something went wrong"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#464555]">
        {tr(
          `Mục đã xoá được giữ ${data?.retentionDays ?? 30} ngày rồi tự xoá hẳn. File trên Google Drive nằm trong thùng rác Drive và được khôi phục cùng lúc. File bị xoá trực tiếp trên Drive cũng hiện ở đây.`,
          `Deleted items are kept for ${data?.retentionDays ?? 30} days, then removed for good. Their Google Drive files sit in Drive's trash and are restored together. Files deleted directly in Drive show up here too.`
        )}
      </p>

      {(data?.items.length ?? 0) > 0 && (
        <label className="relative block">
          <span className="sr-only">{tr("Tìm trong thùng rác", "Search the trash")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Tìm theo tên…", "Search by name…")}
            className="h-10 pl-9"
          />
        </label>
      )}

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">{tr("Đang tải…", "Loading…")}</div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="stitch-card space-y-2 p-12 text-center">
          <Trash2 className="mx-auto h-10 w-10 text-indigo-300" />
          <p className="text-sm text-slate-500">{tr("Thùng rác trống.", "The trash is empty.")}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="stitch-card p-10 text-center text-sm text-slate-500">
          {tr("Không có mục nào khớp từ khoá.", "Nothing matches your search.")}
        </div>
      ) : (
        <ul className="stitch-card divide-y divide-slate-100" data-testid="trash-list">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                  {kindIcon(item.kind)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0B1C30]">{item.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#464555]">
                    <span>{kindLabel(item.kind)}</span>
                    {item.parentTitle && <span>· {item.parentTitle}</span>}
                    {isAdmin && item.ownerName && <span>· {item.ownerName}</span>}
                    <span>· {tr("Xoá lúc", "Deleted")} {formatDateTime(item.deletedAt, locale)}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.source === "DRIVE" && (
                      <Badge variant="orange">
                        <Cloud className="h-3 w-3" /> {tr("Bị xoá trên Google Drive", "Deleted in Google Drive")}
                      </Badge>
                    )}
                    <Badge variant={item.daysLeft <= 3 ? "danger" : "neutral"}>
                      {tr(`Còn ${item.daysLeft} ngày`, `${item.daysLeft} day(s) left`)}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2 sm:justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("min-h-10 flex-1 sm:flex-none")}
                  disabled={busy === item.id}
                  onClick={() => void restore(item)}
                  data-testid={`trash-restore-${item.id}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  {tr("Khôi phục", "Restore")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-10 flex-1 text-[#BA1A1A] sm:flex-none"
                  disabled={busy === item.id}
                  onClick={() => setConfirming(item)}
                >
                  <Trash2 className="h-4 w-4" />
                  {tr("Xoá vĩnh viễn", "Delete forever")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(confirming)} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá vĩnh viễn?", "Delete forever?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#464555]">
            {tr(
              `“${confirming?.title ?? ""}” sẽ bị xoá khỏi Pivora và không khôi phục được nữa. File trên Google Drive vẫn nằm trong thùng rác Drive tới khi Drive tự dọn.`,
              `“${confirming?.title ?? ""}” will be removed from Pivora and cannot be restored. Its Google Drive files stay in Drive's trash until Drive empties it.`
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button variant="destructive" disabled={busy !== null} onClick={() => void deleteForever()}>
              {tr("Xoá vĩnh viễn", "Delete forever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
