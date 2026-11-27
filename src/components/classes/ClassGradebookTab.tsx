"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import {
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Archive,
  Lock,
  LockOpen,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClassGradebookDTO {
  class: { id: string; name: string; teacherName: string; gradebookLockedAt?: string | null };
  range: { from: string | null; to: string | null };
  onlineColumns: Array<{
    id: string;
    title: string;
    date: string;
    maxScore: number;
    weight: number;
    isQuickTextbook: boolean;
    classAvg10: number | null;
  }>;
  offlineColumns: Array<{
    id: string;
    title: string;
    date: string;
    maxScore: number;
    weight: number;
    note: string | null;
    classAvg10: number | null;
  }>;
  rows: Array<{
    student: { id: string; name: string; email: string };
    onlineCells: Record<
      string,
      {
        score: number | null;
        maxScore: number;
        score10: number | null;
        status: "GRADED" | "SUBMITTED" | "MISSING" | "NOT_TARGETED";
      }
    >;
    offlineCells: Record<
      string,
      {
        score: number | null;
        maxScore: number;
        score10: number | null;
        note: string | null;
      }
    >;
    submittedOnlineCount: number;
    totalOnlineCount: number;
    submissionRatePct: number;
    weightedAvg10: number | null;
    behaviorTotal?: number;
    attendance?: {
      presentCount: number;
      lateCount: number;
      excusedCount: number;
      absentCount: number;
      totalMarked: number;
      attendanceRatePct: number | null;
    };
  }>;
  classSummary: {
    studentCount: number;
    classAvg10: number | null;
    avgSubmissionRatePct: number;
    avgAttendanceRatePct?: number | null;
    sessionCount?: number;
  };
}

interface ImportPreviewResult {
  columnId: string;
  columnTitle: string;
  maxScore: number;
  totalRows: number;
  matched: Array<{
    rowNumber: number;
    studentId: string;
    studentName: string;
    studentEmail: string;
    score: number;
    note: string | null;
  }>;
  errors: Array<{ rowNumber: number; identifier: string; reason: string }>;
  savedCount: number;
}

