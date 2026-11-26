"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpenCheck, FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface QuickAttachmentItem {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface QuickTextbookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: Array<{ id: string; name: string }>;
  defaultClassId?: string;
  onCreated?: (assignments: Array<{ id: string; title: string; classId: string }>) => void;
}

function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QuickTextbookModal({
  open,
  onOpenChange,
  classes,
  defaultClassId,
  onCreated,
}: QuickTextbookModalProps) {
  const { tr } = useI18n();
  const [title, setTitle] = useState("");
  const [promptText, setPromptText] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(() =>
    defaultClassId ? [defaultClassId] : classes[0] ? [classes[0].id] : []
  );
  const [dueLocal, setDueLocal] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [weight, setWeight] = useState("1");
  const [attachments, setAttachments] = useState<QuickAttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedClassIds((prev) => {
      if (defaultClassId) return [defaultClassId];
      if (prev.length > 0) return prev;
      return classes[0] ? [classes[0].id] : [];
    });
  }, [open, defaultClassId, classes]);

  const toggleClass = (cid: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const applyDueDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    setDueLocal(toLocalDateTimeInput(d));
  };

  const handleUploadFile = async (file: File) => {
    const uploadClassId = selectedClassIds[0] ?? defaultClassId ?? classes[0]?.id;
    if (!uploadClassId) {
      toast.error(tr("Vui lòng chọn ít nhất 1 lớp trước khi tải tệp.", "Please select at least 1 class first."));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("classId", uploadClassId);
      fd.set("file", file);
      const res = await fetch("/api/assignments/quick/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? tr("Tải tệp thất bại", "Upload failed"));
      }
      setAttachments((prev) => [...prev, json.attachment as QuickAttachmentItem]);
      toast.success(tr("Đã đính kèm tài liệu SGK!", "Textbook attachment added!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải tệp thất bại", "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !promptText.trim() || selectedClassIds.length === 0) return;
    setSubmitting(true);
    try {
      const dueIso = dueLocal ? new Date(dueLocal).toISOString() : null;
      const res = await fetch("/api/assignments/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          classIds: selectedClassIds,
          promptText: promptText.trim(),
          dueAt: dueIso,
          maxScore: Number(maxScore) || 10,
          weight: Number(weight) || 1,
          attachmentKeys: attachments,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? tr("Giao bài nhanh thất bại", "Quick assign failed"));
      }
      toast.success(
        tr(
          `Đã giao bài SGK cho ${json.assignments.length} lớp thành công!`,
          `Assigned textbook homework to ${json.assignments.length} class(es)!`
        )
      );
      setTitle("");
      setPromptText("");
      setDueLocal("");
      setMaxScore("10");
      setWeight("1");
      setAttachments([]);
      onOpenChange(false);
      onCreated?.(json.assignments ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Giao bài nhanh thất bại", "Quick assign failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="quick-textbook-modal"
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-[#4F46E5]" />
            {tr("Giao bài nhanh theo SGK", "Quick Textbook Assignment")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "Giao nhanh bài tập trang sách giáo khoa, sách bài tập hoặc đính kèm ảnh/PDF trang đề. Học sinh chụp ảnh vở làm bài nộp trực tiếp.",
              "Quickly assign textbook or workbook pages with optional photo/PDF attachments. Students upload photos of their handwritten work."
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quick-asg-title">{tr("Tiêu đề bài tập", "Assignment title")}</Label>
            <Input
              id="quick-asg-title"
              data-testid="quick-asg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={tr("VD: SGK Trang 45 — Bài 2, 3", "e.g. Textbook Page 45 — Ex 2, 3")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{tr("Giao cho lớp", "Assign to classes")}</Label>
            <div className="flex flex-wrap gap-2">
              {classes.map((cls) => {
                const active = selectedClassIds.includes(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => toggleClass(cls.id)}
                    className={`min-h-10 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD] dark:bg-indigo-950/60 dark:text-indigo-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {cls.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-asg-prompt">
              {tr("Yêu cầu / trang sách cụ thể", "Instructions / textbook pages")}
            </Label>
            <Textarea
              id="quick-asg-prompt"
              data-testid="quick-asg-prompt"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              required
              rows={3}
              placeholder={tr(
                "VD: Làm bài 2 & 3 trang 45 SGK vào vở, viết rõ bước giải rồi chụp ảnh nộp lại.",
                "e.g. Complete exercises 2 & 3 on page 45 in your notebook and upload clear photos."
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="quick-asg-max">{tr("Điểm tối đa", "Max score")}</Label>
              <Input
                id="quick-asg-max"
                type="number"
                min="0.5"
                max="1000"
                step="0.5"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="quick-asg-weight">{tr("Hệ số sổ điểm", "Gradebook weight")}</Label>
              <Input
                id="quick-asg-weight"
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="quick-asg-due">{tr("Hạn nộp (tuỳ chọn)", "Due date (optional)")}</Label>
              <Input
                id="quick-asg-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">
              {tr("Chọn nhanh hạn:", "Quick due:")}
            </span>
            {[
              { d: 1, label: tr("+1 ngày", "+1 day") },
              { d: 3, label: tr("+3 ngày", "+3 days") },
              { d: 7, label: tr("+1 tuần", "+1 week") },
            ].map((p) => (
              <button
                key={p.d}
                type="button"
                onClick={() => applyDueDays(p.d)}
                className="min-h-8 rounded-full border border-slate-200 dark:border-slate-700 px-3 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#0B1C30] dark:text-slate-100">
                {tr("Ảnh chụp trang sách / PDF đề (tuỳ chọn)", "Textbook photo / PDF attachment (optional)")}
              </span>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 px-3 py-1.5 text-xs font-bold text-[#3525CD] dark:text-indigo-300 hover:bg-[#E2DFFF]">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? tr("Đang tải…", "Uploading…") : tr("Chọn ảnh / PDF", "Choose image / PDF")}
                <input
                  type="file"
                  data-testid="quick-asg-file-input"
                  accept="image/png,image/jpeg,image/webp,.pdf,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {attachments.map((att) => (
                  <Badge
                    key={att.key}
                    variant="indigo"
                    className="flex items-center gap-1.5 py-1 pr-1.5"
                  >
                    {att.mimeType === "application/pdf" ? (
                      <FileText className="h-3 w-3" />
                    ) : (
                      <ImageIcon className="h-3 w-3" />
                    )}
                    <Paperclip className="hidden" />
                    <span className="max-w-[160px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((a) => a.key !== att.key))
                      }
                      className="rounded p-0.5 hover:bg-indigo-200/60"
                      aria-label={tr("Gỡ tệp", "Remove file")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => onOpenChange(false)}
            >
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              type="submit"
              variant="accent"
              className="min-h-10"
              data-testid="quick-asg-submit"
              disabled={submitting || uploading || !title.trim() || !promptText.trim() || selectedClassIds.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tr("Đang giao…", "Assigning…")}
                </>
              ) : (
                tr("Giao bài ngay", "Assign now")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
