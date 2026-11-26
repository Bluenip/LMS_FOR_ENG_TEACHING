"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Trash2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface StudentOverrideInfo {
  extraAttempts: number;
  dueAt: string | null;
  timeLimitMin: number | null;
  note: string | null;
}

interface OverrideDialogProps {
  assignmentId: string;
  student: {
    studentId: string;
    studentName: string;
    studentEmail: string;
    override: StudentOverrideInfo | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OverrideDialog({
  assignmentId,
  student,
  onClose,
  onSaved,
}: OverrideDialogProps) {
  const { tr } = useI18n();
  const [extraAttempts, setExtraAttempts] = useState(0);
  const [dueAt, setDueAt] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!student) return;
    setExtraAttempts(student.override?.extraAttempts ?? 0);
    setDueAt(toLocalInput(student.override?.dueAt));
    setTimeLimitMin(
      student.override?.timeLimitMin ? String(student.override.timeLimitMin) : ""
    );
    setNote(student.override?.note ?? "");
  }, [student]);

  if (!student) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetchJson(`/api/assignments/${assignmentId}/overrides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.studentId,
          extraAttempts: Math.max(0, Math.min(50, Number(extraAttempts) || 0)),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          timeLimitMin: timeLimitMin ? Number(timeLimitMin) : null,
          note: note.trim() || null,
        }),
      });
      toast.success(
        tr(`Đã lưu ngoại lệ cho ${student.studentName}.`, `Saved exception for ${student.studentName}.`)
      );
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lưu ngoại lệ thất bại", "Could not save override"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await apiFetchJson(
        `/api/assignments/${assignmentId}/overrides?studentId=${encodeURIComponent(student.studentId)}`,
        { method: "DELETE" }
      );
      toast.success(tr("Đã xoá ngoại lệ.", "Exception removed."));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Xoá thất bại", "Delete failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="override-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#4F46E5]" />
            {tr("Ngoại lệ riêng cho học sinh", "Student exception")}
          </DialogTitle>
          <DialogDescription>
            {student.studentName} ({student.studentEmail})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ov-extra-attempts" className="text-xs">
              {tr("Cộng thêm lượt làm bài", "Extra attempts")}
            </Label>
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setExtraAttempts(n)}
                  className={
                    extraAttempts === n
                      ? "rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-bold text-white"
                      : "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0B1C30] hover:bg-slate-50"
                  }
                >
                  +{n}
                </button>
              ))}
              <Input
                id="ov-extra-attempts"
                type="number"
                min={0}
                max={50}
                value={extraAttempts}
                onChange={(e) => setExtraAttempts(Math.max(0, Number(e.target.value) || 0))}
                className="h-9 w-20 text-xs tabular-nums"
                data-testid="override-extra-attempts-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ov-due-at" className="text-xs">
                {tr("Gia hạn nộp riêng", "Personal due date")}
              </Label>
              <Input
                id="ov-due-at"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                data-testid="override-due-at-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-time-limit" className="text-xs">
                {tr("Thời gian làm riêng (phút)", "Personal time limit (min)")}
              </Label>
              <Input
                id="ov-time-limit"
                type="number"
                min={1}
                max={600}
                value={timeLimitMin}
                onChange={(e) => setTimeLimitMin(e.target.value)}
                placeholder={tr("Mặc định của bài", "Assignment default")}
                data-testid="override-time-limit-input"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ov-note" className="text-xs">
              {tr("Ghi chú lý do (tuỳ chọn)", "Reason note (optional)")}
            </Label>
            <Input
              id="ov-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr("VD: Nghỉ ốm có phép, cho làm lại 1 lượt", "e.g. Excused absence")}
            />
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
            {student.override ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="text-[#BA1A1A] hover:bg-red-50"
                data-testid="delete-override-btn"
              >
                <Trash2 className="h-4 w-4" />
                {tr("Xoá ngoại lệ", "Remove override")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={saving} data-testid="save-override-btn">
                {saving ? tr("Đang lưu…", "Saving…") : tr("Lưu ngoại lệ", "Save override")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