function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ClassGradebookTab({
  classId,
  canManageColumns,
  from,
  to,
  onRangeChange,
  onOpenStudentProgress,
}: {
  classId: string;
  canManageColumns: boolean;
  from: string;
  to: string;
  onRangeChange: (next: { from: string; to: string }) => void;
  onOpenStudentProgress: (student: { id: string; name: string }) => void;
}) {
  const { tr } = useI18n();
  const queryClient = useQueryClient();

  const qs = new URLSearchParams({ format: "json" });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const { data: gradebook, isLoading } = useQuery<ClassGradebookDTO>({
    queryKey: ["class-gradebook", classId, from, to],
    queryFn: () =>
      apiFetchJson<ClassGradebookDTO>(
        `/api/classes/${classId}/gradebook?${qs.toString()}`,
        undefined,
        tr("Không tải được sổ điểm", "Could not load gradebook")
      ),
  });

  const toggleLock = async () => {
    const lock = !gradebook?.class.gradebookLockedAt;
    try {
      await apiFetchJson(`/api/classes/${classId}/gradebook/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock }),
      });
      toast.success(lock ? tr("Đã khoá sổ điểm cuối kỳ", "Gradebook locked") : tr("Đã mở khoá sổ điểm", "Gradebook unlocked"));
      await queryClient.invalidateQueries({ queryKey: ["class-gradebook", classId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  // Draft offline score edits keyed by `${columnId}::${studentId}`
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [savingScores, setSavingScores] = useState(false);

  // Create / Edit offline column modal
  const [colDialogOpen, setColDialogOpen] = useState(false);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [colTitle, setColTitle] = useState("");
  const [colDate, setColDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [colMaxScore, setColMaxScore] = useState("10");
  const [colWeight, setColWeight] = useState("1");
  const [colNote, setColNote] = useState("");
  const [savingCol, setSavingCol] = useState(false);

  // Delete confirmation modal (Radix Dialog only — never window.confirm)
  const [deletingCol, setDeletingCol] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import Excel modal
  const [importCol, setImportCol] = useState<{ id: string; title: string } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importing, setImporting] = useState(false);

  const invalidateGradebook = async () => {
    await queryClient.invalidateQueries({ queryKey: ["class-gradebook", classId] });
    await queryClient.invalidateQueries({ queryKey: ["student-gradebook-detail", classId] });
  };

  const dirtyKeys = Object.keys(draftScores);

  const handleSaveInlineScores = async () => {
    if (dirtyKeys.length === 0 || !gradebook) return;
    setSavingScores(true);
    try {
      const byCol = new Map<string, Array<{ studentId: string; score: number | null }>>();
      for (const k of dirtyKeys) {
        const [columnId, studentId] = k.split("::");
        if (!columnId || !studentId) continue;
        const raw = draftScores[k]?.trim() ?? "";
        const score = raw === "" ? null : Number(raw.replace(",", "."));
        if (score !== null && !Number.isFinite(score)) {
          throw new Error(tr("Vui lòng nhập số điểm hợp lệ.", "Please enter valid numeric scores."));
        }
        const list = byCol.get(columnId) ?? [];
        list.push({ studentId, score });
        byCol.set(columnId, list);
      }

      for (const [columnId, entries] of byCol.entries()) {
        const res = await fetch(
          `/api/classes/${classId}/offline-grades/${columnId}/entries`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries }),
          }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? tr("Lưu điểm thất bại", "Saving scores failed"));
      }
      toast.success(tr("Đã lưu điểm kiểm tra trên giấy!", "Offline grades saved!"));
      setDraftScores({});
      await invalidateGradebook();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lưu điểm thất bại", "Saving scores failed"));
    } finally {
      setSavingScores(false);
    }
  };

  const openCreateColDialog = () => {
    setEditingColId(null);
    setColTitle("");
    setColDate(new Date().toISOString().slice(0, 10));
    setColMaxScore("10");
    setColWeight("1");
    setColNote("");
    setColDialogOpen(true);
  };

  const openEditColDialog = (col: ClassGradebookDTO["offlineColumns"][number]) => {
    setEditingColId(col.id);
    setColTitle(col.title);
    setColDate(toDateInput(col.date));
    setColMaxScore(String(col.maxScore));
    setColWeight(String(col.weight));
    setColNote(col.note ?? "");
    setColDialogOpen(true);
  };

  const handleSaveColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colTitle.trim()) return;
    setSavingCol(true);
    try {
      const payload = {
        title: colTitle.trim(),
        date: colDate || undefined,
        maxScore: Number(colMaxScore) || 10,
        weight: Number(colWeight) || 1,
        note: colNote.trim() || null,
      };
      const url = editingColId
        ? `/api/classes/${classId}/offline-grades/${editingColId}`
        : `/api/classes/${classId}/offline-grades`;
      const res = await fetch(url, {
        method: editingColId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Lưu cột điểm thất bại", "Failed to save column"));
      toast.success(
        editingColId
          ? tr("Đã cập nhật cột điểm giấy!", "Paper grade column updated!")
          : tr("Đã thêm cột điểm giấy!", "Paper grade column added!")
      );
      setColDialogOpen(false);
      await invalidateGradebook();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lưu cột điểm thất bại", "Failed to save column"));
    } finally {
      setSavingCol(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deletingCol) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/classes/${classId}/offline-grades/${deletingCol.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Xoá cột điểm thất bại", "Delete failed"));
      toast.success(tr("Đã xoá cột điểm giấy!", "Column deleted!"));
      setDeletingCol(null);
      await invalidateGradebook();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Xoá cột điểm thất bại", "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };

  const handleImportUpload = async (file: File, commit: boolean) => {
    if (!importCol) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (!commit) fd.set("preview", "true");
      const res = await fetch(
        `/api/classes/${classId}/offline-grades/${importCol.id}/import${commit ? "" : "?preview=1"}`,
        { method: "POST", body: fd }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Import thất bại", "Import failed"));
      if (commit) {
        toast.success(
          tr(`Đã nhập ${json.savedCount} điểm từ Excel!`, `Imported ${json.savedCount} scores from Excel!`)
        );
        setImportCol(null);
        setImportFile(null);
        setImportPreview(null);
        await invalidateGradebook();
      } else {
        setImportPreview(json as ImportPreviewResult);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Import thất bại", "Import failed"));
    } finally {
      setImporting(false);
    }
  };

  const exportQs = new URLSearchParams({ format: "xlsx" });
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="stitch-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor="gb-from" className="text-slate-500">
              {tr("Từ:", "From:")}
            </Label>
            <Input
              id="gb-from"
              type="date"
              value={from}
              onChange={(e) => onRangeChange({ from: e.target.value, to })}
              className="h-10 w-36 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor="gb-to" className="text-slate-500">
              {tr("Đến:", "To:")}
            </Label>
            <Input
              id="gb-to"
              type="date"
              value={to}
              onChange={(e) => onRangeChange({ from, to: e.target.value })}
              className="h-10 w-36 text-xs"
            />
          </div>
          {(from || to) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-10"
              onClick={() => onRangeChange({ from: "", to: "" })}
            >
              {tr("Xoá lọc", "Clear")}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirtyKeys.length > 0 && (
            <Button
              type="button"
              variant="accent"
              className="min-h-10"
              data-testid="save-offline-scores-btn"
              disabled={savingScores}
              onClick={() => void handleSaveInlineScores()}
            >
              {savingScores ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {tr(`Lưu điểm (${dirtyKeys.length})`, `Save grades (${dirtyKeys.length})`)}
            </Button>
          )}
          {canManageColumns && (
            <Button
              type="button"
              variant="secondary"
              className="min-h-10"
              data-testid="add-offline-col-btn"
              onClick={openCreateColDialog}
            >
              <Plus className="h-4 w-4 text-[#4F46E5]" />
              {tr("+ Cột điểm giấy", "+ Paper grade column")}
            </Button>
          )}
          <Button variant="outline" className="min-h-10" asChild>
            <a href={`/api/classes/${classId}/gradebook/archive-zip`} data-testid="gradebook-archive-zip">
              <Archive className="h-4 w-4 text-[#4F46E5]" />
              {tr("Gói tổng kết ZIP", "Term archive ZIP")}
            </a>
          </Button>
          {canManageColumns && (
            <Button
              type="button"
              variant={gradebook?.class.gradebookLockedAt ? "destructive" : "outline"}
              className="min-h-10"
              data-testid="gradebook-lock-btn"
              onClick={() => void toggleLock()}
            >
              {gradebook?.class.gradebookLockedAt ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {gradebook?.class.gradebookLockedAt ? tr("Mở khoá sổ (Admin)", "Unlock (admin)") : tr("Khoá sổ điểm", "Lock gradebook")}
            </Button>
          )}
          <Button variant="outline" className="min-h-10" asChild>
            <a
              href={`/api/classes/${classId}/gradebook?${exportQs.toString()}`}
              data-testid="export-gradebook-xlsx-btn"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              {tr("Xuất Sổ điểm Excel", "Export Gradebook Excel")}
            </a>
          </Button>
        </div>
      </div>

      {/* Gradebook Table */}
      <div className="stitch-card overflow-hidden">
        {isLoading || !gradebook ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("Đang tải sổ điểm…", "Loading gradebook…")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#F8F9FF] dark:bg-slate-800/80 text-[11px] font-bold text-[#464555] dark:text-slate-300">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="sticky left-0 z-10 min-w-[180px] bg-[#F8F9FF] dark:bg-slate-800 px-4 py-3">
                    {tr("Học sinh", "Student")} ({gradebook.rows.length})
                  </th>
                  {gradebook.onlineColumns.map((col) => (
                    <th key={col.id} className="min-w-[130px] px-3 py-3 text-center align-top">
                      <div className="line-clamp-2 font-bold text-[#0B1C30] dark:text-slate-100">
                        {col.title}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-normal text-slate-500">
                        <Badge variant="indigo" className="px-1.5 py-0 text-[10px]">
                          {col.isQuickTextbook ? "SGK" : "Online"}
                        </Badge>
                        <span>x{col.weight}</span>
                      </div>
                    </th>
                  ))}
                  {gradebook.offlineColumns.map((col) => (
                    <th
                      key={col.id}
                      data-testid={`offline-col-header-${col.id}`}
                      className="min-w-[155px] bg-orange-50/50 dark:bg-orange-950/20 px-3 py-3 text-center align-top"
                    >
                      <div className="line-clamp-2 font-bold text-[#0B1C30] dark:text-slate-100">
                        {col.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[10px] font-normal text-slate-500">
                        <Badge variant="orange" className="px-1.5 py-0 text-[10px]">
                          {tr("Giấy", "Paper")}
                        </Badge>
                        <span>/{col.maxScore} · x{col.weight}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          title={tr("Nhập Excel", "Import Excel")}
                          data-testid={`offline-import-btn-${col.id}`}
                          onClick={() => {
                            setImportCol({ id: col.id, title: col.title });
                            setImportFile(null);
                            setImportPreview(null);
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                        >
                          Import
                        </button>
                        {canManageColumns && (
                          <>
                            <button
                              type="button"
                              aria-label={tr("Sửa cột điểm", "Edit column")}
                              onClick={() => openEditColDialog(col)}
                              className="rounded p-1 text-slate-500 hover:text-indigo-600"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={tr("Xoá cột điểm", "Delete column")}
                              data-testid={`offline-delete-btn-${col.id}`}
                              onClick={() => setDeletingCol({ id: col.id, title: col.title })}
                              className="rounded p-1 text-slate-500 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="min-w-[95px] px-3 py-3 text-center">
                    {tr("Tỉ lệ nộp", "Submit %")}
                  </th>
                  <th
                    data-testid="gradebook-attendance-hdr"
                    className="min-w-[105px] px-3 py-3 text-center"
                  >
                    {tr("% Chuyên cần", "Attendance %")}
                  </th>
                  <th className="min-w-[80px] px-3 py-3 text-center">
                    {tr("Vắng KP", "Absent")}
                  </th>
                  <th className="min-w-[80px] px-3 py-3 text-center">
                    {tr("Sao thưởng", "Stars")}
                  </th>
                  <th className="min-w-[110px] bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-3 text-center text-[#3525CD] dark:text-indigo-300">
                    {tr("ĐTB Tổng (/10)", "Weighted Avg")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {gradebook.rows.map((row) => (
                  <tr
                    key={row.student.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5">
                      <button
                        type="button"
                        data-testid={`gradebook-student-${row.student.id}`}
                        onClick={() => onOpenStudentProgress(row.student)}
                        className="text-left font-semibold text-[#3525CD] dark:text-indigo-300 hover:underline"
                      >
                        {row.student.name}
                      </button>
                      <p className="text-[11px] text-slate-400">{row.student.email}</p>
                    </td>

                    {gradebook.onlineColumns.map((col) => {
                      const cell = row.onlineCells[col.id];
                      return (
                        <td key={col.id} className="px-3 py-2.5 text-center tabular-nums">
                          {cell?.status === "NOT_TARGETED" ? (
                            <span className="text-slate-300">—</span>
                          ) : cell?.score10 !== null && cell?.score10 !== undefined ? (
                            <span className="font-semibold text-[#0B1C30] dark:text-slate-100">
                              {cell.score10}
                            </span>
                          ) : cell?.status === "SUBMITTED" ? (
                            <Badge variant="orange">{tr("Chờ chấm", "Pending")}</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      );
                    })}

                    {gradebook.offlineColumns.map((col) => {
                      const cell = row.offlineCells[col.id];
                      const key = `${col.id}::${row.student.id}`;
                      const draftVal = draftScores[key];
                      const displayVal =
                        draftVal !== undefined
                          ? draftVal
                          : cell?.score !== null && cell?.score !== undefined
                            ? String(cell.score)
                            : "";

                      return (
                        <td
                          key={col.id}
                          className="bg-orange-50/20 dark:bg-orange-950/10 px-3 py-2 text-center"
                        >
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max={col.maxScore}
                            aria-label={`${col.title} - ${row.student.name}`}
                            data-testid={`offline-score-${col.id}-${row.student.id}`}
                            value={displayVal}
                            onChange={(e) =>
                              setDraftScores((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            placeholder="—"
                            className="h-9 w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-center text-xs font-semibold tabular-nums outline-none focus:border-[#4F46E5]"
                          />
                        </td>
                      );
                    })}

                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-600 dark:text-slate-300">
                      {row.submissionRatePct}%
                    </td>
                    <td
                      data-testid={`gradebook-att-${row.student.id}`}
                      className="px-3 py-2.5 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      {row.attendance?.attendanceRatePct !== null &&
                      row.attendance?.attendanceRatePct !== undefined
                        ? `${row.attendance.attendanceRatePct}%`
                        : "—"}
                    </td>
                    <td
                      data-testid={`gradebook-absent-${row.student.id}`}
                      className="px-3 py-2.5 text-center tabular-nums text-red-600 font-semibold"
                    >
                      {row.attendance && row.attendance.totalMarked > 0
                        ? row.attendance.absentCount
                        : "—"}
                    </td>
                    <td
                      data-testid={`gradebook-behavior-${row.student.id}`}
                      className="px-3 py-2.5 text-center tabular-nums font-semibold text-amber-600 dark:text-amber-400"
                    >
                      {row.behaviorTotal ?? 0}
                    </td>
                    <td
                      data-testid={`gradebook-avg-${row.student.id}`}
                      className="bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-2.5 text-center font-extrabold text-[#3525CD] dark:text-indigo-300 tabular-nums"
                    >
                      {row.weightedAvg10 !== null ? row.weightedAvg10 : "—"}
                    </td>
                  </tr>
                ))}

                {/* Class Summary Footer Row */}
                <tr className="bg-[#F8F9FF] dark:bg-slate-800/70 font-bold">
                  <td className="sticky left-0 z-10 bg-[#F8F9FF] dark:bg-slate-800 px-4 py-3 text-[#0B1C30] dark:text-slate-100">
                    {tr("Trung bình lớp", "Class average")}
                  </td>
                  {gradebook.onlineColumns.map((col) => (
                    <td key={col.id} className="px-3 py-3 text-center tabular-nums">
                      {col.classAvg10 ?? "—"}
                    </td>
                  ))}
                  {gradebook.offlineColumns.map((col) => (
                    <td key={col.id} className="px-3 py-3 text-center tabular-nums">
                      {col.classAvg10 !== null ? `${col.classAvg10}/10` : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center tabular-nums">
                    {gradebook.classSummary.avgSubmissionRatePct}%
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">
                    {gradebook.classSummary.avgAttendanceRatePct !== null &&
                    gradebook.classSummary.avgAttendanceRatePct !== undefined
                      ? `${gradebook.classSummary.avgAttendanceRatePct}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">—</td>
                  <td className="px-3 py-3 text-center tabular-nums">—</td>
                  <td className="px-3 py-3 text-center text-[#3525CD] dark:text-indigo-300 tabular-nums">
                    {gradebook.classSummary.classAvg10 ?? "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Offline Column Dialog */}
      <Dialog open={colDialogOpen} onOpenChange={setColDialogOpen}>
        <DialogContent data-testid="offline-col-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingColId
                ? tr("Sửa cột điểm giấy", "Edit Paper Grade Column")
                : tr("Thêm cột điểm kiểm tra trên giấy", "Add Paper Grade Column")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveColumn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="offline-col-title">{tr("Tên cột điểm", "Column title")}</Label>
              <Input
                id="offline-col-title"
                data-testid="offline-col-title-input"
                value={colTitle}
                onChange={(e) => setColTitle(e.target.value)}
                required
                placeholder={tr("VD: Kiểm tra 15 phút trên lớp", "e.g. 15-min In-class Quiz")}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="offline-col-date">{tr("Ngày kiểm tra", "Test date")}</Label>
                <Input
                  id="offline-col-date"
                  type="date"
                  value={colDate}
                  onChange={(e) => setColDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offline-col-max">{tr("Thang điểm", "Max score")}</Label>
                <Input
                  id="offline-col-max"
                  type="number"
                  min="0.5"
                  max="1000"
                  step="0.5"
                  value={colMaxScore}
                  onChange={(e) => setColMaxScore(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offline-col-weight">{tr("Hệ số", "Weight")}</Label>
                <Input
                  id="offline-col-weight"
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={colWeight}
                  onChange={(e) => setColWeight(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offline-col-note">{tr("Ghi chú (tuỳ chọn)", "Note (optional)")}</Label>
              <Input
                id="offline-col-note"
                value={colNote}
                onChange={(e) => setColNote(e.target.value)}
                placeholder={tr("VD: Đề B, chấm trên giấy", "e.g. Paper test Form B")}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-10"
                onClick={() => setColDialogOpen(false)}
              >
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button
                type="submit"
                className="min-h-10"
                data-testid="offline-col-submit-btn"
                disabled={savingCol || !colTitle.trim()}
              >
                {savingCol ? tr("Đang lưu…", "Saving…") : tr("Lưu cột điểm", "Save column")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingCol)}
        onOpenChange={(open) => !open && setDeletingCol(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá cột điểm giấy?", "Delete paper grade column?")}</DialogTitle>
            <DialogDescription>
              {tr(
                `Toàn bộ điểm đã nhập trong "${deletingCol?.title ?? ""}" sẽ bị xoá vĩnh viễn.`,
                `All entered scores in "${deletingCol?.title ?? ""}" will be permanently removed.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => setDeletingCol(null)}
            >
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-10"
              disabled={deleting}
              onClick={() => void handleDeleteColumn()}
            >
              {deleting ? tr("Đang xoá…", "Deleting…") : tr("Xoá cột điểm", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Excel Dialog */}
      <Dialog
        open={Boolean(importCol)}
        onOpenChange={(open) => {
          if (!open) {
            setImportCol(null);
            setImportFile(null);
            setImportPreview(null);
          }
        }}
      >
        <DialogContent data-testid="offline-import-dialog" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tr("Import điểm từ Excel", "Import Scores from Excel")} — {importCol?.title}
            </DialogTitle>
            <DialogDescription>
              {tr(
                "Chọn file .xlsx có cột Email (hoặc Họ tên) và Điểm. Hệ thống kiểm tra trước các dòng khớp.",
                "Upload an .xlsx file containing Email (or Full name) and Score columns."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="h-4 w-4 text-[#4F46E5]" />
              {importFile
                ? importFile.name
                : tr("Chọn file Excel (.xlsx)…", "Choose Excel (.xlsx) file…")}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                data-testid="offline-import-file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setImportFile(f);
                  if (f) void handleImportUpload(f, false);
                  e.target.value = "";
                }}
              />
            </label>

            {importing && (
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tr("Đang đọc file Excel…", "Reading Excel file…")}
              </div>
            )}

            {importPreview && (
              <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="mint">
                    {tr("Khớp:", "Matched:")} {importPreview.matched.length}
                  </Badge>
                  {importPreview.errors.length > 0 && (
                    <Badge variant="danger">
                      {tr("Lỗi:", "Errors:")} {importPreview.errors.length}
                    </Badge>
                  )}
                </div>
                {importPreview.errors.length > 0 && (
                  <ul className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-red-600">
                    {importPreview.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>
                        #{err.rowNumber} ({err.identifier}): {err.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => setImportCol(null)}
            >
              {tr("Đóng", "Close")}
            </Button>
            <Button
              type="button"
              className="min-h-10"
              data-testid="offline-import-confirm-btn"
              disabled={!importFile || importing || !importPreview || importPreview.matched.length === 0}
              onClick={() => importFile && void handleImportUpload(importFile, true)}
            >
              {tr("Xác nhận nhập điểm", "Confirm import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
