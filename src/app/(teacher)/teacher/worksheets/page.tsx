"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Archive,
  Cloud,
  Copy,
  Download,
  Edit3,
  FileDown,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  Globe,
  Headphones,
  Layers,
  Plus,
  Search,
  Send,
  Radio,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { foldText } from "@/lib/text-search";
import { useI18n } from "@/lib/i18n/client";
import { LessonLibrary } from "@/components/lessons/LessonLibrary";
import { WorkbookLibrary } from "@/components/workbooks/WorkbookLibrary";
import { FlashcardDeckManager } from "@/components/flashcards/FlashcardDeckManager";
import { TrashView } from "@/components/library/TrashView";
import type { DriveStatusPayload } from "@/server/driveService";
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
import type { WorksheetSubject } from "@prisma/client";
import type { ParsedFillBlankField } from "@/lib/worksheet/fill-blank-parser";
import type { ParsedWordExamField } from "@/lib/worksheet/word-exam-parser";
import { getSubjectMeta, WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { PromptText } from "@/components/worksheet/PromptText";
import { StartLiveQuizDialog } from "@/components/live-quiz/StartLiveQuizDialog";
import { SubjectBadge, SubjectPicker } from "@/components/worksheet/SubjectPicker";

interface WorksheetRow {
  id: string;
  title: string;
  subject?: WorksheetSubject;
  instructions: string | null;
  pdfFileKey: string | null;
  pageCount: number;
  isShared?: boolean;
  isPublic?: boolean;
  publicLevel?: string | null;
  folderId?: string | null;
  tags?: string[];
  lastDriveBackupAt?: string | null;
  updatedAt: string;
  owner?: { id: string; name: string; email: string };
  _count: { fields: number; assignments: number; audios?: number; driveFiles?: number };
}

interface FolderItem {
  id: string;
  parentId: string | null;
  kind: string;
  name: string;
  color: string | null;
  worksheetCount: number;
}

interface FolderTreeNode extends FolderItem {
  children: FolderTreeNode[];
}

function collectFolderSubtreeIds(folders: FolderItem[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        added = true;
      }
    }
  }
  return result;
}

type WorksheetSort = "updated_desc" | "updated_asc" | "title" | "most_assigned" | "most_questions";


/** Client-side search + subject filter + folder filter + sort for the worksheet library. */
function filterAndSortWorksheets(
  rows: WorksheetRow[],
  query: string,
  sort: WorksheetSort,
  subjectFilter: "ALL" | WorksheetSubject,
  folderFilter?: string,
  subtreeIds?: Set<string> | null
): WorksheetRow[] {
  const needle = foldText(query.trim());
  const bySubject =
    subjectFilter === "ALL"
      ? rows
      : rows.filter((ws) => (ws.subject ?? "GENERAL") === subjectFilter);
  const byFolder =
    !folderFilter || folderFilter === "ALL"
      ? bySubject
      : folderFilter === "UNFILED"
        ? bySubject.filter((ws) => !ws.folderId)
        : bySubject.filter((ws) => Boolean(ws.folderId && subtreeIds?.has(ws.folderId)));
  const out = needle
    ? byFolder.filter((ws) =>
        foldText(
          `${ws.title} ${ws.instructions ?? ""} ${ws.owner?.name ?? ""} ${(ws.tags ?? []).join(" ")}`
        ).includes(needle)
      )
    : [...byFolder];
  const time = (ws: WorksheetRow) => new Date(ws.updatedAt).getTime();
  out.sort((a, b) => {
    switch (sort) {
      case "updated_asc":
        return time(a) - time(b);
      case "title":
        return a.title.localeCompare(b.title, "vi", { numeric: true });
      case "most_assigned":
        return b._count.assignments - a._count.assignments || time(b) - time(a);
      case "most_questions":
        return b._count.fields - a._count.fields || time(b) - time(a);
      default:
        return time(b) - time(a);
    }
  });
  return out;
}

