"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Heart,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { WorksheetSubject } from "@prisma/client";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubjectBadge } from "@/components/worksheet/SubjectPicker";

interface TeacherProfileResponse {
  teacher: {
    id: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    createdAt: string;
    followersCount: number;
    publicWorksheetsCount: number;
  };
  following: boolean;
  worksheets: Array<{
    id: string;
    title: string;
    subject: WorksheetSubject;
    publicLevel: string | null;
    tags: string[];
    likeCount: number;
    updatedAt: string;
    _count: { fields: number };
  }>;
}

export default function TeacherPublicProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tr, locale } = useI18n();
  const teacherId = params.id;

  const { data, isLoading, error } = useQuery<TeacherProfileResponse>({
    queryKey: ["teacher-public-profile", teacherId],
    queryFn: () =>
      apiFetchJson<TeacherProfileResponse>(
        `/api/teachers/${teacherId}/profile`,
        undefined,
        tr("Không tải được hồ sơ giáo viên", "Could not load teacher profile")
      ),
  });

  const handleFollow = async () => {
    try {
      const res = await apiFetchJson<{ following: boolean; followersCount: number }>(
        `/api/teachers/${teacherId}/follow`,
        { method: "POST" }
      );
      toast.success(
        res.following
          ? tr("Đã theo dõi giáo viên!", "Followed teacher!")
          : tr("Đã bỏ theo dõi giáo viên.", "Unfollowed teacher.")
      );
      queryClient.invalidateQueries({ queryKey: ["teacher-public-profile", teacherId] });
      queryClient.invalidateQueries({ queryKey: ["discover-worksheets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Không thể thực hiện thao tác", "Action failed"));
    }
  };

  const handleClone = async (worksheetId: string) => {
    try {
      const res = await apiFetchJson<{ worksheet: { id: string } }>(
        `/api/discover/${worksheetId}/clone`,
        { method: "POST" }
      );
      toast.success(tr("Đã sao chép phiếu về thư viện!", "Cloned worksheet!"));
      router.push(`/teacher/worksheets/${res.worksheet.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Chỉ giáo viên mới clone được", "Teachers only"));
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {tr("Đang tải hồ sơ…", "Loading profile…")}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-4">
        <Link href="/discover" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4F46E5]">
          <ArrowLeft className="h-4 w-4" />
          {tr("Quay lại Discover", "Back to Discover")}
        </Link>
        <div className="stitch-card p-10 text-center text-sm text-rose-600">
          {tr("Không tìm thấy hồ sơ giáo viên.", "Teacher profile not found.")}
        </div>
      </div>
    );
  }

  const { teacher, following, worksheets } = data;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {tr("Thư viện Cộng đồng (Discover)", "Discover Library")}
        </Link>

        <div className="stitch-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-xl font-bold text-[#4F46E5]">
              {teacher.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0B1C30] dark:text-slate-100">{teacher.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#464555] dark:text-slate-400">
                <span className="inline-flex items-center gap-1" data-testid="teacher-followers-count">
                  <Users className="h-3.5 w-3.5 text-[#4F46E5]" />
                  {teacher.followersCount} {tr("người theo dõi", "followers")}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                  {teacher.publicWorksheetsCount} {tr("phiếu công khai", "public worksheets")}
                </span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant={following ? "secondary" : "default"}
            className="min-h-[40px]"
            onClick={() => void handleFollow()}
            data-testid="teacher-follow-btn"
          >
            {following ? (
              <>
                <UserCheck className="h-4 w-4 text-emerald-600" />
                {tr("Đang theo dõi", "Following")}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                {tr("Theo dõi", "Follow")}
              </>
            )}
          </Button>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Học liệu đã chia sẻ công khai", "Published worksheets")} ({worksheets.length})
          </h2>
          {worksheets.length === 0 ? (
            <div className="stitch-card p-10 text-center text-sm text-slate-400">
              {tr("Giáo viên chưa chia sẻ phiếu công khai nào.", "No published worksheets yet.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {worksheets.map((ws) => (
                <div key={ws.id} className="stitch-card-hover flex flex-col justify-between p-5 space-y-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <SubjectBadge subject={ws.subject} />
                      {ws.publicLevel && <Badge variant="indigo">{ws.publicLevel}</Badge>}
                    </div>
                    <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100 line-clamp-2">
                      {ws.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{ws._count.fields} {tr("câu", "Q")}</span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5 text-rose-500" /> {ws.likeCount}
                      </span>
                      <span>{formatDateTime(ws.updatedAt, locale)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Button
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => void handleClone(ws.id)}
                    >
                      <Copy className="h-4 w-4" />
                      {tr("Clone về kho", "Clone")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
