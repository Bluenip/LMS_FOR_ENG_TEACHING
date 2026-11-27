"use client";

import { BackLink } from "@/components/navigation/BackLink";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { cancelDirectDriveUpload, uploadDirectToDrive } from "@/lib/drive-upload";
import type { DriveStatusPayload } from "@/server/driveService";
import {
  Archive,
  BarChart2,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  CopyPlus,
  ExternalLink,
  FileText,
  Film,
  Headphones,
  KeyRound,
  Library,
  Lock,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Table2,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  UserCheck,
  UserMinus,
  Users,
  ScanLine,
  Star,
  Zap,
} from "lucide-react";
import { describeProctorRuleSummary } from "@/lib/proctor-helpers";
import { formatDateTime, getInitials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfCanvasPage, usePdfDocument } from "@/components/worksheet/PdfCanvasPage";
import type { ClassRole, LessonItemType, ProctorMode, ViolationAction } from "@prisma/client";
import { CreateAccountForm } from "@/components/accounts/CreateAccountForm";
import { AddLessonsFromLibraryDialog } from "@/components/lessons/AddLessonsFromLibraryDialog";
import { QuickTextbookModal } from "@/components/assignments/QuickTextbookModal";
import { ClassSubmissionsTab } from "@/components/classes/ClassSubmissionsTab";
import { ClassAnalyticsTab } from "@/components/classes/ClassAnalyticsTab";
import { ClassGradebookTab } from "@/components/classes/ClassGradebookTab";
import { ClassScheduleTab } from "@/components/classes/ClassScheduleTab";
import { ClassBehaviorTab } from "@/components/classes/ClassBehaviorTab";
import { ExitTicketDialog } from "@/components/live-quiz/ExitTicketDialog";
import { MyOmrScansCard } from "@/components/omr/MyOmrScansCard";
import { StudentProgressDrawer } from "@/components/classes/StudentProgressDrawer";
import {
  ClassTeachersSection,
  type ClassTeacherItem,
} from "@/components/classes/ClassTeachersSection";
import { PostCard, type RichPostDTO } from "@/components/classes/PostCard";
import { TRASH_DAYS } from "@/lib/trash";
import {
  ResetPasswordDialog,
  type ResetPasswordTarget,
} from "@/components/accounts/ResetPasswordDialog";

export interface ClassDetailData {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  archived: boolean;
  requireApproval: boolean;
  enableGamification?: boolean;
  teacher: { id: string; name: string; email: string };
  classTeachers?: ClassTeacherItem[];
  enrollments: Array<{
    id: string;
    status: "ACTIVE" | "PENDING";
    joinedAt: string;
    student: {
      id: string;
      name: string;
      email?: string;
      avatarUrl?: string | null;
      parentLinksAsChild?: Array<{
        id: string;
        relation: string | null;
        parent: { id: string; name: string; email: string };
      }>;
    };
  }>;
  posts: RichPostDTO[];
  workbooks?: Array<{ id: string; title: string; assignmentCount: number }>;
  lessonActiveStudentCount?: number;
  lessons: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    /** library owner: only they (or an admin) can edit the lesson's materials */
    ownerId?: string | null;
    owner?: { id: string; name: string } | null;
    items: Array<{
      id: string;
      title: string;
      type: LessonItemType;
      fileKey: string | null;
      url: string | null;
      order: number;
      completedCount?: number;
      completedByMe?: boolean;
    }>;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    timeLimitMin: number | null;
    proctorMode: ProctorMode;
    requireCamera?: boolean;
    requireMicMonitor?: boolean;
    violationAction: ViolationAction;
    maxViolations: number;
    workbookId?: string | null;
    workbookOrder?: number | null;
    unlockAfterAssignmentId?: string | null;
    isQuickTextbook?: boolean;
    workbook?: { id: string; title: string } | null;
    isLockedByPrerequisite?: boolean;
    worksheet: { id: string; title: string; _count: { fields: number } };
    _count: { submissions: number };
  }>;
}

function extractYoutubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