export default function TeacherWorksheetsPage() {
  const { m: vi, tr, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [liveWs, setLiveWs] = useState<{ id: string; title: string } | null>(null);
  // Library tab lives in the URL (?tab=lessons|workbooks|flashcards|trash) so links from class pages open it directly
  const [libraryTab, setLibraryTab] = useState<"worksheets" | "workbooks" | "lessons" | "flashcards" | "trash">("worksheets");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "lessons" || t === "workbooks" || t === "flashcards" || t === "trash") setLibraryTab(t);
  }, []);
  const switchLibraryTab = (next: "worksheets" | "workbooks" | "lessons" | "flashcards" | "trash") => {
    setLibraryTab(next);
    const url = new URL(window.location.href);
    if (next !== "worksheets") url.searchParams.set("tab", next);
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.toString());
  };
  const [wsQuery, setWsQuery] = useState("");
  const [wsSort, setWsSort] = useState<WorksheetSort>("updated_desc");
  const [wsSubjectFilter, setWsSubjectFilter] = useState<"ALL" | WorksheetSubject>("ALL");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [wsSubject, setWsSubject] = useState<WorksheetSubject | null>(null);
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  // Backup: pick some or all worksheets and download one .zip
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWsIds, setSelectedWsIds] = useState<string[]>([]);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  // Word auto-create modal state
  const [wordOpen, setWordOpen] = useState(false);
  const [wordMode, setWordMode] = useState<"fill-blank" | "exam">("fill-blank");
  const [wordTitle, setWordTitle] = useState("");
  const [wordSubject, setWordSubject] = useState<WorksheetSubject>("ENGLISH");
  const [wordText, setWordText] = useState("");
  const [wordPoints, setWordPoints] = useState(1);
  const [wordParsed, setWordParsed] = useState<ParsedFillBlankField[]>([]);
  const [wordExamParsed, setWordExamParsed] = useState<ParsedWordExamField[]>([]);
  const [wordWarnings, setWordWarnings] = useState<string[]>([]);
  const [wordSkipped, setWordSkipped] = useState(0);
  const [wordParsing, setWordParsing] = useState(false);
  const [wordCreating, setWordCreating] = useState(false);
  const wordFileInputRef = useRef<HTMLInputElement | null>(null);

  // Backup import state
  const [importingBackup, setImportingBackup] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Phase 25: Folder tree + tag organization state
  const [selectedFolderId, setSelectedFolderId] = useState<string>("ALL");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string>("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderItem | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const { data: foldersData } = useQuery<{ folders: FolderItem[]; tree: FolderTreeNode[] }>({
    queryKey: ["library-folders", "WORKSHEET"],
    queryFn: () =>
      apiFetchJson<{ folders: FolderItem[]; tree: FolderTreeNode[] }>(
        "/api/folders?kind=WORKSHEET",
        undefined,
        tr("Không tải được thư mục", "Could not load folders")
      ),
  });

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await apiFetchJson("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "WORKSHEET",
          name: newFolderName.trim(),
          parentId: newFolderParentId || null,
        }),
      });
      toast.success(tr("Đã tạo thư mục mới!", "Created folder!"));
      setFolderDialogOpen(false);
      setNewFolderName("");
      setNewFolderParentId("");
      queryClient.invalidateQueries({ queryKey: ["library-folders", "WORKSHEET"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setDeletingFolder(true);
    try {
      await apiFetchJson(`/api/folders/${deleteFolderTarget.id}`, { method: "DELETE" });
      toast.success(tr("Đã xoá thư mục (phiếu giữ nguyên ở thư viện).", "Deleted folder (worksheets kept)."));
      if (selectedFolderId === deleteFolderTarget.id) setSelectedFolderId("ALL");
      setDeleteFolderTarget(null);
      queryClient.invalidateQueries({ queryKey: ["library-folders", "WORKSHEET"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setDeletingFolder(false);
    }
  };

  const handleMoveWorksheetFolder = async (wsId: string, folderId: string | null) => {
    try {
      await apiFetchJson(`/api/worksheets/${wsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      toast.success(tr("Đã cập nhật thư mục cho phiếu!", "Updated worksheet folder!"));
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["library-folders", "WORKSHEET"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    }
  };

  const { data, isLoading } = useQuery<{
    worksheets: WorksheetRow[];
    sharedWorksheets?: WorksheetRow[];
    isAdmin?: boolean;
  }>({
    queryKey: ["teacher-worksheets"],
    queryFn: () =>
      apiFetchJson<{
        worksheets: WorksheetRow[];
        sharedWorksheets?: WorksheetRow[];
        isAdmin?: boolean;
      }>(
        "/api/worksheets",
        undefined,
        tr("Không thể tải danh sách worksheet", "Could not load worksheets")
      ),
  });

  const { data: driveStatus } = useQuery<DriveStatusPayload>({
    queryKey: ["drive-status", "worksheets"],
    queryFn: () => apiFetchJson<DriveStatusPayload>("/api/drive/status"),
  });

  const driveRevoked =
    driveStatus?.personal?.status === "REVOKED" ||
    (!driveStatus?.personal?.connected && driveStatus?.shared?.status === "REVOKED");

  /** Downloads one .zip with the selected worksheets (PDF + audio + answer keys). */
  const handleDownloadBackup = async () => {
    if (selectedWsIds.length === 0) return;
    setDownloadingBackup(true);
    try {
      const res = await fetch("/api/worksheets/export-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedWsIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? tr("Không tạo được file sao lưu", "Could not create the backup"));
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "pivora-backup.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tr(`Đã tải ${selectedWsIds.length} phiếu.`, `Downloaded ${selectedWsIds.length} worksheet(s).`));
      setSelectMode(false);
      setSelectedWsIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsSubject) {
      toast.error(tr("Vui lòng chọn môn học cho worksheet.", "Please select a subject for this worksheet."));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subject: wsSubject,
          instructions: instructions || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tạo thất bại", "Creation failed"));
      setOpen(false);
      setTitle("");
      setWsSubject(null);
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
      toast.success(tr("Đã chuyển vào thùng rác (khôi phục trong 30 ngày).", "Moved to trash (restorable for 30 days)."), {
        action: {
          label: tr("Hoàn tác", "Undo"),
          onClick: async () => {
            const undo = await fetch("/api/trash", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "WORKSHEET", id }),
            });
            if (undo.ok) toast.success(tr("Đã khôi phục worksheet.", "Worksheet restored."));
            queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
            queryClient.invalidateQueries({ queryKey: ["library-trash"] });
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
      queryClient.invalidateQueries({ queryKey: ["library-trash"] });
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? tr("Không thể xoá Worksheet.", "Could not delete worksheet."));
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
      const endpoint =
        wordMode === "exam" ? "/api/worksheets/parse-word-exam" : "/api/worksheets/parse-word";
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không đọc được file Word", "Could not parse Word file"));
      if (json.rawText) setWordText(json.rawText);
      if (!wordTitle && json.suggestedTitle) setWordTitle(json.suggestedTitle);
      if (wordMode === "exam") {
        setWordExamParsed(json.fields ?? []);
        setWordWarnings(json.warnings ?? []);
        setWordParsed([]);
      } else {
        setWordParsed(json.fields ?? []);
        setWordExamParsed([]);
        setWordWarnings([]);
      }
      setWordSkipped((json.skippedLines ?? []).length);
      toast.success(
        tr(
          `Đã nhận diện tự động ${json.fields?.length ?? 0} câu hỏi từ file!`,
          `Auto-detected ${json.fields?.length ?? 0} question(s) from file!`
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
      setWordExamParsed([]);
      setWordWarnings([]);
      setWordSkipped(0);
      return;
    }
    setWordParsing(true);
    try {
      const endpoint =
        wordMode === "exam" ? "/api/worksheets/parse-word-exam" : "/api/worksheets/parse-word";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToParse, defaultPoints: wordPoints }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Phân tích thất bại", "Parse failed"));
      if (wordMode === "exam") {
        setWordExamParsed(json.fields ?? []);
        setWordWarnings(json.warnings ?? []);
        setWordParsed([]);
      } else {
        setWordParsed(json.fields ?? []);
        setWordExamParsed([]);
        setWordWarnings([]);
      }
      setWordSkipped((json.skippedLines ?? []).length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setWordParsing(false);
    }
  };

  const handleConfirmWordCreate = async () => {
    const activeCount = wordMode === "exam" ? wordExamParsed.length : wordParsed.length;
    if (activeCount === 0) {
      toast.error(
        wordMode === "exam"
          ? tr("Chưa nhận diện được câu hỏi nào từ đề thi.", "No exam questions detected.")
          : tr("Chưa có câu hỏi nào được nhận diện (cần dấu __đáp án__).", "No blanks detected (wrap answers in __answer__).")
      );
      return;
    }
    setWordCreating(true);
    try {
      const finalTitle =
        wordTitle.trim() ||
        (wordMode === "exam"
          ? tr("Đề kiểm tra từ Word", "Exam worksheet from Word")
          : tr("Bài tập điền từ từ Word", "Fill-in-the-blank from Word"));
      const createRes = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          subject: wordSubject,
          instructions:
            wordMode === "exam"
              ? tr("Hoàn thành đầy đủ các câu hỏi dưới đây.", "Complete all questions below.")
              : tr("Điền từ hoặc cụm từ thích hợp vào chỗ trống.", "Fill in each blank with the correct word or phrase."),
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? tr("Không thể tạo phiếu", "Could not create worksheet"));

      const wsId = createJson.worksheet.id as string;
      const fieldsPayload =
        wordMode === "exam"
          ? wordExamParsed.map((f, idx) => ({
              placement: "ANSWER_SHEET" as const,
              type: f.type,
              label: f.label,
              prompt: f.prompt,
              order: idx,
              points: f.points,
              options: f.options ?? null,
              answerKey: f.answerKey,
              gradingOpts: f.gradingOpts ?? null,
            }))
          : wordParsed.map((f, idx) => ({
              placement: "ANSWER_SHEET" as const,
              type: "TEXT" as const,
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
            }));

      const fieldsRes = await fetch(`/api/worksheets/${wsId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fieldsPayload }),
      });
      if (!fieldsRes.ok) {
        const err = await fieldsRes.json().catch(() => ({}));
        throw new Error(err.error ?? tr("Lưu câu hỏi thất bại", "Failed to save fields"));
      }

      toast.success(
        tr(`Đã tạo phiếu "${finalTitle}" với ${activeCount} câu hỏi!`, `Created "${finalTitle}" with ${activeCount} question(s)!`)
      );
      setWordOpen(false);
      setWordTitle("");
      setWordText("");
      setWordParsed([]);
      setWordExamParsed([]);
      setWordWarnings([]);
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

  const folders = useMemo(() => foldersData?.folders ?? [], [foldersData]);
  const folderTree = foldersData?.tree ?? [];
  const selectedSubtree = useMemo(
    () =>
      selectedFolderId !== "ALL" && selectedFolderId !== "UNFILED"
        ? collectFolderSubtreeIds(folders, selectedFolderId)
        : null,
    [folders, selectedFolderId]
  );

  const worksheets = data?.worksheets ?? [];
  const sharedWorksheets = data?.sharedWorksheets ?? [];
  /** admin: the second tab lists every other teacher's worksheet, editable */
  const isAdmin = Boolean(data?.isAdmin);
  const visibleMine = useMemo(
    () =>
      filterAndSortWorksheets(
        data?.worksheets ?? [],
        wsQuery,
        wsSort,
        wsSubjectFilter,
        selectedFolderId,
        selectedSubtree
      ),
    [data?.worksheets, wsQuery, wsSort, wsSubjectFilter, selectedFolderId, selectedSubtree]
  );
  const visibleShared = useMemo(
    () => filterAndSortWorksheets(data?.sharedWorksheets ?? [], wsQuery, wsSort, wsSubjectFilter),
    [data?.sharedWorksheets, wsQuery, wsSort, wsSubjectFilter]
  );
  const currentTotal = tab === "mine" ? worksheets.length : sharedWorksheets.length;
  const currentShown = tab === "mine" ? visibleMine.length : visibleShared.length;

  // Where new files (PDF, audio, lesson materials) are written: Drive works as the app's disk
  const storageSource = driveStatus?.effectiveSource;
  const storageOnDrive = storageSource === "personal" || storageSource === "shared";

  const libraryHeader = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.nav.worksheets}</h1>
        {driveStatus && (
          <Link
            href="/teacher/settings"
            data-testid="storage-location"
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
              storageOnDrive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            )}
            title={tr("Nơi lưu file mới", "Where new files are stored")}
          >
            <Cloud className="h-3.5 w-3.5" />
            {storageSource === "personal"
              ? tr("File lưu trên Google Drive của bạn", "Files stored on your Google Drive")
              : storageSource === "shared"
                ? tr("File lưu trên Google Drive của trường", "Files stored on the school Google Drive")
                : tr("File đang lưu trên máy chủ, kết nối Google Drive →", "Files stored on the server, connect Google Drive →")}
          </Link>
        )}
      </div>
      <div
        role="tablist"
        aria-label={tr("Kho lưu trữ", "Library")}
        className="grid w-full grid-cols-2 gap-1 rounded-xl bg-[#EFF4FF] dark:bg-slate-800 p-1 sm:inline-grid sm:w-auto sm:grid-cols-5"
      >
        {(
          [
            ["worksheets", tr("Worksheet", "Worksheets"), <FileText key="i" className="h-4 w-4" />],
            ["workbooks", tr("Workbook", "Workbooks"), <BookMarked key="i" className="h-4 w-4" />],
            ["lessons", tr("Bài giảng", "Lessons"), <BookOpen key="i" className="h-4 w-4" />],
            ["flashcards", tr("Flashcard", "Flashcards"), <Layers key="i" className="h-4 w-4" />],
            ["trash", tr("Thùng rác", "Trash"), <Trash2 key="i" className="h-4 w-4" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={libraryTab === id}
            data-testid={`library-tab-${id}`}
            onClick={() => switchLibraryTab(id)}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-bold transition sm:gap-2 sm:px-5 sm:text-sm",
              libraryTab === id
                ? "bg-white dark:bg-slate-900 text-[#3525CD] shadow-sm"
                : "text-[#464555] dark:text-slate-300 hover:text-[#0B1C30]"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  if (libraryTab === "trash") {
    return (
      <div className="space-y-6">
        {libraryHeader}
        <TrashView isAdmin={isAdmin} />
      </div>
    );
  }

  if (libraryTab === "workbooks") {
    return (
      <div className="space-y-6">
        {libraryHeader}
        <WorkbookLibrary />
      </div>
    );
  }

  if (libraryTab === "flashcards") {
    return (
      <div className="space-y-6">
        {libraryHeader}
        <FlashcardDeckManager mode="TEACHER" />
      </div>
    );
  }

  if (libraryTab === "lessons") {
    return (
      <div className="space-y-6">
        {libraryHeader}
        <p className="-mt-2 text-sm text-[#464555]">
          {tr(
            "Soạn chương bài giảng (PDF, video, file nghe, liên kết) một lần rồi giao cho nhiều lớp. Sửa ở đây là mọi lớp cùng cập nhật.",
            "Build lesson chapters (PDF, video, audio, links) once and give them to many classes. Edits here update every class."
          )}
        </p>
        <LessonLibrary isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {libraryHeader}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1C30]">{vi.worksheets.title}</h2>
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
            <Button
              variant={selectMode ? "secondary" : "outline"}
              size="sm"
              data-testid="export-all-btn"
              onClick={() => {
                setSelectMode((on) => !on);
                setTab("mine");
                setSelectedWsIds([]);
              }}
            >
              <Archive className="h-4 w-4 text-emerald-600" />
              {selectMode ? tr("Thoát chọn", "Stop selecting") : tr("Sao lưu (.zip)", "Backup (.zip)")}
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {vi.worksheets.createWorksheet}
          </Button>
        </div>
      </div>

      {driveRevoked && (
        <div
          data-testid="drive-revoked-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {tr(
              "Kết nối Google Drive đã bị thu hồi hoặc hết hạn. Vui lòng kết nối lại trong phần Cài đặt.",
              "Google Drive connection was revoked or expired. Please reconnect in Settings."
            )}
          </span>
          <Link href="/teacher/settings" className="font-bold text-[#3525CD] hover:underline">
            {tr("Mở cài đặt Drive →", "Open Drive settings →")}
          </Link>
        </div>
      )}

      {/* Admin only: own worksheets vs every other teacher's (teachers share backups as files instead) */}
      {isAdmin && (
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
          {isAdmin
            ? tr("Của giáo viên khác (tất cả)", "Other teachers' (all)")
            : tr("Của giáo viên khác", "Other teachers'")}{" "}
          ({sharedWorksheets.length})
        </button>
      </div>
      )}

      {(worksheets.length > 0 || sharedWorksheets.length > 0) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">{tr("Tìm worksheet", "Search worksheets")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={wsQuery}
              onChange={(e) => setWsQuery(e.target.value)}
              placeholder={tr("Tìm theo tên phiếu, hướng dẫn, giáo viên…", "Search by title, instructions, teacher…")}
              className="h-10 pl-9"
            />
          </label>
          <select
            aria-label={tr("Lọc theo môn học", "Filter by subject")}
            value={wsSubjectFilter}
            onChange={(e) => setWsSubjectFilter(e.target.value as "ALL" | WorksheetSubject)}
            data-testid="worksheet-subject-filter"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 sm:w-48"
          >
            <option value="ALL">{tr("Tất cả môn học", "All subjects")}</option>
            {WORKSHEET_SUBJECTS.map((subj) => {
              const m = getSubjectMeta(subj);
              return (
                <option key={subj} value={subj}>
                  {locale === "en" ? m.labelEn : m.labelVi}
                </option>
              );
            })}
          </select>
          <select
            aria-label={tr("Sắp xếp worksheet", "Sort worksheets")}
            value={wsSort}
            onChange={(e) => setWsSort(e.target.value as WorksheetSort)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 sm:w-52"
          >
            <option value="updated_desc">{tr("Cập nhật mới nhất", "Recently updated")}</option>
            <option value="updated_asc">{tr("Cập nhật cũ nhất", "Least recently updated")}</option>
            <option value="title">{tr("Tên (A→Z)", "Title (A→Z)")}</option>
            <option value="most_assigned">{tr("Giao nhiều nhất", "Most assigned")}</option>
            <option value="most_questions">{tr("Nhiều câu hỏi nhất", "Most questions")}</option>
          </select>
          {(wsQuery.trim() || wsSubjectFilter !== "ALL") && (
            <span className="text-xs text-[#464555] sm:whitespace-nowrap" aria-live="polite">
              {tr(`${currentShown}/${currentTotal} phiếu`, `${currentShown} of ${currentTotal}`)}
            </span>
          )}
        </div>
      )}

      {selectMode && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-[#EEF2FF] px-4 py-3 text-sm sm:top-20">
          <span className="font-semibold text-[#0B1C30]">
            {tr(`Đã chọn ${selectedWsIds.length}/${worksheets.length} phiếu`, `${selectedWsIds.length}/${worksheets.length} selected`)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedWsIds(visibleMine.map((w) => w.id))}
          >
            {wsQuery.trim()
              ? tr(`Chọn ${visibleMine.length} kết quả`, `Select ${visibleMine.length} results`)
              : tr("Chọn tất cả", "Select all")}
          </Button>
          {selectedWsIds.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedWsIds([])}>
              {tr("Bỏ chọn", "Clear")}
            </Button>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={selectedWsIds.length === 0 || downloadingBackup}
            onClick={() => void handleDownloadBackup()}
            data-testid="download-backup-btn"
          >
            <Download className="h-4 w-4" />
            {downloadingBackup
              ? tr("Đang đóng gói…", "Packing…")
              : tr(`Tải ${selectedWsIds.length} phiếu (.zip)`, `Download ${selectedWsIds.length} (.zip)`)}
          </Button>
          <p className="w-full text-[11px] text-[#464555]">
            {tr(
              "File .zip gồm PDF, file nghe và đáp án. Gửi cho giáo viên khác qua Zalo / Messenger, họ bấm “Nhập Backup” để dùng.",
              "The .zip contains PDFs, audio and answer keys. Send it to colleagues (Zalo / Messenger); they use “Import Backup”."
            )}
          </p>
        </div>
      )}

      {tab === "mine" && (
        <div className="stitch-card flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedFolderId("ALL")}
              data-testid="folder-filter-all"
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition",
                selectedFolderId === "ALL"
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                  : "border-slate-200 bg-white text-[#464555] hover:bg-slate-50"
              )}
            >
              <Folder className="h-3.5 w-3.5" />
              {tr("Tất cả thư mục", "All folders")} ({worksheets.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFolderId("UNFILED")}
              data-testid="folder-filter-unfiled"
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition",
                selectedFolderId === "UNFILED"
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                  : "border-slate-200 bg-white text-[#464555] hover:bg-slate-50"
              )}
            >
              {tr("Chưa phân loại", "Unfiled")} ({worksheets.filter((w) => !w.folderId).length})
            </button>
            {(() => {
              const items: Array<{ node: FolderTreeNode; depth: number }> = [];
              const walk = (nodes: FolderTreeNode[], depth: number) => {
                for (const n of nodes) {
                  items.push({ node: n, depth });
                  if (n.children.length > 0) walk(n.children, depth + 1);
                }
              };
              walk(folderTree, 0);
              return items.map(({ node, depth }) => (
                <div key={node.id} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(node.id)}
                    data-testid={`folder-chip-${node.id}`}
                    className={cn(
                      "inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition",
                      selectedFolderId === node.id
                        ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                        : "border-slate-200 bg-white text-[#464555] hover:bg-slate-50"
                    )}
                  >
                    <Folder className="h-3.5 w-3.5 text-[#4F46E5]" />
                    <span>
                      {depth > 0 ? "↳ " : ""}
                      {node.name}
                    </span>
                    <span className="text-[11px] opacity-70">({node.worksheetCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteFolderTarget(node)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title={tr("Xoá thư mục", "Delete folder")}
                    data-testid={`delete-folder-${node.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ));
            })()}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[40px]"
            onClick={() => setFolderDialogOpen(true)}
            data-testid="create-folder-btn"
          >
            <FolderPlus className="h-4 w-4 text-[#4F46E5]" />
            {tr("Tạo thư mục", "New folder")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      ) : tab === "mine" && worksheets.length > 0 && visibleMine.length === 0 ? (
        <div className="stitch-card p-10 text-center text-sm text-slate-500">
          {tr("Không có worksheet nào khớp từ khoá.", "No worksheets match your search.")}
        </div>
      ) : tab === "shared" && sharedWorksheets.length > 0 && visibleShared.length === 0 ? (
        <div className="stitch-card p-10 text-center text-sm text-slate-500">
          {tr("Không có worksheet nào khớp từ khoá.", "No worksheets match your search.")}
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
            {visibleMine.map((ws) => (
              <div
                key={ws.id}
                className={cn(
                  "stitch-card-hover flex flex-col justify-between p-5 space-y-4",
                  selectMode && selectedWsIds.includes(ws.id) && "ring-2 ring-[#4F46E5]"
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {selectMode ? (
                      <label className="flex h-10 cursor-pointer items-center gap-2 text-xs font-semibold text-[#3525CD]">
                        <input
                          type="checkbox"
                          checked={selectedWsIds.includes(ws.id)}
                          onChange={() =>
                            setSelectedWsIds((prev) =>
                              prev.includes(ws.id) ? prev.filter((x) => x !== ws.id) : [...prev, ws.id]
                            )
                          }
                          className="h-5 w-5 rounded border-slate-300 text-[#4F46E5]"
                          data-testid={`backup-select-${ws.id}`}
                        />
                        {tr("Chọn", "Select")}
                      </label>
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                        <FileText className="h-5 w-5" />
                      </span>
                    )}
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <SubjectBadge subject={ws.subject} />
                      <Badge variant={ws.pdfFileKey ? "default" : "neutral"}>
                        {ws.pdfFileKey
                          ? `PDF • ${ws.pageCount} ${tr("trang", ws.pageCount === 1 ? "page" : "pages")}`
                          : tr("Phiếu trả lời", "Answer sheet")}
                      </Badge>
                      {(ws._count.audios ?? 0) > 0 && (
                        <Badge variant="purple">
                          <Headphones className="h-3 w-3" /> {ws._count.audios}
                        </Badge>
                      )}
                      {/* where this worksheet's files (PDF / audio) live; answer-sheet-only worksheets have none */}
                      {(ws.pdfFileKey || (ws._count.audios ?? 0) > 0) &&
                        ((ws._count.driveFiles ?? 0) > 0 ? (
                          <Badge
                            variant="sky"
                            data-testid={`drive-stored-badge-${ws.id}`}
                            title={tr("PDF / file nghe của phiếu nằm trên Google Drive", "PDF / audio stored on Google Drive")}
                          >
                            <Cloud className="h-3 w-3" /> {tr("Trên Google Drive", "On Google Drive")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="neutral"
                            title={tr(
                              "File đang ở máy chủ (lúc tạo chưa kết nối Google Drive)",
                              "Files are on the server (Google Drive was not connected when created)"
                            )}
                          >
                            {tr("Trên máy chủ", "On the server")}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-[#0B1C30] line-clamp-2">{ws.title}</h3>
                  {ws.instructions && (
                    <p className="text-xs text-[#464555] line-clamp-2">{ws.instructions}</p>
                  )}
                  {(ws.isPublic || (ws.tags && ws.tags.length > 0)) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {ws.isPublic && (
                        <Badge variant="mint" className="text-[10px]">
                          <Globe className="h-3 w-3" /> Discover{ws.publicLevel ? ` · ${ws.publicLevel}` : ""}
                        </Badge>
                      )}
                      {(ws.tags ?? []).slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {folders.length > 0 && (
                    <div className="pt-0.5">
                      <select
                        aria-label={tr("Chọn thư mục", "Select folder")}
                        value={ws.folderId ?? ""}
                        onChange={(e) => void handleMoveWorksheetFolder(ws.id, e.target.value || null)}
                        data-testid={`worksheet-folder-select-${ws.id}`}
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-[#464555]"
                      >
                        <option value="">{tr("📁 Chưa phân thư mục", "📁 Unfiled")}</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            📁 {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      {ws._count.fields}{" "}
                      {tr("câu hỏi", ws._count.fields === 1 ? "question" : "questions")}
                    </span>
                    <span>•</span>
                    <span>
                      {tr("Đã giao", "Assigned")} {ws._count.assignments}{" "}
                      {tr("lần", ws._count.assignments === 1 ? "time" : "times")}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {tr("Cập nhật:", "Updated:")} {formatDateTime(ws.updatedAt, locale)}
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
                      <FileDown className="h-3 w-3" /> {tr("Word (ĐA)", "Word (key)")}
                    </a>
                    <a
                      href={`/api/worksheets/${ws.id}/export?format=docx-student`}
                      download
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8F9FF] px-2 py-1 font-semibold text-[#464555] hover:bg-slate-100"
                      title={tr("Xuất file Word bản đề cho học sinh (không kèm đáp án)", "Export student Word .docx handout")}
                    >
                      <FileDown className="h-3 w-3" /> {tr("Word (HS)", "Word (student)")}
                    </a>
                    <a
                      href={`/api/worksheets/${ws.id}/export?format=pdf&mode=student`}
                      download
                      data-testid={`export-pdf-student-${ws.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8F9FF] px-2 py-1 font-semibold text-[#3525CD] hover:bg-[#EEF2FF]"
                      title={tr("Xuất PDF đề in cho học sinh", "Export printable student PDF")}
                    >
                      <FileDown className="h-3 w-3" /> PDF (HS)
                    </a>
                    <a
                      href={`/api/worksheets/${ws.id}/export?format=pdf&mode=key`}
                      download
                      data-testid={`export-pdf-key-${ws.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8F9FF] px-2 py-1 font-semibold text-[#3525CD] hover:bg-[#EEF2FF]"
                      title={tr("Xuất PDF kèm đáp án & rubric", "Export PDF with answer key")}
                    >
                      <FileDown className="h-3 w-3" /> PDF (ĐA)
                    </a>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLiveWs({ id: ws.id, title: ws.title })}
                        data-testid={`live-quiz-open-${ws.id}`}
                        title={tr("Mở Live Quiz", "Start Live Quiz")}
                      >
                        <Radio className="h-3.5 w-3.5" />
                        Live
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
            {isAdmin
              ? tr("Các giáo viên khác chưa tạo worksheet nào.", "Other teachers have not created any worksheets yet.")
              : tr(
              "Chưa có phiếu nào được giáo viên khác chia sẻ. Bạn có thể bấm 'Chia sẻ GV' trên phiếu của mình hoặc dùng nút 'Nhập Backup' để nhận file backup (.engclass.zip) từ đồng nghiệp.",
              "No worksheets shared by colleagues yet. Click 'Share' on your worksheets or use 'Import Backup' to load a colleague's .engclass.zip file."
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleShared.map((ws) => (
            <div key={ws.id} className="stitch-card-hover flex flex-col justify-between p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="mint">
                    <Users className="h-3 w-3" /> {ws.owner?.name ?? tr("Giáo viên", "Teacher")}
                  </Badge>
                  <div className="flex flex-wrap justify-end gap-1">
                    <SubjectBadge subject={ws.subject} />
                    {isAdmin && !ws.isShared && (
                      <Badge variant="neutral">{tr("Không chia sẻ", "Private")}</Badge>
                    )}
                    <Badge variant="neutral">{ws._count.fields} {tr("câu", "Q")}</Badge>
                  </div>
                </div>
                <h3 className="text-base font-bold text-[#0B1C30] line-clamp-2">{ws.title}</h3>
                {isAdmin && (
                  <p className="text-[11px] text-slate-400">
                    {ws._count.assignments} {tr("lần giao", "assignments")} · {formatDateTime(ws.updatedAt)}
                  </p>
                )}
                {ws.instructions && (
                  <p className="text-xs text-[#464555] line-clamp-2">{ws.instructions}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {isAdmin && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/teacher/worksheets/${ws.id}/edit`}>
                      <Edit3 className="h-3.5 w-3.5" />
                      {tr("Sửa", "Edit")}
                    </Link>
                  </Button>
                )}
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
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setWsSubject(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{vi.worksheets.createWorksheet}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Môn học *", "Subject *")}</Label>
              <SubjectPicker value={wsSubject} onChange={setWsSubject} />
            </div>
            <div className="space-y-1.5">
              <Label>{vi.worksheets.worksheetTitle}</Label>
              <Input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  wsSubject === "MATH"
                    ? "VD: Đề kiểm tra 15 phút Hàm số bậc hai"
                    : "VD: Unit 8 Grammar Worksheet"
                }
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
              <Button
                type="submit"
                variant="accent"
                disabled={creating || !wsSubject}
                data-testid="confirm-create-worksheet-btn"
              >
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
            {/* Mode Switch: Fill-in-the-blank vs Mixed Exam */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#EFF4FF] p-1">
              <button
                type="button"
                data-testid="word-mode-fill-blank"
                onClick={() => {
                  setWordMode("fill-blank");
                  setWordExamParsed([]);
                  setWordWarnings([]);
                }}
                className={cn(
                  "min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition",
                  wordMode === "fill-blank"
                    ? "bg-[#4F46E5] text-white shadow-sm"
                    : "text-[#464555] hover:text-[#0B1C30]"
                )}
              >
                {tr("Điền từ (__đáp án__)", "Fill-in-the-blank (__answer__)")}
              </button>
              <button
                type="button"
                data-testid="word-mode-exam"
                onClick={() => {
                  setWordMode("exam");
                  setWordParsed([]);
                }}
                className={cn(
                  "min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition",
                  wordMode === "exam"
                    ? "bg-[#4F46E5] text-white shadow-sm"
                    : "text-[#464555] hover:text-[#0B1C30]"
                )}
              >
                {tr("Đề thi đa dạng (MCQ / Đ-S / Tự luận)", "Mixed Exam (MCQ / T-F / Essay)")}
              </button>
            </div>

            {wordMode === "fill-blank" ? (
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
            ) : (
              <div className="rounded-xl border border-indigo-200 bg-[#EEF2FF]/60 p-3.5 space-y-1 text-[#3525CD]">
                <p className="font-bold">
                  {tr("Tự động nhận diện 4 dạng câu hỏi từ Word (.docx) hoặc văn bản:", "Auto-detects 4 question types from Word (.docx) or text:")}
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>
                    {tr("Trắc nghiệm A. B. C. D. (tự nhận đáp án in đậm/gạch chân, dấu *A. hoặc bảng đáp án cuối bài).", "MCQ A. B. C. D. (detects bold/underlined options, *A., or answer key section at bottom).")}
                  </li>
                  <li>
                    {tr("Đúng/Sai 4 ý THPT 2025: a) ... b) ... c) ... d) ... với (Đ)/(S) hoặc bảng đáp án a-Đ, b-S.", "True/False 4-part (a-d): inline (T)/(F) or (Đ)/(S), bold cues, or bottom table.")}
                  </li>
                  <li>
                    {tr("Điền từ (__đáp án__) và Tự luận ([Tự luận] hoặc câu hỏi mở).", "Fill-in-the-blank (__answer__) and Essay ([Essay] or open-ended questions).")}
                  </li>
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
                <Label className="text-xs">{tr("Môn học", "Subject")}</Label>
                <select
                  value={wordSubject}
                  onChange={(e) => setWordSubject(e.target.value as WorksheetSubject)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0B1C30] outline-none focus:border-[#4F46E5]"
                >
                  {WORKSHEET_SUBJECTS.map((subj) => {
                    const m = getSubjectMeta(subj);
                    return (
                      <option key={subj} value={subj}>
                        {locale === "en" ? m.shortEn : m.shortVi}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("Điểm / câu", "Points / Q")}</Label>
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
            {wordMode === "exam" && wordExamParsed.length > 0 && (
              <div
                data-testid="word-exam-preview"
                className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2"
              >
                <p className="font-bold text-emerald-800">
                  {tr(`Đã nhận diện ${wordExamParsed.length} câu hỏi`, `Detected ${wordExamParsed.length} question(s)`)}
                </p>
                {wordWarnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 space-y-0.5">
                    {wordWarnings.map((w, wi) => (
                      <p key={wi}>• {w}</p>
                    ))}
                  </div>
                )}
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {wordExamParsed.map((f, idx) => (
                    <div
                      key={`${f.label}-${idx}`}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-[#0B1C30]">
                          <span className="mr-1.5 inline-block rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-bold text-[#3525CD]">
                            {tr("Câu", "Q")} {f.label} · {f.type}
                          </span>
                          <PromptText text={f.prompt} />
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-400">
                          {f.points}
                          {tr("đ", "pt")}
                        </span>
                      </div>
                      {f.options && f.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 text-[11px] text-[#464555]">
                          {f.options.map((o) => (
                            <span key={o.id} className="rounded bg-slate-100 px-1.5 py-0.5">
                              {o.id}. {o.text}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wordMode === "fill-blank" && wordParsed.length > 0 && (
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
                            {tr("Câu", "Q")} {f.label}
                          </span>
                          <PromptText text={f.prompt} />
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-400">
                          {f.points}
                          {tr("đ", "pt")}
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
                disabled={(wordMode === "exam" ? wordExamParsed.length : wordParsed.length) === 0 || wordCreating}
                data-testid="confirm-word-import-btn"
                onClick={() => void handleConfirmWordCreate()}
              >
                <Sparkles className="h-4 w-4" />
                {wordCreating
                  ? tr("Đang tạo…", "Creating…")
                  : wordMode === "exam"
                    ? tr(`Tạo Worksheet (${wordExamParsed.length} câu hỏi)`, `Create worksheet (${wordExamParsed.length} questions)`)
                    : tr(`Tạo Worksheet (${wordParsed.length} ô điền)`, `Create worksheet (${wordParsed.length} blanks)`)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Tạo thư mục sắp xếp học liệu", "Create library folder")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Nhóm phiếu bài tập theo chương, lớp hoặc trình độ.",
                "Group worksheets by unit, grade level, or topic."
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="folder-name-input">{tr("Tên thư mục", "Folder name")}</Label>
              <Input
                id="folder-name-input"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={tr("VD: Ngữ pháp nâng cao", "e.g., Grammar Unit 1")}
                data-testid="folder-name-input"
              />
            </div>
            {folders.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="folder-parent-select">{tr("Thư mục cha (tuỳ chọn)", "Parent folder (optional)")}</Label>
                <select
                  id="folder-parent-select"
                  value={newFolderParentId}
                  onChange={(e) => setNewFolderParentId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">{tr("-- Thư mục gốc --", "-- Root folder --")}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setFolderDialogOpen(false)}>
                {vi.common.cancel}
              </Button>
              <Button type="submit" disabled={creatingFolder} data-testid="folder-create-submit">
                {creatingFolder ? vi.common.saving : tr("Tạo thư mục", "Create folder")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirmation Dialog */}
      <Dialog open={Boolean(deleteFolderTarget)} onOpenChange={(o) => !o && setDeleteFolderTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Xoá thư mục?", "Delete folder?")}</DialogTitle>
            <DialogDescription>
              {deleteFolderTarget
                ? tr(
                    `Xoá thư mục "${deleteFolderTarget.name}"? Các phiếu bên trong sẽ không bị xoá mà chuyển ra ngoài thư mục.`,
                    `Delete folder "${deleteFolderTarget.name}"? Worksheets inside will remain safe in your library.`
                  )
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteFolderTarget(null)}>
              {vi.common.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingFolder}
              onClick={() => void handleDeleteFolder()}
              data-testid="folder-delete-confirm"
            >
              {deletingFolder ? vi.common.saving : tr("Xoá thư mục", "Delete folder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {liveWs && (
        <StartLiveQuizDialog
          worksheetId={liveWs.id}
          worksheetTitle={liveWs.title}
          open={Boolean(liveWs)}
          onOpenChange={(o) => !o && setLiveWs(null)}
        />
      )}
    </div>
  );
}
