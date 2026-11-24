"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit3, FileText, Plus, Send, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WorksheetRow {
  id: string;
  title: string;
  instructions: string | null;
  pdfFileKey: string | null;
  pageCount: number;
  updatedAt: string;
  _count: { fields: number; assignments: number };
}

export default function TeacherWorksheetsPage() {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery<{ worksheets: WorksheetRow[] }>({
    queryKey: ["teacher-worksheets"],
    queryFn: async () => {
      const res = await fetch("/api/worksheets");
      if (!res.ok) throw new Error(tr("Không thể tải danh sách worksheet", "Could not load worksheets"));
      return res.json();
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, instructions: instructions || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tạo thất bại", "Creation failed"));
      setOpen(false);
      setTitle("");
      setInstructions("");
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
      router.push(`/teacher/worksheets/${json.worksheet.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/worksheets/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(tr("Đã xoá Worksheet.", "Worksheet deleted."));
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
    }
  };

  const worksheets = data?.worksheets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.worksheets.title}</h1>
          <p className="mt-0.5 text-sm text-[#464555]">
            {tr("Tải đề PDF, đặt ô điền tương tác (Overlay) hoặc tạo phiếu trả lời trắc nghiệm nhanh.", "Upload a PDF test, place interactive boxes (overlay) or build a quick multiple-choice answer sheet.")}
          </p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {vi.worksheets.createWorksheet}
        </Button>
      </div>

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      ) : worksheets.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-3">
          <FileText className="mx-auto h-10 w-10 text-indigo-300" />
          <p className="text-sm text-slate-500">{tr("Bạn chưa tạo Worksheet nào.", "You have not created any worksheet yet.")}</p>
          <Button variant="accent" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {vi.worksheets.createWorksheet}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {worksheets.map((ws) => (
            <div key={ws.id} className="stitch-card-hover flex flex-col justify-between p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="flex gap-1.5">
                    <Badge variant={ws.pdfFileKey ? "default" : "neutral"}>
                      {ws.pdfFileKey ? `PDF • ${ws.pageCount} trang` : tr("Chỉ phiếu trả lời", "Answer sheet only")}
                    </Badge>
                  </div>
                </div>
                <h3 className="text-base font-bold text-[#0B1C30] line-clamp-2">{ws.title}</h3>
                {ws.instructions && (
                  <p className="text-xs text-[#464555] line-clamp-2">{ws.instructions}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{ws._count.fields} {tr("câu hỏi", "questions")}</span>
                  <span>•</span>
                  <span>{tr("Đã giao", "Assigned")} {ws._count.assignments} {tr("lần", "times")}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {tr("Cập nhật:", "Updated:")} {formatDateTime(ws.updatedAt)}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div className="flex gap-2">
                  <Button size="sm" asChild>
                    <Link href={`/teacher/worksheets/${ws.id}/edit`}>
                      <Edit3 className="h-3.5 w-3.5" />
                      {tr("Biên tập", "Edit")}
                    </Link>
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/teacher/assignments/new?worksheetId=${ws.id}`}>
                      <Send className="h-3.5 w-3.5" />
                      {tr("Giao bài", "Assign")}
                    </Link>
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(ws.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title={tr("Xoá worksheet", "Delete worksheet")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.worksheets.createWorksheet}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{vi.worksheets.worksheetTitle}</Label>
              <Input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Unit 8 Grammar Worksheet"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{vi.worksheets.instructions}</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={tr("Hướng dẫn làm bài cho học sinh…", "Instructions for students…")}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" disabled={creating}>
                {tr("Tạo & Mở Editor", "Create & open editor")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
