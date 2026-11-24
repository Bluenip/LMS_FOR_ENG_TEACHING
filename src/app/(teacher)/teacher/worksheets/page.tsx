"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  Copy,
  Download,
  Edit3,
  FileDown,
  FileText,
  FileUp,
  Headphones,
  Plus,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
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
import type { ParsedFillBlankField } from "@/lib/worksheet/fill-blank-parser";

interface WorksheetRow {
  id: string;
  title: string;
  instructions: string | null;
  pdfFileKey: string | null;
  pageCount: number;
  isShared?: boolean;
  updatedAt: string;
  owner?: { id: string; name: string; email: string };
  _count: { fields: number; assignments: number; audios?: number };
}

export default function TeacherWorksheetsPage() {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);

  // Word auto-create modal state
  const [wordOpen, setWordOpen] = useState(false);
  const [wordTitle, setWordTitle] = useState("");
  const [wordText, setWordText] = useState("");
  const [wordPoints, setWordPoints] = useState(1);
  const [wordParsed, setWordParsed] = useState<ParsedFillBlankField[]>([]);
  const [wordSkipped, setWordSkipped] = useState(0);
  const [wordParsing, setWordParsing] = useState(false);
  const [wordCreating, setWordCreating] = useState(false);
  const wordFileInputRef = useRef<HTMLInputElement | null>(null);

  // Backup import state
  const [importingBackup, setImportingBackup] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading } = useQuery<{
    worksheets: WorksheetRow[];
    sharedWorksheets?: WorksheetRow[];
  }>({
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
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? tr("Không thể xoá Worksheet.", "Could not delete worksheet."));
    }
  };

  const handleToggleShare = async (ws: WorksheetRow) => {
    const nextShared = !ws.isShared;
    const res = await fetch(`/api/worksheets/${ws.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isShared: nextShared }),
    });
    if (res.ok) {
      toast.success(
        nextShared
          ? tr("Đã chia sẻ phiếu cho các giáo viên khác trong hệ thống!", "Shared with other teachers in the LMS!")
          : tr("Đã tắt chia sẻ — phiếu trở về chế độ riêng tư.", "Sharing turned off — worksheet is now private.")
      );
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
    } else {
      toast.error(tr("Không thể cập nhật trạng thái chia sẻ.", "Could not update sharing state."));
    }
  };

  const handleCloneShared = async (wsId: string) => {
    try {
      const res = await fetch(`/api/worksheets/${wsId}/clone`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Sao chép thất bại", "Clone failed"));
      toast.success(tr("Đã sao chép phiếu về kho của bạn!", "Cloned to your worksheet library!"));
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
      setTab("mine");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    }
  };

  const handleWordFileSelected = async (file: File) => {
    setWordParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("defaultPoints", String(wordPoints));
      const res = await fetch("/api/worksheets/parse-word", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không đọc được file Word", "Could not parse Word file"));
      setWordText(json.rawText ?? "");
      if (!wordTitle && json.suggestedTitle) setWordTitle(json.suggestedTitle);
      setWordParsed(json.fields ?? []);
      setWordSkipped((json.skippedLines ?? []).length);
      toast.success(
        tr(
          `Đã nhận diện tự động ${json.fields?.length ?? 0} câu điền từ từ file!`,
          `Auto-detected ${json.fields?.length ?? 0} fill-in-the-blank items!`
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setWordParsing(false);
    }
  };

  const handleParsePastedWordText = async (textToParse: string) => {
    if (!textToParse.trim()) {
      setWordParsed([]);
      setWordSkipped(0);
      return;
    }
    setWordParsing(true);
    try {
      const res = await fetch("/api/worksheets/parse-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToParse, defaultPoints: wordPoints }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Phân tích thất bại", "Parse failed"));
      setWordParsed(json.fields ?? []);
      setWordSkipped((json.skippedLines ?? []).length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setWordParsing(false);
    }
  };

  const handleConfirmWordCreate = async () => {
    if (wordParsed.length === 0) {
      toast.error(tr("Chưa có câu hỏi nào được nhận diện (cần dấu __đáp án__).", "No blanks detected (wrap answers in __answer__)."));
      return;
    }
    setWordCreating(true);
    try {
      const finalTitle = wordTitle.trim() || tr("Bài tập điền từ từ Word", "Fill-in-the-blank from Word");
      const createRes = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          instructions: tr("Điền từ hoặc cụm từ thích hợp vào chỗ trống.", "Fill in each blank with the correct word or phrase."),
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? tr("Không thể tạo phiếu", "Could not create worksheet"));

      const wsId = createJson.worksheet.id as string;
      const fieldsRes = await fetch(`/api/worksheets/${wsId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: wordParsed.map((f, idx) => ({
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: f.label,
            prompt: f.prompt,
            order: idx,
            points: f.points,
            answerKey: { accepted: f.accepted },
            gradingOpts: {
              caseSensitive: false,
              ignorePunctuation: true,
              ignoreExtraSpaces: true,
            },
          })),
        }),
      });
      if (!fieldsRes.ok) {
        const err = await fieldsRes.json().catch(() => ({}));
        throw new Error(err.error ?? tr("Lưu câu hỏi thất bại", "Failed to save fields"));
      }

      toast.success(
        tr(`Đã tạo phiếu "${finalTitle}" với ${wordParsed.length} ô điền từ!`, `Created "${finalTitle}" with ${wordParsed.length} blanks!`)
      );
      setWordOpen(false);
      setWordTitle("");
      setWordText("");
      setWordParsed([]);
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
      router.push(`/teacher/worksheets/${wsId}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setWordCreating(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    setImportingBackup(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/worksheets/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Nhập dữ liệu thất bại", "Import failed"));
      const count = (json.worksheets ?? []).length;
      toast.success(
        tr(`Đã nhập thành công ${count} phiếu bài tập!`, `Successfully imported ${count} worksheet(s)!`)
      );
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setImportingBackup(false);
    }
  };

  const worksheets = data?.worksheets ?? [];
  const sharedWorksheets = data?.sharedWorksheets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.worksheets.title}</h1>
          <p className="mt-0.5 text-sm text-[#464555]">
            {tr(
              "Tạo phiếu từ PDF, tự động phân câu từ file Word (.docx), gắn file nghe, chia sẻ cho giáo viên khác và sao lưu (.zip).",
              "Build PDF worksheets, auto-generate fill-in-the-blank from Word (.docx), attach audio, share with colleagues and export backups."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".zip,.json,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportBackup(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            data-testid="open-word-import-btn"
            onClick={() => setWordOpen(true)}
          >
            <Sparkles className="h-4 w-4 text-[#F97316]" />
            {tr("Tạo tự động từ Word", "Auto-create from Word")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importingBackup}
            data-testid="import-backup-btn"
            onClick={() => backupFileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 text-[#4F46E5]" />
            {importingBackup ? tr("Đang nhập…", "Importing…") : tr("Nhập Backup", "Import Backup")}
          </Button>
          {worksheets.length > 0 && (
            <Button variant="outline" size="sm" asChild data-testid="export-all-btn">
              <a href="/api/worksheets/export-all" download>
                <Archive className="h-4 w-4 text-emerald-600" />
                {tr("Sao lưu tất cả (.zip)", "Backup All (.zip)")}
              </a>
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {vi.worksheets.createWorksheet}
          </Button>
        </div>
      </div>

      {/* Tabs: My Library vs Shared by Other Teachers */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#EFF4FF] p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={cn(
            "rounded-xl px-4 py-2 text-xs font-bold transition",
            tab === "mine"
              ? "bg-white text-[#3525CD] shadow-sm"
              : "text-[#464555] hover:text-[#0B1C30]"
          )}
        >
          {tr("Kho của tôi", "My library")} ({worksheets.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("shared")}
          data-testid="shared-worksheets-tab"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition",
            tab === "shared"
              ? "bg-white text-[#3525CD] shadow-sm"
              : "text-[#464555] hover:text-[#0B1C30]"
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {tr("Giáo viên khác chia sẻ", "Shared by colleagues")} ({sharedWorksheets.length})
        </button>
      </div>

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      ) : tab === "mine" ? (
        worksheets.length === 0 ? (
          <div className="stitch-card p-12 text-center space-y-3">
            <FileText className="mx-auto h-10 w-10 text-indigo-300" />
            <p className="text-sm text-slate-500">{tr("Bạn chưa tạo Worksheet nào.", "You have not created any worksheet yet.")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setWordOpen(true)}>
                <Sparkles className="h-4 w-4 text-[#F97316]" />
                {tr("Tạo tự động từ Word (.docx)", "Auto-create from Word (.docx)")}
              </Button>
              <Button variant="accent" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {vi.worksheets.createWorksheet}
              </Button>
            </div>
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
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge variant={ws.pdfFileKey ? "default" : "neutral"}>
                        {ws.pdfFileKey ? `PDF • ${ws.pageCount} trang` : tr("Phiếu trả lời", "Answer sheet")}
                      </Badge>
                      {(ws._count.audios ?? 0) > 0 && (
                        <Badge variant="purple">
                          <Headphones className="h-3 w-3" /> {ws._count.audios}
                        </Badge>
                      )}
                      {ws.isShared && (
                        <Badge variant="mint">
                          <Share2 className="h-3 w-3" /> {tr("Đã chia sẻ", "Shared")}
                        </Badge>
                      )}
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

                <div className="space-y-2.5 border-t border-slate-100 pt-3">
                  {/* Export & Share quick bar */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <a
                      href={`/api/worksheets/${ws.id}/export?format=zip`}
                      download
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8F9FF] px-2 py-1 font-semibold text-[#3525CD] hover:bg-[#EEF2FF]"
                      title={tr("Xuất gói backup đầy đủ (.zip gồm PDF + file nghe + đáp án) để lưu trữ hoặc gửi GV khác", "Export full backup bundle (.zip with PDF + audio + answer keys)")}
                    >
                      <Download className="h-3 w-3" /> Backup .zip
                    </a>
                    <a
                      href={`/api/worksheets/${ws.id}/export?format=docx`}
                      download
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8F9FF] px-2 py-1 font-semibold text-[#464555] hover:bg-slate-100"
                      title={tr("Xuất file Word có đáp án (__đáp án__)", "Export Word .docx with answers")}
                    >
                      <FileDown className="h-3 w-3" /> Word (ĐA)
                    </a>
                    <a
                      href={`/api/worksheets/${ws.id}/export?format=docx-student`}
                      download
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8F9FF] px-2 py-1 font-semibold text-[#464555] hover:bg-slate-100"
                      title={tr("Xuất file Word bản đề cho học sinh (không kèm đáp án)", "Export student Word .docx handout")}
                    >
                      <FileDown className="h-3 w-3" /> Word (HS)
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleToggleShare(ws)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold transition",
                        ws.isShared
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200"
                      )}
                      title={tr("Bật để các giáo viên khác có thể dùng hoặc nhân bản phiếu này", "Allow other teachers in the LMS to use or clone this worksheet")}
                    >
                      <Share2 className="h-3 w-3" />
                      {ws.isShared ? tr("Đang chia sẻ", "Shared") : tr("Chia sẻ GV", "Share")}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
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
              </div>
            ))}
          </div>
        )
      ) : sharedWorksheets.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-2">
          <Users className="mx-auto h-10 w-10 text-indigo-300" />
          <p className="text-sm text-slate-500">
            {tr(
              "Chưa có phiếu nào được giáo viên khác chia sẻ. Bạn có thể bấm 'Chia sẻ GV' trên phiếu của mình hoặc dùng nút 'Nhập Backup' để nhận file .engclass.zip từ đồng nghiệp.",
              "No worksheets shared by colleagues yet. Click 'Share' on your worksheets or use 'Import Backup' to load a colleague's .engclass.zip file."
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sharedWorksheets.map((ws) => (
            <div key={ws.id} className="stitch-card-hover flex flex-col justify-between p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="mint">
                    <Users className="h-3 w-3" /> {ws.owner?.name ?? tr("Giáo viên", "Teacher")}
                  </Badge>
                  <Badge variant="neutral">{ws._count.fields} {tr("câu", "Q")}</Badge>
                </div>
                <h3 className="text-base font-bold text-[#0B1C30] line-clamp-2">{ws.title}</h3>
                {ws.instructions && (
                  <p className="text-xs text-[#464555] line-clamp-2">{ws.instructions}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => void handleCloneShared(ws.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {tr("Sao chép về kho", "Clone to library")}
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/teacher/assignments/new?worksheetId=${ws.id}`}>
                    <Send className="h-3.5 w-3.5" />
                    {tr("Giao lớp mình", "Assign directly")}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Create Blank Worksheet */}
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

      {/* Modal 2: Auto-create Fill-in-the-Blank from Word (.docx) or Pasted Text */}
      <Dialog open={wordOpen} onOpenChange={setWordOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#F97316]" />
              {tr("Tạo bài tập điền từ tự động từ Word (.docx)", "Auto-create fill-in-the-blank from Word (.docx)")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-indigo-200 bg-[#EEF2FF]/60 p-3.5 space-y-1.5 text-[#3525CD]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">
                  {tr("Quy ước trình bày trong file Word:", "Formatting convention in Word:")}
                </p>
                <a
                  href="/api/worksheets/sample-word"
                  download
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-[#3525CD] shadow-sm hover:bg-indigo-50"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  {tr("Tải file Word mẫu (.docx)", "Download sample .docx")}
                </a>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li>
                  {tr("Bọc phần cần điền trong cặp dấu gạch dưới kép:", "Wrap the blank answer in double underscores:")}{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono">
                    Câu 1: How many __planets are there in the universe__?
                  </code>
                </li>
                <li>
                  {tr("Nhiều đáp án cùng đúng thì ngăn cách bằng dấu", "Separate multiple accepted answers with")}{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono">/</code>:{" "}
                  <code className="rounded bg-white px-1 py-0.5 font-mono">
                    __has lived/&apos;s lived__
                  </code>
                </li>
                <li>
                  {tr("Hỗ trợ nhiều chỗ trống trong cùng một câu (tự tách 7a, 7b và gộp hiển thị đẹp trong Chế độ tập trung 1 câu/màn hình).", "Supports multiple blanks per sentence (automatically split into 7a, 7b and shown inline in Focus Mode).")}
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">{tr("Tên Worksheet mới", "New worksheet title")}</Label>
                <Input
                  value={wordTitle}
                  onChange={(e) => setWordTitle(e.target.value)}
                  placeholder="VD: Unit 17 - Survival tips (Bài học thuộc)"
                  data-testid="word-import-title-input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("Điểm mặc định / câu", "Default points / Q")}</Label>
                <Input
                  type="number"
                  step="0.5"
                  min={0.25}
                  max={100}
                  value={wordPoints}
                  onChange={(e) => setWordPoints(Number(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={wordFileInputRef}
                type="file"
                accept=".docx,.txt"
                className="hidden"
                data-testid="word-file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleWordFileSelected(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={wordParsing}
                onClick={() => wordFileInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                {wordParsing ? tr("Đang đọc file…", "Parsing…") : tr("Tải file Word (.docx / .txt)", "Upload Word (.docx / .txt)")}
              </Button>
              <span className="text-[11px] text-slate-400">
                {tr("hoặc dán trực tiếp nội dung vào ô bên dưới rồi bấm Phân tích", "or paste text below and click Parse")}
              </span>
            </div>

            <div className="space-y-1.5">
              <Textarea
                rows={6}
                value={wordText}
                onChange={(e) => setWordText(e.target.value)}
                data-testid="word-import-textarea"
                placeholder={"Câu 1: How many __planets are there in the universe/stars are there in the universe__?\nCâu 2: She __has lived/'s lived__ here since 2018."}
                className="font-mono text-xs"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={wordParsing || !wordText.trim()}
                  data-testid="parse-word-text-btn"
                  onClick={() => void handleParsePastedWordText(wordText)}
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#F97316]" />
                  {tr("Phân tích & Xem trước", "Parse & preview")}
                </Button>
              </div>
            </div>

            {/* Live Parsed Preview */}
            {wordParsed.length > 0 && (
              <div
                data-testid="word-import-preview"
                className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-emerald-800">
                    {tr(`Đã nhận diện ${wordParsed.length} ô điền từ`, `Detected ${wordParsed.length} blank(s)`)}
                  </p>
                  {wordSkipped > 0 && (
                    <span className="text-[11px] text-slate-500">
                      {tr(`(Bỏ qua ${wordSkipped} dòng tiêu đề/không có __)`, `(Skipped ${wordSkipped} non-blank line(s))`)}
                    </span>
                  )}
                </div>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {wordParsed.map((f, idx) => (
                    <div
                      key={`${f.label}-${idx}`}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[#0B1C30]">
                          <span className="mr-1.5 inline-block rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-bold text-[#3525CD]">
                            Câu {f.label}
                          </span>
                          {f.prompt}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-400">
                          {f.points}đ
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {f.accepted.map((ans, j) => (
                          <Badge key={j} variant="mint" className="text-[10px]">
                            {ans}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setWordOpen(false)}>
                {tr("Đóng", "Close")}
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={wordParsed.length === 0 || wordCreating}
                data-testid="confirm-word-import-btn"
                onClick={() => void handleConfirmWordCreate()}
              >
                <Sparkles className="h-4 w-4" />
                {wordCreating
                  ? tr("Đang tạo…", "Creating…")
                  : tr(`Tạo Worksheet (${wordParsed.length} ô điền)`, `Create worksheet (${wordParsed.length} blanks)`)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
