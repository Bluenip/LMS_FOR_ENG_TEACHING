"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  BookOpen,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Film,
  Headphones,
  KeyRound,
  Lock,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { describeProctorRuleSummary } from "@/lib/proctor-helpers";
import { formatDateTime, getInitials } from "@/lib/utils";
import { vi } from "@/messages/vi";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfCanvasPage, usePdfDocument } from "@/components/worksheet/PdfCanvasPage";
import type { LessonItemType, ProctorMode, ViolationAction } from "@prisma/client";

export interface ClassDetailData {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  archived: boolean;
  requireApproval: boolean;
  teacher: { id: string; name: string; email: string };
  enrollments: Array<{
    id: string;
    status: "ACTIVE" | "PENDING";
    joinedAt: string;
    student: { id: string; name: string; email?: string };
  }>;
  posts: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string; role: string };
    comments: Array<{
      id: string;
      content: string;
      createdAt: string;
      author: { id: string; name: string; role: string };
    }>;
  }>;
  lessons: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    items: Array<{
      id: string;
      title: string;
      type: LessonItemType;
      fileKey: string | null;
      url: string | null;
      order: number;
    }>;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    timeLimitMin: number | null;
    proctorMode: ProctorMode;
    violationAction: ViolationAction;
    maxViolations: number;
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
          {loading && <p className="text-center text-sm text-slate-400">Đang tải PDF…</p>}
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