function LessonPdfModal({ fileKey, title, onClose }: { fileKey: string; title: string; onClose: () => void }) {
  const { tr } = useI18n();
  const { pdfDoc, loading } = usePdfDocument(`/api/files/${fileKey}`);
  const [pageCount, setPageCount] = useState(1);

  if (pdfDoc && pdfDoc.numPages !== pageCount) {
    setPageCount(pdfDoc.numPages);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-x-auto py-2">
          {loading && <p className="text-center text-sm text-slate-400">{tr("Đang tải PDF…", "Loading PDF…")}</p>}
          {Array.from({ length: pageCount }).map((_, idx) => (
            <PdfCanvasPage
              key={idx}
              pdfDoc={pdfDoc}
              pageIndex={idx}
              widthPt={595}
              heightPt={842}
              zoom={0.95}
              eager={idx === 0}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CLASS_TABS = [
  "feed",
  "assignments",
  "lessons",
  "schedule",
  "students",
  "gradebook",
  "submissions",
  "analytics",
  "behavior",
  "settings",
] as const;

export function ClassDetailView({
  initialClass,
  isTeacher,
  currentUserId,
  isAdmin = false,
  classRole = null,
}: {
  initialClass: ClassDetailData;
  isTeacher: boolean;
  currentUserId: string;
  isAdmin?: boolean;
  classRole?: ClassRole | null;
}) {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const [cls, setCls] = useState<ClassDetailData>(initialClass);
  const effectiveClassRole: ClassRole | null = isAdmin
    ? "OWNER"
    : classRole ?? (isTeacher ? "OWNER" : null);
  const canManageTeachersOrDanger = isAdmin || effectiveClassRole === "OWNER";
  const canEditClass =
    isAdmin || effectiveClassRole === "OWNER" || effectiveClassRole === "CO_TEACHER";

  // Feed state
  const [postContent, setPostContent] = useState("");
  const [postAttachments, setPostAttachments] = useState<
    Array<{ key: string; name: string; mimeType: string; sizeBytes: number }>
  >([]);
  const [uploadingPostFile, setUploadingPostFile] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [posting, setPosting] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState(`${initialClass.name} (Bản sao)`);
  const [cloning, setCloning] = useState(false);

  // Lesson creation state
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDesc, setChapterDesc] = useState("");
  const [addingItemLessonId, setAddingItemLessonId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<LessonItemType>("PDF");
  const [itemUrl, setItemUrl] = useState("");
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [itemUploadPct, setItemUploadPct] = useState<number | null>(null);
  const [itemUploading, setItemUploading] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadJobIdRef = useRef<string | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ fileKey: string; title: string } | null>(null);
  // Selected tab lives in the URL (?tab=assignments) so Back from a grading / leaderboard page
  // returns to the same tab, and links can open a tab directly.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get("tab");
    return t && CLASS_TABS.includes(t as (typeof CLASS_TABS)[number]) ? t : "feed";
  });
  const changeTab = (next: string) => {
    setActiveTab(next);
    const url = new URL(window.location.href);
    if (next === "feed") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url.toString());
  };
  const [removingLesson, setRemovingLesson] = useState<{ id: string; title: string } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exitTicketOpen, setExitTicketOpen] = useState(false);
  const canEditLesson = (lesson: { ownerId?: string | null }) =>
    isTeacher && (isAdmin || lesson.ownerId === currentUserId);

  const { data: driveStatus } = useQuery<DriveStatusPayload>({
    queryKey: ["drive-status", "class-detail"],
    enabled: isTeacher,
    queryFn: () => apiFetchJson<DriveStatusPayload>("/api/drive/status"),
  });
  const driveConnected = Boolean(
    driveStatus?.personal?.connected || driveStatus?.shared?.connected
  );

  // Settings state
  const [editName, setEditName] = useState(cls.name);
  const [editDesc, setEditDesc] = useState(cls.description ?? "");
  const [editRequireApproval, setEditRequireApproval] = useState(cls.requireApproval);
  const [editEnableGamification, setEditEnableGamification] = useState(
    cls.enableGamification ?? true
  );
  const [importingExcel, setImportingExcel] = useState(false);
  const [generatedParentCode, setGeneratedParentCode] = useState<{
    studentName: string;
    code: string;
  } | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(null);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [progressStudent, setProgressStudent] = useState<{ id: string; name: string } | null>(null);
  const [gradebookRange, setGradebookRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });

  const refreshClass = async () => {
    const res = await fetch(`/api/classes/${cls.id}`);
    if (res.ok) {
      const json = await res.json();
      setCls(json.class);
    }
    router.refresh();
  };

  const handleUploadPostAttachment = async (file: File) => {
    setUploadingPostFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/classes/${cls.id}/posts/upload`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tải file thất bại", "Upload failed"));
      setPostAttachments((prev) => [...prev, json.attachment]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải file thất bại", "Upload failed"));
    } finally {
      setUploadingPostFile(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    const validPollOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (pollOpen && (!pollQuestion.trim() || validPollOpts.length < 2)) {
      toast.error(
        tr(
          "Bình chọn cần có câu hỏi và ít nhất 2 lựa chọn.",
          "Poll requires a question and at least 2 options."
        )
      );
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(`/api/classes/${cls.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: postContent,
          ...(postAttachments.length > 0 ? { attachments: postAttachments } : {}),
          ...(pollOpen
            ? {
                poll: {
                  question: pollQuestion.trim(),
                  allowMultiple: pollAllowMultiple,
                  options: validPollOpts,
                },
              }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? tr("Đăng bài thất bại", "Posting failed"));
      setPostContent("");
      setPostAttachments([]);
      setPollOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollAllowMultiple(false);
      await refreshClass();
      toast.success(tr("Đã đăng bài lên bảng tin!", "Posted to the stream!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setPosting(false);
    }
  };

  const handleCloneClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneName.trim() || cloning) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/classes/${cls.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cloneName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Nhân bản lớp thất bại", "Clone failed"));
      toast.success(tr(`Đã tạo lớp bản sao "${json.class.name}"!`, `Cloned class "${json.class.name}"!`));
      setCloneOpen(false);
      router.push(`/teacher/classes/${json.class.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Nhân bản lớp thất bại", "Clone failed"));
    } finally {
      setCloning(false);
    }
  };

  const markLessonItemViewed = async (itemId: string) => {
    if (isTeacher) return;
    try {
      await fetch(`/api/lessons/items/${itemId}/progress`, { method: "POST" });
      setCls((prev) => ({
        ...prev,
        lessons: prev.lessons.map((l) => ({
          ...l,
          items: l.items.map((it) =>
            it.id === itemId ? { ...it, completedByMe: true } : it
          ),
        })),
      }));
    } catch {
      // silent non-blocking progress tracking
    }
  };

  const handleRegenerateCode = async () => {
    const res = await fetch(`/api/classes/${cls.id}/regenerate-code`, { method: "POST" });
    if (res.ok) {
      const json = await res.json();
      setCls((prev) => ({ ...prev, joinCode: json.joinCode }));
      toast.success(tr(`Đã tạo mã mới: ${json.joinCode}`, `New code created: ${json.joinCode}`));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDesc,
        requireApproval: editRequireApproval,
        enableGamification: editEnableGamification,
      }),
    });
    if (res.ok) {
      await refreshClass();
      toast.success(tr("Đã cập nhật cài đặt lớp học!", "Class settings updated!"));
    }
  };

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState("");
  const archiveNameMatches = archiveConfirm.trim() === cls.name.trim();

  const handleToggleArchive = async () => {
    const res = await fetch(`/api/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !cls.archived }),
    });
    if (res.ok) {
      setArchiveOpen(false);
      setArchiveConfirm("");
      await refreshClass();
      toast.success(cls.archived ? tr("Đã khôi phục lớp học!", "Class restored!") : tr("Đã lưu trữ lớp học!", "Class archived!"));
    } else {
      toast.error(vi.common.errorGeneric);
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteNameMatches = deleteConfirm.trim() === cls.name.trim();

  const handleDeleteClass = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/classes/${cls.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? vi.common.errorGeneric);
      toast.success(
        tr(
          `Đã chuyển lớp “${cls.name}” vào thùng rác (khôi phục trong ${TRASH_DAYS} ngày).`,
          `Class “${cls.name}” moved to the trash (restorable for ${TRASH_DAYS} days).`
        )
      );
      router.push("/teacher");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
      setDeleting(false);
    }
  };

  const handleApproveEnrollment = async (enrollmentId: string) => {
    const res = await fetch(`/api/classes/${cls.id}/enrollments/${enrollmentId}`, {
      method: "PATCH",
    });
    if (res.ok) {
      await refreshClass();
      toast.success(tr("Đã duyệt học sinh vào lớp!", "Student approved!"));
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    const res = await fetch(`/api/classes/${cls.id}/enrollments/${enrollmentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refreshClass();
      toast.success(tr("Đã xoá học sinh khỏi lớp.", "Student removed from the class."));
    }
  };

  const handleImportExcel = async (file: File) => {
    setImportingExcel(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/classes/${cls.id}/import-students`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Import thất bại", "Import failed"));
      toast.success(
        tr(`Đã thêm ${json.enrolledCount} học sinh vào lớp (tạo mới ${json.createdCount} tài khoản)!`, `Added ${json.enrolledCount} students to the class (${json.createdCount} new accounts)!`)
      );
      await refreshClass();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Import Excel thất bại", "Excel import failed"));
    } finally {
      setImportingExcel(false);
    }
  };

  const handleCreateParentCode = async (studentId: string, studentName: string) => {
    const res = await fetch("/api/parent/invite-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    const json = await res.json();
    if (res.ok) {
      setGeneratedParentCode({ studentName, code: json.invite.code });
      toast.success(tr(`Đã tạo mã phụ huynh: ${json.invite.code}`, `Parent code created: ${json.invite.code}`));
    } else {
      toast.error(json.error ?? tr("Không thể tạo mã", "Could not create the code"));
    }
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterTitle.trim()) return;
    const res = await fetch(`/api/classes/${cls.id}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: chapterTitle, description: chapterDesc || null }),
    });
    if (res.ok) {
      setChapterTitle("");
      setChapterDesc("");
      await refreshClass();
      toast.success(tr("Đã thêm chương bài giảng!", "Chapter added!"));
    }
  };

  const handleCreateLessonItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingItemLessonId || !itemTitle.trim()) return;
    setItemUploading(true);
    setItemUploadPct(null);

    try {
      // Option B: direct browser -> Google Drive resumable upload for large lesson videos
      if (itemType === "VIDEO" && itemFile && driveConnected) {
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        uploadJobIdRef.current = null;
        const job = await uploadDirectToDrive(itemFile, {
          classId: cls.id,
          lessonId: addingItemLessonId,
          kind: "video",
          signal: controller.signal,
          onJob: (jid) => {
            uploadJobIdRef.current = jid;
          },
          onProgress: (loaded, total) => {
            setItemUploadPct(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0);
          },
        });

        const res = await fetch(
          `/api/classes/${cls.id}/lessons/${addingItemLessonId}/items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: itemTitle.trim(),
              type: itemType,
              fileKey: job.storageKey,
              driveFileId: job.driveFileId,
              url: job.previewUrl ?? null,
            }),
          }
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? tr("Không thể thêm tài liệu", "Could not add the material"));
        }
      } else {
        const fd = new FormData();
        fd.append("title", itemTitle);
        fd.append("type", itemType);
        if (itemUrl.trim()) fd.append("url", itemUrl.trim());
        if (itemFile) fd.append("file", itemFile);

        const res = await fetch(
          `/api/classes/${cls.id}/lessons/${addingItemLessonId}/items`,
          { method: "POST", body: fd }
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? tr("Không thể thêm tài liệu", "Could not add the material"));
        }
      }

      setAddingItemLessonId(null);
      setItemTitle("");
      setItemUrl("");
      setItemFile(null);
      setItemUploadPct(null);
      await refreshClass();
      toast.success(tr("Đã thêm tài liệu bài giảng!", "Material added!"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info(tr("Đã huỷ tải video lên Drive.", "Drive video upload cancelled."));
      } else {
        toast.error(err instanceof Error ? err.message : tr("Không thể thêm tài liệu", "Could not add the material"));
      }
    } finally {
      uploadAbortRef.current = null;
      uploadJobIdRef.current = null;
      setItemUploading(false);
      setItemUploadPct(null);
    }
  };

  const activeStudents = cls.enrollments.filter((e) => e.status === "ACTIVE");
  const pendingStudents = cls.enrollments.filter((e) => e.status === "PENDING");
  const leaderboardHref = isTeacher
    ? `/teacher/classes/${cls.id}/leaderboard`
    : `/student/classes/${cls.id}/leaderboard`;

  return (
    <div className="space-y-6">
      <BackLink
        fallbackHref={isTeacher ? "/teacher" : "/student/classes"}
        label={tr("Lớp học", "Classes")}
        className="-mb-2"
      />
      {/* Stitch Class Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#3525CD] via-[#4F46E5] to-[#6366F1] p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold backdrop-blur">
                {tr("GV:", "Teacher:")} {cls.teacher.name}
              </span>
              {isTeacher && effectiveClassRole && effectiveClassRole !== "OWNER" && (
                <span className="rounded-full bg-sky-300/90 px-3 py-0.5 text-xs font-bold text-slate-900">
                  {effectiveClassRole === "ASSISTANT"
                    ? tr("Trợ giảng", "Assistant")
                    : tr("Đồng giáo viên", "Co-teacher")}
                </span>
              )}
              {cls.archived && (
                <span className="rounded-full bg-amber-400/90 px-3 py-0.5 text-xs font-bold text-slate-900">
                  {vi.classes.archived}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{cls.name}</h1>
            {cls.description && (
              <p className="max-w-2xl text-sm text-indigo-100">{cls.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isTeacher && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-100">
                    {vi.classes.joinCode}
                  </p>
                  <p className="font-mono text-lg font-extrabold tracking-widest">
                    {cls.joinCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(cls.joinCode);
                    toast.success(tr("Đã sao chép mã lớp!", "Class code copied!"));
                  }}
                  className="rounded-lg p-1.5 hover:bg-white/20"
                  title={tr("Sao chép mã", "Copy code")}
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleRegenerateCode()}
                  className="rounded-lg p-1.5 hover:bg-white/20"
                  title={vi.classes.regenerateCode}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            )}

            {isTeacher && (
              <Button variant="secondary" asChild>
                <Link href={`/teacher/classes/${cls.id}/omr`} data-testid="class-omr-link">
                  <ScanLine className="h-4 w-4 text-[#4F46E5]" />
                  {tr("Chấm phiếu giấy", "Paper sheets")}
                </Link>
              </Button>
            )}

            {isTeacher && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExitTicketOpen(true)}
                data-testid="exit-ticket-btn"
              >
                <Zap className="h-4 w-4 text-[#F97316]" />
                {tr("Hỏi nhanh", "Exit ticket")}
              </Button>
            )}

            <Button variant="secondary" asChild>
              <Link href={leaderboardHref}>
                <Trophy className="h-4 w-4 text-[#F97316]" />
                {vi.classes.tabs.leaderboard}
              </Link>
            </Button>

            {isTeacher && canEditClass && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCloneName(`${cls.name} (Bản sao)`);
                    setCloneOpen(true);
                  }}
                  data-testid="clone-class-btn"
                >
                  <CopyPlus className="h-4 w-4 text-[#4F46E5]" />
                  {tr("Nhân bản lớp", "Clone class")}
                </Button>
                <Button variant="accent" asChild>
                  <Link href={`/teacher/assignments/new?classId=${cls.id}`}>
                    <Plus className="h-4 w-4" />
                    {tr("Giao bài tập", "Assign work")}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Class Tabs */}
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="feed" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {vi.classes.tabs.feed} ({cls.posts.length})
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-1.5">
            <FileText className="h-4 w-4" />
            {vi.classes.tabs.assignments} ({cls.assignments.length})
          </TabsTrigger>
          <TabsTrigger value="lessons" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            {vi.classes.tabs.lessons} ({cls.lessons.length})
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5" data-testid="class-tab-schedule">
            <CalendarDays className="h-4 w-4" />
            {isTeacher ? tr("Lịch & Điểm danh", "Schedule & Attendance") : tr("Lịch học", "Schedule")}
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-1.5">
            <Users className="h-4 w-4" />
            {vi.classes.tabs.students} ({activeStudents.length})
            {isTeacher && pendingStudents.length > 0 && (
              <Badge variant="orange" className="ml-1">
                {pendingStudents.length}
              </Badge>
            )}
          </TabsTrigger>
          {isTeacher && (
            <>
              <TabsTrigger value="gradebook" className="gap-1.5" data-testid="class-tab-gradebook">
                <Table2 className="h-4 w-4" />
                {tr("Sổ điểm", "Gradebook")}
              </TabsTrigger>
              <TabsTrigger value="submissions" className="gap-1.5" data-testid="class-tab-submissions">
                <ClipboardCheck className="h-4 w-4" />
                {tr("Bài nộp", "Submissions")}
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5" data-testid="class-tab-analytics">
                <BarChart2 className="h-4 w-4" />
                {tr("Thống kê", "Analytics")}
              </TabsTrigger>
              <TabsTrigger value="behavior" className="gap-1.5" data-testid="class-tab-behavior">
                <Star className="h-4 w-4" />
                {tr("Sao thưởng", "Stars")}
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5" data-testid="class-tab-settings">
                <Settings className="h-4 w-4" />
                {vi.classes.tabs.settings}
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* TAB 1: CLASS FEED */}
        <TabsContent value="feed" className="space-y-4">
          <form onSubmit={handleCreatePost} className="stitch-card p-5 space-y-3">
            <Textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder={vi.classes.feed.placeholder}
              rows={3}
            />

            {postAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {postAttachments.map((att) => (
                  <span
                    key={att.key}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40 px-2.5 py-1 text-xs"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-[#4F46E5]" />
                    <span className="max-w-[180px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPostAttachments((prev) => prev.filter((a) => a.key !== att.key))
                      }
                      className="text-slate-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {pollOpen && (
              <div className="space-y-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5">
                <Input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder={tr("Câu hỏi bình chọn…", "Poll question…")}
                  className="h-9 text-xs"
                />
                <div className="space-y-1.5">
                  {pollOptions.map((opt, idx) => (
                    <Input
                      key={idx}
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((prev) =>
                          prev.map((o, i) => (i === idx ? e.target.value : o))
                        )
                      }
                      placeholder={tr(`Lựa chọn ${idx + 1}`, `Option ${idx + 1}`)}
                      className="h-9 text-xs"
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    {pollOptions.length < 8 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPollOptions((prev) => [...prev, ""])}
                      >
                        + {tr("Thêm lựa chọn", "Add option")}
                      </Button>
                    )}
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={pollAllowMultiple}
                        onChange={(e) => setPollAllowMultiple(e.target.checked)}
                      />
                      <span>{tr("Chọn nhiều", "Allow multiple")}</span>
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPollOpen(false)}
                  >
                    {tr("Bỏ poll", "Remove poll")}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-[#464555] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Paperclip className="h-3.5 w-3.5" />
                  {uploadingPostFile ? tr("Đang tải…", "Uploading…") : tr("Đính kèm ảnh/PDF/Word", "Attach image/PDF/Word")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.pdf,.docx"
                    className="hidden"
                    disabled={uploadingPostFile}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadPostAttachment(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {!pollOpen && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPollOpen(true)}
                  >
                    <BarChart2 className="h-3.5 w-3.5 text-[#4F46E5]" />
                    {tr("Thêm bình chọn", "Add poll")}
                  </Button>
                )}
              </div>
              <Button type="submit" disabled={posting || !postContent.trim()}>
                <Send className="h-4 w-4" />
                {vi.classes.feed.postButton}
              </Button>
            </div>
          </form>

          {cls.posts.length === 0 ? (
            <div className="stitch-card p-10 text-center text-sm text-slate-400">
              {vi.classes.feed.empty}
            </div>
          ) : (
            cls.posts.map((post) => (
              <PostCard
                key={post.id}
                classId={cls.id}
                post={post}
                isTeacher={isTeacher}
                canModerate={isTeacher && canEditClass}
                currentUserId={currentUserId}
                onPostUpdated={(updated) => {
                  setCls((prev) => ({
                    ...prev,
                    posts: prev.posts
                      .map((p) => (p.id === updated.id ? updated : p))
                      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))),
                  }));
                }}
                onPostDeleted={(postId) => {
                  setCls((prev) => ({
                    ...prev,
                    posts: prev.posts.filter((p) => p.id !== postId),
                  }));
                }}
                onCommentAdded={(postId, comment) => {
                  setCls((prev) => ({
                    ...prev,
                    posts: prev.posts.map((p) =>
                      p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
                    ),
                  }));
                }}
              />
            ))
          )}
        </TabsContent>

        {/* TAB 2: ASSIGNMENTS */}
        <TabsContent value="assignments" className="space-y-3">
          {!isTeacher && <MyOmrScansCard classId={cls.id} />}
          {isTeacher && canEditClass && (
            <div className="stitch-card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
                  {tr("Giao bài tập cho lớp", "Assign work to this class")}
                </p>
                <p className="text-xs text-[#464555] dark:text-slate-400">
                  {tr(
                    "Giao nhanh bài tập SGK bằng ảnh chụp trang sách hoặc tạo bài từ kho phiếu.",
                    "Assign textbook homework in seconds or configure a full worksheet assignment."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-10"
                  data-testid="open-quick-textbook-btn"
                  onClick={() => setQuickModalOpen(true)}
                >
                  <BookOpenCheck className="h-4 w-4 text-[#4F46E5]" />
                  {tr("Giao bài nhanh theo SGK", "Quick textbook assign")}
                </Button>
                <Button variant="accent" className="min-h-10" asChild>
                  <Link href={`/teacher/assignments/new?classId=${cls.id}`}>
                    <Plus className="h-4 w-4" />
                    {tr("Giao bài đầy đủ", "Full assignment")}
                  </Link>
                </Button>
              </div>
            </div>
          )}
          {cls.assignments.length === 0 ? (
            <div className="stitch-card p-10 text-center text-sm text-slate-400">
              {tr("Chưa có bài tập nào được giao trong lớp này.", "No assignments in this class yet.")}
            </div>
          ) : (
            cls.assignments.map((asg) => {
              const proctorSummary = describeProctorRuleSummary(asg, tr);
              const needsRules =
                asg.proctorMode !== "OFF" ||
                Boolean(asg.requireCamera) ||
                Boolean(asg.requireMicMonitor);
              const studentTarget = needsRules
                ? `/student/assignments/${asg.id}/rules`
                : `/student/assignments/${asg.id}/do`;

              return (
                <div
                  key={asg.id}
                  className="stitch-card-hover flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">{asg.title}</h3>
                      {asg.isQuickTextbook && (
                        <Badge variant="mint">
                          <BookOpenCheck className="mr-1 h-3 w-3" />
                          SGK
                        </Badge>
                      )}
                      {asg.workbook && (
                        isTeacher ? (
                          <Link href={`/teacher/classes/${cls.id}/workbooks/${asg.workbook.id}`}>
                            <Badge variant="indigo">
                              <BookMarked className="mr-1 h-3 w-3" />
                              {asg.workbook.title}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge variant="indigo">
                            <BookMarked className="mr-1 h-3 w-3" />
                            {asg.workbook.title}
                          </Badge>
                        )
                      )}
                      {needsRules && (
                        <Badge variant="danger">
                          <Lock className="h-3 w-3" />
                          {vi.proctor.badge}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#464555]">
                      <span>{asg.worksheet._count.fields} {tr("câu hỏi", "questions")}</span>
                      {asg.timeLimitMin && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                          {asg.timeLimitMin} {tr("phút", "min")}
                        </span>
                      )}
                      {asg.dueAt && <span>{tr("Hạn nộp:", "Due:")} {formatDateTime(asg.dueAt)}</span>}
                    </div>
                    {proctorSummary && (
                      <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#BA1A1A]">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {proctorSummary}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isTeacher && (
                      <>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/teacher/assignments/new?edit=${asg.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                            {tr("Sửa", "Edit")}
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/teacher/assignments/new?worksheetId=${asg.worksheet.id}&classId=${cls.id}`}
                            title={tr("Giao lại phiếu này thành một bài mới", "Assign this worksheet again as a new assignment")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {tr("Giao lại", "Assign again")}
                          </Link>
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`${leaderboardHref}?assignmentId=${asg.id}`}>
                        <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                        {tr("Xếp hạng", "Leaderboard")}
                      </Link>
                    </Button>
                    {isTeacher ? (
                      <>
                        {(asg.proctorMode !== "OFF" ||
                          asg.requireCamera ||
                          asg.requireMicMonitor) && (
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/teacher/assignments/${asg.id}/live`}>
                              <Radio className="h-3.5 w-3.5 text-red-500" />
                              {tr("Giám sát Live", "Live proctoring")}
                            </Link>
                          </Button>
                        )}
                        <Button size="sm" asChild>
                          <Link href={`/teacher/assignments/${asg.id}/grading`}>
                            {tr("Chấm & Kết quả (", "Grades & results (")}{asg._count.submissions})
                          </Link>
                        </Button>
                      </>
                    ) : asg.isLockedByPrerequisite ? (
                      <Button size="sm" variant="outline" disabled data-testid={`locked-asg-btn-${asg.id}`}>
                        <Lock className="h-3.5 w-3.5" />
                        {tr("Nộp bài trước để mở", "Submit previous to unlock")}
                      </Button>
                    ) : (
                      <Button variant="accent" size="sm" asChild>
                        <Link href={studentTarget}>{tr("Vào làm bài →", "Start →")}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* TAB 3: LESSONS */}
        <TabsContent value="lessons" className="space-y-4">
          {isTeacher && (
            <form onSubmit={handleCreateChapter} className="stitch-card p-5 space-y-3">
              <h3 className="text-sm font-bold text-[#0B1C30]">
                {vi.lessons.createChapter}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder={tr("VD: Chương 2: Passive Voice & Reading", "e.g. Chapter 2: Passive Voice & Reading")}
                  required
                />
                <Input
                  value={chapterDesc}
                  onChange={(e) => setChapterDesc(e.target.value)}
                  placeholder={tr("Mô tả ngắn (tuỳ chọn)", "Short description (optional)")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm">
                  <Plus className="h-4 w-4" />
                  {vi.lessons.createChapter}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
                  <Library className="h-4 w-4" />
                  {tr("Thêm từ kho bài giảng", "Add from lesson library")}
                </Button>
                <Link
                  href="/teacher/worksheets?tab=lessons"
                  className="inline-flex min-h-9 items-center px-2 text-xs font-semibold text-[#3525CD] hover:underline"
                >
                  {tr("Quản lý kho bài giảng →", "Manage lesson library →")}
                </Link>
              </div>
              <p className="text-[11px] text-[#464555]">
                {tr(
                  "Chương mới được lưu vào Kho lưu trữ › Bài giảng, có thể giao tiếp cho lớp khác. Sửa ở một nơi, mọi lớp đều cập nhật.",
                  "New chapters are saved to Library › Lessons and can be given to other classes. Edit once, every class updates."
                )}
              </p>
            </form>
          )}

          {cls.lessons.length === 0 ? (
            <div className="stitch-card p-10 text-center text-sm text-slate-400">
              {vi.lessons.empty}
            </div>
          ) : (
            cls.lessons.map((lesson) => (
              <div key={lesson.id} className="stitch-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1C30]">{lesson.title}</h3>
                    {lesson.description && (
                      <p className="mt-0.5 text-xs text-[#464555]">{lesson.description}</p>
                    )}
                  </div>
                  {isTeacher && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canEditLesson(lesson) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setAddingItemLessonId(lesson.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {vi.lessons.addItem}
                        </Button>
                      ) : (
                        <Badge variant="neutral">
                          {tr("Bài giảng của", "Lesson by")} {lesson.owner?.name ?? tr("giáo viên khác", "another teacher")}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title={tr("Gỡ khỏi lớp này (vẫn còn trong kho)", "Remove from this class (stays in the library)")}
                        onClick={() => setRemovingLesson({ id: lesson.id, title: lesson.title })}
                      >
                        <Trash2 className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-[#464555]">{tr("Gỡ khỏi lớp", "Remove")}</span>
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {lesson.items.map((item) => {
                    const ytEmbed =
                      item.type === "VIDEO" && item.url ? extractYoutubeEmbed(item.url) : null;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200/80 bg-[#F8F9FF] p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
                              {item.type === "PDF" && <FileText className="h-4 w-4" />}
                              {item.type === "VIDEO" && <Film className="h-4 w-4" />}
                              {item.type === "AUDIO" && <Headphones className="h-4 w-4" />}
                              {item.type === "LINK" && <ExternalLink className="h-4 w-4" />}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-[#0B1C30]">{item.title}</p>
                              <p className="text-[11px] text-slate-500">
                                {vi.lessons.types[item.type]}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {!isTeacher && item.completedByMe && (
                              <Badge variant="mint" data-testid={`lesson-done-${item.id}`}>
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                {tr("Đã học", "Completed")}
                              </Badge>
                            )}
                            {isTeacher && typeof item.completedCount === "number" && (
                              <Badge variant="neutral">
                                {item.completedCount}/{cls.lessonActiveStudentCount ?? activeStudents.length}{" "}
                                {tr("HS đã xem", "viewed")}
                              </Badge>
                            )}
                            {item.type === "PDF" && item.fileKey && (
                              <Button
                                size="sm"
                                variant="secondary"
                                data-testid={`lesson-view-pdf-${item.id}`}
                                onClick={() => {
                                  void markLessonItemViewed(item.id);
                                  setViewingPdf({ fileKey: item.fileKey!, title: item.title });
                                }}
                              >
                                {tr("Xem PDF", "View PDF")}
                              </Button>
                            )}
                            {item.type === "LINK" && item.url && (
                              <Button size="sm" variant="outline" asChild>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  data-testid={`lesson-open-link-${item.id}`}
                                  onClick={() => void markLessonItemViewed(item.id)}
                                >
                                  {tr("Mở liên kết", "Open link")} <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            {!isTeacher && !item.completedByMe && (item.type === "VIDEO" || item.type === "AUDIO") && (
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`lesson-mark-done-${item.id}`}
                                onClick={() => void markLessonItemViewed(item.id)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                {tr("Đánh dấu đã học", "Mark complete")}
                              </Button>
                            )}
                            {canEditLesson(lesson) && (
                              <button
                                type="button"
                                aria-label={tr("Xoá tài liệu", "Delete material")}
                                onClick={async () => {
                                  await fetch(
                                    `/api/classes/${cls.id}/lessons/${lesson.id}/items/${item.id}`,
                                    { method: "DELETE" }
                                  );
                                  await refreshClass();
                                }}
                                className="rounded p-1 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {ytEmbed && (
                          <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200">
                            <iframe
                              src={ytEmbed}
                              title={item.title}
                              className="h-full w-full"
                              allowFullScreen
                            />
                          </div>
                        )}

                        {item.type === "VIDEO" && !ytEmbed && item.fileKey && (
                          <video
                            controls
                            src={`/api/files/${item.fileKey}`}
                            className="max-h-80 w-full max-w-2xl rounded-xl"
                          />
                        )}

                        {item.type === "AUDIO" && (item.fileKey || item.url) && (
                          <audio
                            controls
                            src={item.fileKey ? `/api/files/${item.fileKey}` : (item.url ?? "")}
                            className="w-full max-w-xl"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* TAB 4: STUDENTS ROSTER */}
        <TabsContent value="students" className="space-y-4">
          {isTeacher && (
            <div className="stitch-card p-5">
              <CreateAccountForm
                endpoint={`/api/classes/${cls.id}/accounts`}
                roles={["STUDENT", "PARENT"]}
                students={activeStudents.map((e) => ({
                  id: e.student.id,
                  name: e.student.name,
                  email: e.student.email ?? "",
                }))}
                onCreated={() => void refreshClass()}
                title={tr("Tạo tài khoản Học sinh / Phụ huynh", "Create student / parent account")}
                description={tr(
                  "Học sinh mới được thêm thẳng vào lớp này. Phụ huynh được liên kết với học sinh bạn chọn (nếu email phụ huynh đã có thì chỉ liên kết thêm).",
                  "New students are enrolled in this class. Parents are linked to the chosen student (an existing parent email is just linked)."
                )}
              />
            </div>
          )}
          {isTeacher && (
            <div className="stitch-card flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h3 className="text-sm font-bold text-[#0B1C30]">
                  {vi.classes.roster.importExcel}
                </h3>
                <p className="mt-0.5 text-xs text-[#464555]">
                  {vi.classes.roster.importHint}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#EEF2FF] px-4 py-2 text-xs font-bold text-[#3525CD] hover:bg-[#E2DFFF]">
                <Upload className="h-4 w-4" />
                {importingExcel ? tr("Đang nhập…", "Importing…") : tr("Chọn file .xlsx", "Choose .xlsx file")}
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImportExcel(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}

          {isTeacher && pendingStudents.length > 0 && (
            <div className="stitch-card border-amber-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-amber-800">
                {tr("Yêu cầu chờ duyệt (", "Pending requests (")}{pendingStudents.length})
              </h3>
              <div className="divide-y divide-slate-100">
                {pendingStudents.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-[#0B1C30]">{e.student.name}</p>
                      <p className="text-xs text-slate-400">{e.student.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleApproveEnrollment(e.id)}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {vi.classes.roster.approve}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRemoveEnrollment(e.id)}
                      >
                        {vi.classes.roster.reject}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stitch-card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h3 className="text-sm font-bold text-[#0B1C30]">
                {tr("Danh sách học sinh (", "Students (")}{activeStudents.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {activeStudents.map((e) => (
                <div key={e.id} className="px-5 py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {e.student.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.student.avatarUrl}
                          alt={e.student.name}
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-white"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-bold text-[#3525CD]">
                          {getInitials(e.student.name)}
                        </span>
                      )}
                      <div>
                        {isTeacher ? (
                          <button
                            type="button"
                            onClick={() =>
                              setProgressStudent({ id: e.student.id, name: e.student.name })
                            }
                            className="text-left text-sm font-semibold text-[#3525CD] dark:text-indigo-300 hover:underline"
                          >
                            {e.student.name}
                          </button>
                        ) : (
                          <p className="text-sm font-semibold text-[#0B1C30]">{e.student.name}</p>
                        )}
                        {e.student.email && (
                          <p className="text-xs text-slate-400">{e.student.email}</p>
                        )}
                      </div>
                    </div>
                    {isTeacher && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setProgressStudent({ id: e.student.id, name: e.student.name })
                          }
                        >
                          <TrendingUp className="h-3.5 w-3.5 text-[#4F46E5]" />
                          {tr("Tiến bộ", "Progress")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setResetTarget({
                              id: e.student.id,
                              name: e.student.name,
                              email: e.student.email,
                              roleLabel: vi.roles.STUDENT,
                            })
                          }
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {tr("Đặt lại mật khẩu", "Reset password")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void handleCreateParentCode(e.student.id, e.student.name)
                          }
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {vi.classes.roster.createParentCode}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => void handleRemoveEnrollment(e.id)}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          {tr("Xoá", "Remove")}
                        </Button>
                      </div>
                    )}
                  </div>
                  {isTeacher &&
                    e.student.parentLinksAsChild &&
                    e.student.parentLinksAsChild.length > 0 && (
                      <div className="ml-12 space-y-1.5">
                        {e.student.parentLinksAsChild.map((link) => (
                          <div
                            key={link.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F8F9FF] px-3 py-1.5 text-xs"
                          >
                            <div className="text-[#464555]">
                              <span className="font-semibold text-[#0B1C30]">
                                {link.parent.name}
                              </span>{" "}
                              ({link.relation ?? vi.roles.PARENT}) ·{" "}
                              <span className="text-slate-400">{link.parent.email}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px]"
                              onClick={() =>
                                setResetTarget({
                                  id: link.parent.id,
                                  name: link.parent.name,
                                  email: link.parent.email,
                                  roleLabel: link.relation ?? vi.roles.PARENT,
                                })
                              }
                            >
                              <KeyRound className="h-3 w-3" />
                              {tr("Đặt lại MK", "Reset password")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* SCHEDULE & ATTENDANCE TAB */}
        <TabsContent value="schedule">
          <ClassScheduleTab
            classId={cls.id}
            className={cls.name}
            isTeacher={isTeacher}
            canEditSchedule={canEditClass}
            lessons={cls.lessons.map((l) => ({ id: l.id, title: l.title }))}
            assignments={cls.assignments.map((a) => ({ id: a.id, title: a.title }))}
          />
        </TabsContent>

        {/* TAB 5, 6 & 7: GRADEBOOK, SUBMISSIONS & ANALYTICS (TEACHER ONLY) */}
        {isTeacher && (
          <>
            <TabsContent value="behavior">
              <ClassBehaviorTab classId={cls.id} canManagePresets={canEditClass} />
            </TabsContent>
            <TabsContent value="gradebook">
              <ClassGradebookTab
                classId={cls.id}
                canManageColumns={canEditClass}
                from={gradebookRange.from}
                to={gradebookRange.to}
                onRangeChange={setGradebookRange}
                onOpenStudentProgress={setProgressStudent}
              />
            </TabsContent>
            <TabsContent value="submissions">
              <ClassSubmissionsTab
                classId={cls.id}
                assignments={cls.assignments.map((a) => ({ id: a.id, title: a.title }))}
                students={activeStudents.map((e) => ({ id: e.student.id, name: e.student.name }))}
              />
            </TabsContent>
            <TabsContent value="analytics">
              <ClassAnalyticsTab
                classId={cls.id}
                workbooks={cls.workbooks ?? []}
              />
            </TabsContent>
          </>
        )}

        {/* TAB 7: SETTINGS (TEACHER ONLY) */}
        {isTeacher && (
          <TabsContent value="settings" className="space-y-6">
            <ClassTeachersSection
              classId={cls.id}
              owner={cls.teacher}
              initialTeachers={cls.classTeachers ?? []}
              canManage={canManageTeachersOrDanger}
            />

            <form onSubmit={handleSaveSettings} className="stitch-card max-w-2xl p-6 space-y-5">
              <div className="space-y-1.5">
                <Label>{vi.classes.name}</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required disabled={!canEditClass} />
              </div>
              <div className="space-y-1.5">
                <Label>{vi.classes.description}</Label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  disabled={!canEditClass}
                />
              </div>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div>
                  <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
                    {vi.classes.requireApproval}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tr("Khi bật, học sinh nhập mã sẽ ở trạng thái Chờ duyệt.", "When on, students who enter the code wait for approval.")}
                  </p>
                </div>
                <Switch
                  checked={editRequireApproval}
                  onCheckedChange={setEditRequireApproval}
                  disabled={!canEditClass}
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div>
                  <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
                    {tr("Chuỗi học tập & Huy hiệu (Gamification)", "Study Streak & Badges (Gamification)")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tr("Hiển thị chuỗi ngày học và huy hiệu khích lệ học sinh trên bảng điều khiển.", "Display study streak and motivational badges on the student dashboard.")}
                  </p>
                </div>
                <Switch
                  checked={editEnableGamification}
                  onCheckedChange={setEditEnableGamification}
                  disabled={!canEditClass}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  {canManageTeachersOrDanger && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => (cls.archived ? void handleToggleArchive() : setArchiveOpen(true))}
                    >
                      <Archive className="h-4 w-4" />
                      {cls.archived ? vi.classes.unarchive : vi.classes.archive}
                    </Button>
                  )}
                  {canEditClass && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCloneName(`${cls.name} (Bản sao)`);
                        setCloneOpen(true);
                      }}
                    >
                      <CopyPlus className="h-4 w-4" />
                      {tr("Nhân bản lớp", "Clone class")}
                    </Button>
                  )}
                </div>
                {canEditClass && (
                  <Button type="submit">
                    <Check className="h-4 w-4" />
                    {tr("Lưu thay đổi", "Save changes")}
                  </Button>
                )}
              </div>

              {/* Danger zone: delete = move to the 30-day trash (OWNER/ADMIN only) */}
              {canManageTeachersOrDanger && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#BA1A1A]">{tr("Xoá lớp học", "Delete class")}</p>
                    <p className="text-xs text-[#464555] dark:text-slate-300">
                      {tr(
                        `Lớp vào thùng rác ${TRASH_DAYS} ngày (khôi phục ở Lớp học › Thùng rác lớp học hoặc Kho lưu trữ › Thùng rác), sau đó xoá hẳn cùng bài đã giao, bài nộp, bảng tin và danh sách học sinh. Bài giảng vẫn ở trong kho.`,
                        `The class goes to the trash for ${TRASH_DAYS} days (restore it from Classes › Class trash or Library › Trash), then it is deleted with its assignments, submissions, posts and roster. Lessons stay in your library.`
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    data-testid="delete-class-btn"
                  >
                    <Trash2 className="h-4 w-4" />
                    {tr("Xoá lớp", "Delete class")}
                  </Button>
                </div>
              )}
            </form>
          </TabsContent>
        )}
      </Tabs>

      {/* Clone Class Dialog */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Nhân bản lớp học", "Clone class")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCloneClass} className="space-y-4">
            <p className="text-xs text-[#464555] dark:text-slate-300">
              {tr(
                "Tạo lớp mới với toàn bộ chương bài giảng và cài đặt của lớp hiện tại (không sao chép học sinh, bài đăng và bài nộp cũ).",
                "Create a new class keeping all lesson chapters and settings (without copying students, posts, or past submissions)."
              )}
            </p>
            <div className="space-y-1.5">
              <Label>{tr("Tên lớp mới", "New class name")}</Label>
              <Input
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloneOpen(false)}>
                {vi.common.cancel}
              </Button>
              <Button type="submit" disabled={cloning || !cloneName.trim()}>
                <CopyPlus className="h-4 w-4" />
                {cloning ? tr("Đang tạo…", "Cloning…") : tr("Nhân bản", "Clone")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm archiving (closing) the class: the teacher must type the class name */}
      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          setArchiveOpen(open);
          if (!open) setArchiveConfirm("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Lưu trữ (đóng) lớp học?", "Archive (close) this class?")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (archiveNameMatches) void handleToggleArchive();
            }}
            className="space-y-4"
          >
            <p className="text-sm text-[#464555]">
              {tr(
                "Học sinh sẽ không thể dùng mã lớp để tham gia nữa và lớp chuyển sang mục Đã lưu trữ. Bạn có thể khôi phục sau.",
                "Students can no longer join with the class code and the class moves to Archived. You can restore it later."
              )}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="archive-confirm">
                {tr("Nhập tên lớp để xác nhận:", "Type the class name to confirm:")}{" "}
                <span className="font-bold text-[#0B1C30]">{cls.name}</span>
              </Label>
              <Input
                id="archive-confirm"
                value={archiveConfirm}
                onChange={(e) => setArchiveConfirm(e.target.value)}
                autoComplete="off"
                autoFocus
                placeholder={cls.name}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)}>
                {vi.common.cancel}
              </Button>
              <Button type="submit" variant="destructive" disabled={!archiveNameMatches}>
                <Archive className="h-4 w-4" />
                {vi.classes.archive}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete the class: the teacher must type the class name; it goes to the 30-day trash */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirm("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá lớp học?", "Delete this class?")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (deleteNameMatches) void handleDeleteClass();
            }}
            className="space-y-4"
          >
            <p className="text-sm text-[#464555]">
              {tr(
                `Lớp sẽ biến mất với bạn, học sinh và phụ huynh. Trong ${TRASH_DAYS} ngày bạn có thể khôi phục nguyên vẹn ở mục Lớp học › Thùng rác lớp học (hoặc Kho lưu trữ › Thùng rác); sau đó lớp bị xoá hẳn cùng bài đã giao, bài nộp, bảng tin và danh sách học sinh. Bài giảng của lớp vẫn nằm trong kho của bạn.`,
                `The class disappears for you, students and parents. For ${TRASH_DAYS} days you can restore it intact from Classes › Class trash (or Library › Trash); after that it is deleted with its assignments, submissions, posts and roster. Its lessons stay in your library.`
              )}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-class-confirm">
                {tr("Nhập tên lớp để xác nhận:", "Type the class name to confirm:")}{" "}
                <span className="font-bold text-[#0B1C30]">{cls.name}</span>
              </Label>
              <Input
                id="delete-class-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
                autoFocus
                placeholder={cls.name}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                {vi.common.cancel}
              </Button>
              <Button type="submit" variant="destructive" disabled={!deleteNameMatches || deleting}>
                <Trash2 className="h-4 w-4" />
                {deleting ? tr("Đang xoá…", "Deleting…") : tr("Xoá lớp", "Delete class")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove a lesson from this class (it stays in the library) */}
      <Dialog open={Boolean(removingLesson)} onOpenChange={(open) => !open && setRemovingLesson(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Gỡ bài giảng khỏi lớp?", "Remove lesson from this class?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#464555]">
            {tr(
              `“${removingLesson?.title ?? ""}” sẽ không còn hiện trong lớp ${cls.name}. Bài giảng và tài liệu vẫn nằm trong Kho lưu trữ và trong các lớp khác.`,
              `“${removingLesson?.title ?? ""}” will no longer show in ${cls.name}. The lesson and its files stay in the library and in other classes.`
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingLesson(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!removingLesson) return;
                const res = await fetch(`/api/classes/${cls.id}/lessons/${removingLesson.id}`, {
                  method: "DELETE",
                });
                setRemovingLesson(null);
                if (res.ok) {
                  toast.success(tr("Đã gỡ bài giảng khỏi lớp.", "Lesson removed from the class."));
                  await refreshClass();
                } else {
                  toast.error(tr("Không gỡ được bài giảng.", "Could not remove the lesson."));
                }
              }}
            >
              {tr("Gỡ khỏi lớp", "Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isTeacher && (
        <AddLessonsFromLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          classId={cls.id}
          existingLessonIds={cls.lessons.map((l) => l.id)}
          onAdded={refreshClass}
        />
      )}

      {/* Add Lesson Item Dialog */}
      <Dialog
        open={Boolean(addingItemLessonId)}
        onOpenChange={(open) => !open && setAddingItemLessonId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.lessons.addItem}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateLessonItem} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{vi.lessons.itemTitle}</Label>
              <Input
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                required
                placeholder="VD: Listening Section 1 Audio"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{vi.lessons.itemType}</Label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as LessonItemType)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value="PDF">{vi.lessons.types.PDF}</option>
                <option value="VIDEO">{vi.lessons.types.VIDEO}</option>
                <option value="AUDIO">{vi.lessons.types.AUDIO}</option>
                <option value="LINK">{vi.lessons.types.LINK}</option>
              </select>
            </div>
            {itemType !== "LINK" && (
              <div className="space-y-1.5">
                <Label>{tr("Tải file lên (PDF / MP4 / MP3)", "Upload a file (PDF / MP4 / MP3)")}</Label>
                <Input
                  type="file"
                  accept={
                    itemType === "PDF"
                      ? ".pdf,application/pdf"
                      : itemType === "VIDEO"
                        ? "video/mp4,video/webm"
                        : "audio/*"
                  }
                  onChange={(e) => setItemFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
            {itemType !== "PDF" && (
              <div className="space-y-1.5">
                <Label>{tr("Hoặc dán đường dẫn URL (YouTube / Audio / Web)", "Or paste a URL (YouTube / audio / web)")}</Label>
                <Input
                  type="url"
                  value={itemUrl}
                  onChange={(e) => setItemUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
            {itemUploadPct !== null && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-[#3525CD] font-semibold">
                  <span>{tr("Đang tải video trực tiếp lên Google Drive…", "Uploading video directly to Google Drive…")}</span>
                  <span className="tabular-nums">{itemUploadPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#4F46E5] transition-all"
                    style={{ width: `${itemUploadPct}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (itemUploading) {
                    uploadAbortRef.current?.abort();
                    if (uploadJobIdRef.current) {
                      void cancelDirectDriveUpload(uploadJobIdRef.current);
                    }
                  } else {
                    setAddingItemLessonId(null);
                  }
                }}
              >
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={itemUploading}>
                {itemUploading ? tr("Đang tải lên…", "Uploading…") : tr("Thêm tài liệu", "Add material")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generated Parent Invite Code Dialog */}
      <Dialog
        open={Boolean(generatedParentCode)}
        onOpenChange={(open) => !open && setGeneratedParentCode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Mã liên kết phụ huynh", "Parent link code")}</DialogTitle>
          </DialogHeader>
          {generatedParentCode && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-[#464555]">
                {tr("Gửi mã sau cho phụ huynh của", "Send this code to the parent of")} <strong>{generatedParentCode.studentName}</strong>{" "}
                {tr("(hạn sử dụng 7 ngày, dùng một lần):", "(valid 7 days, single use):")}
              </p>
              <div className="rounded-2xl bg-[#EEF2FF] py-4 font-mono text-2xl font-extrabold tracking-widest text-[#3525CD]">
                {generatedParentCode.code}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  navigator.clipboard?.writeText(generatedParentCode.code);
                  toast.success(tr("Đã sao chép mã liên kết!", "Link code copied!"));
                }}
              >
                <Copy className="h-4 w-4" />
                {tr("Sao chép mã", "Copy code")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Teacher Reset Student / Parent Password Dialog */}
      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
      />

      {/* Lesson PDF Built-in Canvas Viewer Modal */}
      {viewingPdf && (
        <LessonPdfModal
          fileKey={viewingPdf.fileKey}
          title={viewingPdf.title}
          onClose={() => setViewingPdf(null)}
        />
      )}

      {/* Phase 21: Quick Textbook Assignment Modal & Student Progress Profile */}
      {isTeacher && (
        <>
          <QuickTextbookModal
            open={quickModalOpen}
            onOpenChange={setQuickModalOpen}
            classes={[{ id: cls.id, name: cls.name }]}
            defaultClassId={cls.id}
            onCreated={() => void refreshClass()}
          />
          <StudentProgressDrawer
            classId={cls.id}
            student={progressStudent}
            from={gradebookRange.from}
            to={gradebookRange.to}
            onClose={() => setProgressStudent(null)}
          />
        </>
      )}
      {isTeacher && (
        <ExitTicketDialog classId={cls.id} open={exitTicketOpen} onOpenChange={setExitTicketOpen} />
      )}
    </div>
  );
}
