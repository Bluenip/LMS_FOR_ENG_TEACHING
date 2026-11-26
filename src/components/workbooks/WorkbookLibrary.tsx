"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Grid3X3,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WorkbookItemDTO {
  id: string;
  order: number;
  worksheet: {
    id: string;
    title: string;
    subject: string;
    _count: { fields: number };
  };
}

interface WorkbookDTO {
  id: string;
  title: string;
  description: string | null;
  items: WorkbookItemDTO[];
  assignments: Array<{
    id: string;
    classId: string;
    workbookOrder: number | null;
    class: { id: string; name: string };
  }>;
}

interface SimpleWorksheet {
  id: string;
  title: string;
  _count: { fields: number };
}

interface SimpleClass {
  id: string;
  name: string;
  myRole?: "OWNER" | "CO_TEACHER" | "ASSISTANT";
}

export function WorkbookLibrary() {
  const { tr } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ workbooks: WorkbookDTO[] }>({
    queryKey: ["teacher-workbooks"],
    queryFn: () => apiFetchJson("/api/workbooks"),
  });

  const { data: wsData } = useQuery<{ worksheets: SimpleWorksheet[] }>({
    queryKey: ["teacher-worksheets"],
    queryFn: () => apiFetchJson("/api/worksheets"),
  });

  const { data: clsData } = useQuery<{ classes: SimpleClass[] }>({
    queryKey: ["teacher-classes"],
    queryFn: () => apiFetchJson("/api/classes"),
  });

  const workbooks = data?.workbooks ?? [];
  const availableWorksheets = wsData?.worksheets ?? [];
  const manageableClasses = (clsData?.classes ?? []).filter(
    (c) => !c.myRole || c.myRole === "OWNER" || c.myRole === "CO_TEACHER"
  );

  // Create / Edit dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedWsIds, setSelectedWsIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<WorkbookDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Assign dialog
  const [assignTarget, setAssignTarget] = useState<WorkbookDTO | null>(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignPrefix, setAssignPrefix] = useState("");
  const [sequentialUnlock, setSequentialUnlock] = useState(true);
  const [assignDueAt, setAssignDueAt] = useState("");
  const [assigning, setAssigning] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setSelectedWsIds([]);
    setEditorOpen(true);
  };

  const openEdit = (wb: WorkbookDTO) => {
    setEditingId(wb.id);
    setTitle(wb.title);
    setDescription(wb.description ?? "");
    setSelectedWsIds(wb.items.map((it) => it.worksheet.id));
    setEditorOpen(true);
  };

  const toggleWorksheet = (wsId: string) => {
    setSelectedWsIds((prev) =>
      prev.includes(wsId) ? prev.filter((id) => id !== wsId) : [...prev, wsId]
    );
  };

  const moveSelected = (index: number, delta: -1 | 1) => {
    setSelectedWsIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  };

  const handleSaveWorkbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const url = editingId ? `/api/workbooks/${editingId}` : "/api/workbooks";
      const method = editingId ? "PATCH" : "POST";
      await apiFetchJson(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          worksheetIds: selectedWsIds,
        }),
      });
      toast.success(editingId ? tr("Đã cập nhật Workbook!", "Workbook updated!") : tr("Đã tạo Workbook!", "Workbook created!"));
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["teacher-workbooks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lưu thất bại", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkbook = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetchJson(`/api/workbooks/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(tr("Đã xoá Workbook", "Workbook deleted"));
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["teacher-workbooks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Xoá thất bại", "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };

  const openAssign = (wb: WorkbookDTO) => {
    setAssignTarget(wb);
    setAssignClassId(manageableClasses[0]?.id ?? "");
    setAssignPrefix(wb.title);
    setSequentialUnlock(true);
    setAssignDueAt("");
  };

  const handleAssignWorkbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !assignClassId) return;
    setAssigning(true);
    try {
      await apiFetchJson(`/api/workbooks/${assignTarget.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: assignClassId,
          titlePrefix: assignPrefix.trim() || undefined,
          sequentialUnlock,
          dueAt: assignDueAt ? new Date(assignDueAt).toISOString() : null,
        }),
      });
      toast.success(tr("Đã giao toàn bộ Workbook cho lớp!", "Assigned entire workbook to class!"));
      setAssignTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["teacher-workbooks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Giao Workbook thất bại", "Assign failed"));
    } finally {
      setAssigning(false);
    }
  };

  const wsById = new Map(availableWorksheets.map((w) => [w.id, w]));

  return (
    <div className="space-y-5" data-testid="workbook-library">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Workbook (Bộ đề theo lộ trình)", "Workbooks (Multi-session packs)")}
          </h2>
          <p className="mt-0.5 text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Gom nhiều worksheet thành một lộ trình liên hoàn, tự động mở dần từng bài và xem ma trận điểm cả lớp.",
              "Group multiple worksheets into a sequence, unlock step-by-step on submit, and inspect a class score matrix."
            )}
          </p>
        </div>
        <Button onClick={openCreate} data-testid="create-workbook-btn" className="min-h-10">
          <Plus className="h-4 w-4" />
          {tr("Tạo Workbook", "Create workbook")}
        </Button>
      </div>

      {isLoading ? (
        <div className="stitch-card p-8 text-center text-sm text-slate-400">
          {tr("Đang tải danh sách Workbook…", "Loading workbooks…")}
        </div>
      ) : workbooks.length === 0 ? (
        <div className="stitch-card p-10 text-center">
          <BookMarked className="mx-auto h-10 w-10 text-indigo-300" />
          <p className="mt-3 text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
            {tr("Chưa có Workbook nào", "No workbooks yet")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {tr("Tạo Workbook để giao chuỗi bài tập theo thứ tự và theo dõi tiến độ từng học sinh.", "Create a workbook to assign a sequence of worksheets and track student progress.")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workbooks.map((wb) => {
            const uniqueClasses = Array.from(
              new Map(wb.assignments.map((a) => [a.class.id, a.class])).values()
            );
            return (
              <div
                key={wb.id}
                className="stitch-card flex flex-col justify-between gap-4 p-5"
                data-testid={`workbook-card-${wb.id}`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-[#0B1C30] dark:text-slate-100">
                        {wb.title}
                      </h3>
                      {wb.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-[#464555] dark:text-slate-400">
                          {wb.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="indigo">
                      {wb.items.length} {tr("bài", "items")}
                    </Badge>
                  </div>

                  {wb.items.length > 0 && (
                    <ol className="space-y-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs">
                      {wb.items.map((it, idx) => (
                        <li key={it.id} className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-[#0B1C30] dark:text-slate-200">
                            {idx + 1}. {it.worksheet.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {it.worksheet._count.fields} {tr("câu", "Q")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {uniqueClasses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {uniqueClasses.map((c) => (
                        <Link
                          key={c.id}
                          href={`/teacher/classes/${c.id}/workbooks/${wb.id}`}
                          data-testid={`workbook-matrix-link-${wb.id}-${c.id}`}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40 px-2.5 py-1 text-xs font-semibold text-[#3525CD] dark:text-indigo-300 hover:bg-indigo-100"
                        >
                          <Grid3X3 className="h-3.5 w-3.5" />
                          {tr("Ma trận", "Matrix")}: {c.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <Button
                    size="sm"
                    onClick={() => openAssign(wb)}
                    disabled={wb.items.length === 0}
                    data-testid={`assign-workbook-btn-${wb.id}`}
                    className="min-h-10"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {tr("Giao cho lớp", "Assign to class")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(wb)}
                    className="min-h-10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {tr("Sửa", "Edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-10 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteTarget(wb)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {tr("Xoá", "Delete")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? tr("Chỉnh sửa Workbook", "Edit workbook") : tr("Tạo Workbook mới", "Create new workbook")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveWorkbook} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Tên Workbook", "Workbook title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={2}
                placeholder={tr("VD: Lộ trình ôn thi giữa kỳ", "e.g. Midterm Review Pack")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Mô tả (tuỳ chọn)", "Description (optional)")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {selectedWsIds.length > 0 && (
              <div className="space-y-1.5">
                <Label>{tr("Thứ tự trong Workbook", "Workbook order")} ({selectedWsIds.length})</Label>
                <div className="space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
                  {selectedWsIds.map((wsId, idx) => {
                    const ws = wsById.get(wsId);
                    return (
                      <div
                        key={wsId}
                        className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/40 px-2.5 py-1.5 text-xs"
                      >
                        <span className="truncate font-semibold text-[#0B1C30] dark:text-slate-100">
                          {idx + 1}. {ws?.title ?? wsId}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={idx === 0}
                            onClick={() => moveSelected(idx, -1)}
                            className="h-8 w-8 p-0"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={idx === selectedWsIds.length - 1}
                            onClick={() => moveSelected(idx, 1)}
                            className="h-8 w-8 p-0"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{tr("Chọn phiếu bài tập", "Select worksheets")}</Label>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2">
                {availableWorksheets.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    {tr("Chưa có phiếu bài tập nào.", "No worksheets available.")}
                  </p>
                ) : (
                  availableWorksheets.map((ws) => {
                    const checked = selectedWsIds.includes(ws.id);
                    return (
                      <label
                        key={ws.id}
                        className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleWorksheet(ws.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="truncate font-medium text-[#0B1C30] dark:text-slate-100">
                            {ws.title}
                          </span>
                        </span>
                        <span className="shrink-0 text-slate-400">
                          {ws._count.fields} {tr("câu", "Q")}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={saving || !title.trim()}>
                {saving ? tr("Đang lưu…", "Saving…") : tr("Lưu Workbook", "Save workbook")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign to Class Dialog */}
      <Dialog open={Boolean(assignTarget)} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Giao Workbook cho lớp", "Assign workbook to class")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignWorkbook} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Lớp học", "Class")}</Label>
              <select
                value={assignClassId}
                onChange={(e) => setAssignClassId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                required
              >
                {manageableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Tiền tố tên bài", "Title prefix")}</Label>
              <Input
                value={assignPrefix}
                onChange={(e) => setAssignPrefix(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 p-3">
              <div>
                <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
                  {tr("Mở dần tuần tự", "Sequential unlock")}
                </p>
                <p className="text-xs text-[#464555] dark:text-slate-400">
                  {tr("Học sinh phải nộp bài trước mới mở được bài kế tiếp", "Students must submit each step before unlocking the next")}
                </p>
              </div>
              <Switch checked={sequentialUnlock} onCheckedChange={setSequentialUnlock} />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Hạn nộp chung (tuỳ chọn)", "Due date (optional)")}</Label>
              <Input
                type="datetime-local"
                value={assignDueAt}
                onChange={(e) => setAssignDueAt(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignTarget(null)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={assigning || !assignClassId}>
                {assigning ? tr("Đang giao…", "Assigning…") : tr("Giao bài", "Assign")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Xoá Workbook?", "Delete workbook?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#464555] dark:text-slate-300">
            {tr(
              `Bạn chắc chắn muốn xoá "${deleteTarget?.title ?? ""}"? Các bài đã giao cho lớp vẫn được giữ nguyên.`,
              `Delete "${deleteTarget?.title ?? ""}"? Existing class assignments will remain intact.`
            )}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleDeleteWorkbook}
            >
              {deleting ? tr("Đang xoá…", "Deleting…") : tr("Xoá", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