export function ClassDetailView({
  initialClass,
  isTeacher,
  currentUserId,
}: {
  initialClass: ClassDetailData;
  isTeacher: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [cls, setCls] = useState<ClassDetailData>(initialClass);

  // Feed state
  const [postContent, setPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Lesson creation state
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDesc, setChapterDesc] = useState("");
  const [addingItemLessonId, setAddingItemLessonId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<LessonItemType>("PDF");
  const [itemUrl, setItemUrl] = useState("");
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ fileKey: string; title: string } | null>(null);

  // Settings state
  const [editName, setEditName] = useState(cls.name);
  const [editDesc, setEditDesc] = useState(cls.description ?? "");
  const [editRequireApproval, setEditRequireApproval] = useState(cls.requireApproval);
  const [importingExcel, setImportingExcel] = useState(false);
  const [generatedParentCode, setGeneratedParentCode] = useState<{
    studentName: string;
    code: string;
  } | null>(null);

  const refreshClass = async () => {
    const res = await fetch(`/api/classes/${cls.id}`);
    if (res.ok) {
      const json = await res.json();
      setCls(json.class);
    }
    router.refresh();
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/classes/${cls.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: postContent }),
      });
      if (!res.ok) throw new Error("Đăng bài thất bại");
      setPostContent("");
      await refreshClass();
      toast.success("Đã đăng bài lên bảng tin!");
    } catch {
      toast.error(vi.common.errorGeneric);
    } finally {
      setPosting(false);
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = (commentDrafts[postId] ?? "").trim();
    if (!text) return;
    const res = await fetch(`/api/classes/${cls.id}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (res.ok) {
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      await refreshClass();
    }
  };

  const handleRegenerateCode = async () => {
    const res = await fetch(`/api/classes/${cls.id}/regenerate-code`, { method: "POST" });
    if (res.ok) {
      const json = await res.json();
      setCls((prev) => ({ ...prev, joinCode: json.joinCode }));
      toast.success(`Đã tạo mã mới: ${json.joinCode}`);
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
      }),
    });
    if (res.ok) {
      await refreshClass();
      toast.success("Đã cập nhật cài đặt lớp học!");
    }
  };

  const handleToggleArchive = async () => {
    const res = await fetch(`/api/classes/${cls.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !cls.archived }),
    });
    if (res.ok) {
      await refreshClass();
      toast.success(cls.archived ? "Đã khôi phục lớp học!" : "Đã lưu trữ lớp học!");
    }
  };

  const handleApproveEnrollment = async (enrollmentId: string) => {
    const res = await fetch(`/api/classes/${cls.id}/enrollments/${enrollmentId}`, {
      method: "PATCH",
    });
    if (res.ok) {
      await refreshClass();
      toast.success("Đã duyệt học sinh vào lớp!");
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    const res = await fetch(`/api/classes/${cls.id}/enrollments/${enrollmentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refreshClass();
      toast.success("Đã xoá học sinh khỏi lớp.");
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
      if (!res.ok) throw new Error(json.error ?? "Import thất bại");
      toast.success(
        `Đã thêm ${json.enrolledCount} học sinh vào lớp (tạo mới ${json.createdCount} tài khoản)!`
      );
      await refreshClass();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import Excel thất bại");
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
      toast.success(`Đã tạo mã phụ huynh: ${json.invite.code}`);
    } else {
      toast.error(json.error ?? "Không thể tạo mã");
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
      toast.success("Đã thêm chương bài giảng!");
    }
  };

  const handleCreateLessonItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingItemLessonId || !itemTitle.trim()) return;
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
      toast.error(json.error ?? "Không thể thêm tài liệu");
      return;
    }
    setAddingItemLessonId(null);
    setItemTitle("");
    setItemUrl("");
    setItemFile(null);
    await refreshClass();
    toast.success("Đã thêm tài liệu bài giảng!");
  };

  const activeStudents = cls.enrollments.filter((e) => e.status === "ACTIVE");
  const pendingStudents = cls.enrollments.filter((e) => e.status === "PENDING");
  const leaderboardHref = isTeacher
    ? `/teacher/classes/${cls.id}/leaderboard`
    : `/student/classes/${cls.id}/leaderboard`;

  return (
    <div className="space-y-6">
      {/* Stitch Class Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#3525CD] via-[#4F46E5] to-[#6366F1] p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold backdrop-blur">
                GV: {cls.teacher.name}
              </span>
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
                    toast.success("Đã sao chép mã lớp!");
                  }}
                  className="rounded-lg p-1.5 hover:bg-white/20"
                  title="Sao chép mã"
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

            <Button variant="secondary" asChild>
              <Link href={leaderboardHref}>
                <Trophy className="h-4 w-4 text-[#F97316]" />
                {vi.classes.tabs.leaderboard}
              </Link>
            </Button>

            {isTeacher && (
              <Button variant="accent" asChild>
                <Link href={`/teacher/assignments/new?classId=${cls.id}`}>
                  <Plus className="h-4 w-4" />
                  Giao bài tập
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Class Tabs */}
      <Tabs defaultValue="feed">
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
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="h-4 w-4" />
              {vi.classes.tabs.settings}
            </TabsTrigger>
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
            <div className="flex justify-end">
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
              <div key={post.id} className="stitch-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-bold text-[#3525CD]">
                      {getInitials(post.author.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#0B1C30]">
                          {post.author.name}
                        </span>
                        {post.author.role === "TEACHER" && (
                          <Badge variant="default">Giáo viên</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{formatDateTime(post.createdAt)}</p>
                    </div>
                  </div>
                  {(isTeacher || post.author.id === currentUserId) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/classes/${cls.id}/posts/${post.id}`, {
                          method: "DELETE",
                        });
                        await refreshClass();
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0B1C30]">
                  {post.content}
                </p>

                {/* Comments */}
                <div className="space-y-2.5 border-t border-slate-100 pt-3">
                  {post.comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5 rounded-xl bg-[#F8F9FF] p-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#3525CD] border border-slate-200">
                        {getInitials(c.author.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#0B1C30]">
                            {c.author.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#464555]">{c.content}</p>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Input
                      value={commentDrafts[post.id] ?? ""}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleAddComment(post.id);
                        }
                      }}
                      placeholder={vi.classes.feed.commentPlaceholder}
                      className="h-9 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleAddComment(post.id)}
                    >
                      {vi.classes.feed.sendComment}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* TAB 2: ASSIGNMENTS */}
        <TabsContent value="assignments" className="space-y-3">
          {cls.assignments.length === 0 ? (
            <div className="stitch-card p-10 text-center text-sm text-slate-400">
              Chưa có bài tập nào được giao trong lớp này.
            </div>
          ) : (
            cls.assignments.map((asg) => {
              const proctorSummary = describeProctorRuleSummary(asg);
              const studentTarget =
                asg.proctorMode !== "OFF"
                  ? `/student/assignments/${asg.id}/rules`
                  : `/student/assignments/${asg.id}/do`;

              return (
                <div
                  key={asg.id}
                  className="stitch-card-hover flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[#0B1C30]">{asg.title}</h3>
                      {asg.proctorMode !== "OFF" && (
                        <Badge variant="danger">
                          <Lock className="h-3 w-3" />
                          {vi.proctor.badge}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#464555]">
                      <span>{asg.worksheet._count.fields} câu hỏi</span>
                      {asg.timeLimitMin && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                          {asg.timeLimitMin} phút
                        </span>
                      )}
                      {asg.dueAt && <span>Hạn nộp: {formatDateTime(asg.dueAt)}</span>}
                    </div>
                    {proctorSummary && (
                      <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#BA1A1A]">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {proctorSummary}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`${leaderboardHref}?assignmentId=${asg.id}`}>
                        <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                        Xếp hạng
                      </Link>
                    </Button>
                    {isTeacher ? (
                      <>
                        {asg.proctorMode !== "OFF" && (
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/teacher/assignments/${asg.id}/live`}>
                              <Radio className="h-3.5 w-3.5 text-red-500" />
                              Giám sát Live
                            </Link>
                          </Button>
                        )}
                        <Button size="sm" asChild>
                          <Link href={`/teacher/assignments/${asg.id}/grading`}>
                            Chấm &amp; Kết quả ({asg._count.submissions})
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <Button variant="accent" size="sm" asChild>
                        <Link href={studentTarget}>Vào làm bài →</Link>
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
                  placeholder="VD: Chương 2: Passive Voice & Reading"
                  required
                />
                <Input
                  value={chapterDesc}
                  onChange={(e) => setChapterDesc(e.target.value)}
                  placeholder="Mô tả ngắn (tuỳ chọn)"
                />
              </div>
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" />
                {vi.lessons.createChapter}
              </Button>
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
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setAddingItemLessonId(lesson.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {vi.lessons.addItem}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          await fetch(`/api/classes/${cls.id}/lessons/${lesson.id}`, {
                            method: "DELETE",
                          });
                          await refreshClass();
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
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

                          <div className="flex items-center gap-2">
                            {item.type === "PDF" && item.fileKey && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setViewingPdf({ fileKey: item.fileKey!, title: item.title })
                                }
                              >
                                Xem PDF
                              </Button>
                            )}
                            {item.type === "LINK" && item.url && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                  Mở liên kết <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            {isTeacher && (
                              <button
                                type="button"
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
                {importingExcel ? "Đang nhập…" : "Chọn file .xlsx"}
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
                Yêu cầu chờ duyệt ({pendingStudents.length})
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
                Danh sách học sinh ({activeStudents.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {activeStudents.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-bold text-[#3525CD]">
                      {getInitials(e.student.name)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1C30]">{e.student.name}</p>
                      {e.student.email && (
                        <p className="text-xs text-slate-400">{e.student.email}</p>
                      )}
                    </div>
                  </div>
                  {isTeacher && (
                    <div className="flex items-center gap-2">
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
                        Xoá
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* TAB 5: SETTINGS (TEACHER ONLY) */}
        {isTeacher && (
          <TabsContent value="settings">
            <form onSubmit={handleSaveSettings} className="stitch-card max-w-2xl p-6 space-y-5">
              <div className="space-y-1.5">
                <Label>{vi.classes.name}</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>{vi.classes.description}</Label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-[#0B1C30]">
                    {vi.classes.requireApproval}
                  </p>
                  <p className="text-xs text-slate-500">
                    Khi bật, học sinh nhập mã sẽ ở trạng thái Chờ duyệt.
                  </p>
                </div>
                <Switch
                  checked={editRequireApproval}
                  onCheckedChange={setEditRequireApproval}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button type="button" variant="outline" onClick={handleToggleArchive}>
                  <Archive className="h-4 w-4" />
                  {cls.archived ? vi.classes.unarchive : vi.classes.archive}
                </Button>
                <Button type="submit">
                  <Check className="h-4 w-4" />
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </TabsContent>
        )}
      </Tabs>

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
                <Label>Tải file lên (PDF / MP4 / MP3)</Label>
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
                <Label>Hoặc dán đường dẫn URL (YouTube / Audio / Web)</Label>
                <Input
                  type="url"
                  value={itemUrl}
                  onChange={(e) => setItemUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddingItemLessonId(null)}
              >
                Huỷ
              </Button>
              <Button type="submit">Thêm tài liệu</Button>
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
            <DialogTitle>Mã liên kết phụ huynh</DialogTitle>
          </DialogHeader>
          {generatedParentCode && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-[#464555]">
                Gửi mã sau cho phụ huynh của <strong>{generatedParentCode.studentName}</strong>{" "}
                (hạn sử dụng 7 ngày, dùng một lần):
              </p>
              <div className="rounded-2xl bg-[#EEF2FF] py-4 font-mono text-2xl font-extrabold tracking-widest text-[#3525CD]">
                {generatedParentCode.code}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  navigator.clipboard?.writeText(generatedParentCode.code);
                  toast.success("Đã sao chép mã liên kết!");
                }}
              >
                <Copy className="h-4 w-4" />
                Sao chép mã
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lesson PDF Built-in Canvas Viewer Modal */}
      {viewingPdf && (
        <LessonPdfModal
          fileKey={viewingPdf.fileKey}
          title={viewingPdf.title}
          onClose={() => setViewingPdf(null)}
        />
      )}
    </div>
  );
}
