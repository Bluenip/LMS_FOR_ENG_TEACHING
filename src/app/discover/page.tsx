"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Eye,
  Flag,
  Heart,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { WorksheetSubject } from "@prisma/client";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { getSubjectMeta, WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SubjectBadge } from "@/components/worksheet/SubjectPicker";
import { PromptText } from "@/components/worksheet/PromptText";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscoverItem {
  id: string;
  title: string;
  subject: WorksheetSubject;
  publicLevel: string | null;
  tags: string[];
  instructions: string | null;
  pageCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; avatarUrl: string | null };
  _count: { fields: number; likes: number };
  likedByViewer: boolean;
  followingOwner: boolean;
}

interface DiscoverDetail extends DiscoverItem {
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
    _count: { teacherFollowers: number };
  };
  fields: Array<{
    id: string;
    type: string;
    label: string;
    prompt: string | null;
    points: number;
    options: unknown;
  }>;
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "IELTS", "TOEIC", "THPT"];

export default function DiscoverPage() {
  const { tr, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [publicLevel, setPublicLevel] = useState("");
  const [sort, setSort] = useState("likes");

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; title: string } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ worksheets: DiscoverItem[] }>({
    queryKey: ["discover-worksheets", q, subject, publicLevel, sort],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (subject) params.set("subject", subject);
      if (publicLevel) params.set("publicLevel", publicLevel);
      if (sort) params.set("sort", sort);
      return apiFetchJson<{ worksheets: DiscoverItem[] }>(
        `/api/discover?${params.toString()}`,
        undefined,
        tr("Không tải được thư viện cộng đồng", "Failed to load Discover library")
      );
    },
  });

  const { data: previewData, isLoading: loadingPreview } = useQuery<{ worksheet: DiscoverDetail }>({
    queryKey: ["discover-detail", previewId],
    enabled: Boolean(previewId),
    queryFn: () =>
      apiFetchJson<{ worksheet: DiscoverDetail }>(
        `/api/discover/${previewId}`,
        undefined,
        tr("Không tải được chi tiết phiếu", "Could not load worksheet preview")
      ),
  });

  const handleLike = async (id: string) => {
    try {
      await apiFetchJson<{ liked: boolean; likeCount: number }>(`/api/discover/${id}/like`, {
        method: "POST",
      });
      queryClient.invalidateQueries({ queryKey: ["discover-worksheets"] });
      if (previewId === id) {
        queryClient.invalidateQueries({ queryKey: ["discover-detail", id] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Vui lòng đăng nhập để thả tim", "Sign in to like"));
    }
  };

  const handleClone = async (id: string) => {
    setCloningId(id);
    try {
      const json = await apiFetchJson<{ worksheet: { id: string; title: string } }>(
        `/api/discover/${id}/clone`,
        { method: "POST" }
      );
      toast.success(
        tr("Đã sao chép phiếu về thư viện của bạn!", "Cloned worksheet to your library!")
      );
      setPreviewId(null);
      router.push(`/teacher/worksheets/${json.worksheet.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Chỉ giáo viên mới sao chép được về kho", "Teachers only"));
    } finally {
      setCloningId(null);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    setSubmittingReport(true);
    try {
      await apiFetchJson(`/api/discover/${reportTarget.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason }),
      });
      toast.success(tr("Đã gửi báo cáo tới quản trị viên!", "Report submitted to moderators!"));
      setReportTarget(null);
      setReportReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Gửi báo cáo thất bại", "Could not submit report"));
    } finally {
      setSubmittingReport(false);
    }
  };

  const worksheets = data?.worksheets ?? [];
  const detail = previewData?.worksheet;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href="/teacher/worksheets"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {tr("Quay lại kho bài giảng", "Back to worksheet library")}
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0B1C30] dark:text-slate-100">
              <Sparkles className="h-6 w-6 text-[#4F46E5]" />
              {tr("Thư viện Cộng đồng (Discover)", "Discover Community Library")}
            </h1>
            <p className="text-sm text-[#464555] dark:text-slate-400">
              {tr(
                "Tìm kiếm, xem trước và sao chép phiếu bài tập chất lượng từ các giáo viên khác.",
                "Browse, preview, and clone public worksheets shared by fellow educators."
              )}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="stitch-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("Tìm tên phiếu, tag, tác giả…", "Search title, tag, author…")}
              className="pl-9"
              data-testid="discover-search-input"
            />
          </div>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label={tr("Lọc theo môn học", "Filter by subject")}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{tr("Tất cả môn học", "All subjects")}</option>
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
            value={publicLevel}
            onChange={(e) => setPublicLevel(e.target.value)}
            aria-label={tr("Lọc theo trình độ", "Filter by level")}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{tr("Tất cả trình độ", "All levels")}</option>
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={tr("Sắp xếp", "Sort")}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="likes">{tr("Nhiều lượt thích nhất", "Most liked")}</option>
            <option value="recent">{tr("Mới đăng gần đây", "Newest")}</option>
            <option value="fields">{tr("Nhiều câu hỏi nhất", "Most questions")}</option>
          </select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="stitch-card p-12 text-center text-sm text-slate-400">
            {tr("Đang tải thư viện cộng đồng…", "Loading community library…")}
          </div>
        ) : worksheets.length === 0 ? (
          <div className="stitch-card p-12 text-center space-y-2">
            <BookOpen className="mx-auto h-10 w-10 text-indigo-300" />
            <p className="text-sm text-slate-500">
              {tr("Chưa có phiếu công khai nào khớp bộ lọc.", "No public worksheets match your filters.")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {worksheets.map((ws) => (
              <div
                key={ws.id}
                data-testid={`discover-card-${ws.id}`}
                className="stitch-card-hover flex flex-col justify-between p-5 space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <SubjectBadge subject={ws.subject} />
                    <div className="flex flex-wrap items-center gap-1">
                      {ws.publicLevel && <Badge variant="indigo">{ws.publicLevel}</Badge>}
                      <Badge variant="neutral">
                        {ws._count.fields} {tr("câu", "Q")}
                      </Badge>
                    </div>
                  </div>
                  <h2 className="text-base font-bold text-[#0B1C30] dark:text-slate-100 line-clamp-2">
                    {ws.title}
                  </h2>
                  {ws.instructions && (
                    <p className="text-xs text-[#464555] dark:text-slate-400 line-clamp-2">
                      {ws.instructions}
                    </p>
                  )}
                  {ws.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ws.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                    <Link
                      href={`/teachers/${ws.owner.id}`}
                      data-testid={`discover-author-${ws.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-[#3525CD] hover:underline dark:text-indigo-400"
                    >
                      {ws.followingOwner ? (
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      {ws.owner.name}
                    </Link>
                    <span>{formatDateTime(ws.updatedAt, locale)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant={ws.likedByViewer ? "secondary" : "outline"}
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => void handleLike(ws.id)}
                      data-testid={`discover-like-${ws.id}`}
                    >
                      <Heart
                        className={cn(
                          "h-4 w-4",
                          ws.likedByViewer && "fill-rose-500 text-rose-500"
                        )}
                      />
                      <span className="tabular-nums">{ws.likeCount}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => setPreviewId(ws.id)}
                      data-testid={`discover-preview-${ws.id}`}
                    >
                      <Eye className="h-4 w-4" />
                      {tr("Xem", "Preview")}
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[40px] px-2 text-slate-400 hover:text-amber-600"
                      onClick={() => setReportTarget({ id: ws.id, title: ws.title })}
                      title={tr("Báo cáo nội dung vi phạm", "Report inappropriate content")}
                      data-testid={`discover-report-${ws.id}`}
                    >
                      <Flag className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[40px]"
                      disabled={cloningId === ws.id}
                      onClick={() => void handleClone(ws.id)}
                      data-testid={`discover-clone-${ws.id}`}
                    >
                      <Copy className="h-4 w-4" />
                      {tr("Clone về kho", "Clone")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Dialog (answerKey never exposed) */}
      <Dialog open={Boolean(previewId)} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? tr("Xem trước phiếu bài tập", "Worksheet preview")}</DialogTitle>
            {detail && (
              <DialogDescription>
                {tr("Tác giả:", "Author:")}{" "}
                <Link href={`/teachers/${detail.owner.id}`} className="font-semibold text-[#4F46E5] underline">
                  {detail.owner.name}
                </Link>{" "}
                • {detail._count.fields} {tr("câu hỏi", "questions")}
              </DialogDescription>
            )}
          </DialogHeader>
          {loadingPreview || !detail ? (
            <div className="py-8 text-center text-sm text-slate-400">{tr("Đang tải…", "Loading…")}</div>
          ) : (
            <div className="space-y-3">
              {detail.instructions && (
                <div className="rounded-xl bg-[#EEF2FF]/60 p-3 text-xs text-[#0B1C30]">
                  {detail.instructions}
                </div>
              )}
              {detail.fields.map((f, idx) => (
                <div key={f.id} className="rounded-xl border border-slate-200 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-bold text-[#3525CD]">
                      {tr("Câu", "Q")} {f.label || idx + 1}
                    </span>
                    <Badge variant="neutral">{f.type}</Badge>
                  </div>
                  {f.prompt && <PromptText text={f.prompt} className="text-sm text-[#0B1C30]" />}
                  {Array.isArray(f.options) && (
                    <div className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-2">
                      {(f.options as Array<{ id?: string; text?: string }>).map((opt, i) => (
                        <div
                          key={opt.id ?? i}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-semibold mr-1">{opt.id ?? i + 1}.</span>
                          {opt.text ?? ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {detail && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPreviewId(null)}>
                {tr("Đóng", "Close")}
              </Button>
              <Button
                disabled={cloningId === detail.id}
                onClick={() => void handleClone(detail.id)}
              >
                <Copy className="h-4 w-4" />
                {tr("Clone về thư viện", "Clone to my library")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={Boolean(reportTarget)} onOpenChange={(o) => !o && setReportTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Báo cáo nội dung vi phạm", "Report inappropriate worksheet")}</DialogTitle>
            {reportTarget && <DialogDescription>{reportTarget.title}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={handleReport} className="space-y-4">
            <Textarea
              required
              minLength={5}
              rows={4}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={tr(
                "Mô tả nội dung sai phạm, bản quyền hoặc spam…",
                "Describe copyright, inaccurate, or inappropriate content…"
              )}
              data-testid="discover-report-reason"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setReportTarget(null)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={submittingReport} data-testid="discover-report-submit">
                {submittingReport ? tr("Đang gửi…", "Submitting…") : tr("Gửi báo cáo", "Submit report")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
