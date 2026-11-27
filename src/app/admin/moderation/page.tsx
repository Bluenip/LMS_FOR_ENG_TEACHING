"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, EyeOff, RotateCcw, Shield } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/navigation/BackLink";

interface ContentReportRow {
  id: string;
  worksheetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  worksheet: {
    id: string;
    title: string;
    subject: string;
    isPublic: boolean;
    publicHiddenByAdmin: boolean;
    deletedAt: string | null;
    owner: { id: string; name: string; email: string };
  };
  reporter: { id: string; name: string; email: string };
  reviewedBy: { id: string; name: string } | null;
}

export default function AdminModerationPage() {
  const { tr, locale } = useI18n();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ reports: ContentReportRow[] }>({
    queryKey: ["admin-content-reports", statusFilter],
    queryFn: () => {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      return apiFetchJson<{ reports: ContentReportRow[] }>(
        `/api/admin/content-reports${qs}`,
        undefined,
        tr("Không tải được hàng đợi kiểm duyệt", "Could not load moderation queue")
      );
    },
  });

  const handleModerate = async (reportId: string, action: "HIDE" | "DISMISS" | "RESTORE") => {
    setBusyId(reportId);
    try {
      await apiFetchJson("/api/admin/content-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      });
      toast.success(
        action === "HIDE"
          ? tr("Đã ẩn phiếu khỏi thư viện Discover!", "Hidden worksheet from Discover!")
          : action === "RESTORE"
            ? tr("Đã khôi phục hiển thị phiếu!", "Restored worksheet visibility!")
            : tr("Đã bỏ qua báo cáo.", "Report dismissed.")
      );
      queryClient.invalidateQueries({ queryKey: ["admin-content-reports"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Thao tác thất bại", "Moderation failed"));
    } finally {
      setBusyId(null);
    }
  };

  const reports = data?.reports ?? [];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <BackLink fallbackHref="/admin" label={tr("Quản trị", "Admin")} className="mb-2" />
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0B1C30]">
            <Shield className="h-6 w-6 text-[#4F46E5]" />
            {tr("Kiểm duyệt nội dung Discover", "Discover Content Moderation")}
          </h1>
          <p className="text-sm text-[#464555]">
            {tr(
              "Xem xét các báo cáo vi phạm bản quyền hoặc nội dung từ cộng đồng giáo viên.",
              "Review community reports on public worksheets and hide offending items."
            )}
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={tr("Lọc trạng thái", "Filter status")}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30]"
        >
          <option value="">{tr("Tất cả báo cáo", "All reports")}</option>
          <option value="OPEN">{tr("Chờ xử lý (OPEN)", "Open")}</option>
          <option value="HIDDEN">{tr("Đã ẩn (HIDDEN)", "Hidden")}</option>
          <option value="DISMISSED">{tr("Đã bỏ qua (DISMISSED)", "Dismissed")}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {tr("Đang tải…", "Loading…")}
        </div>
      ) : reports.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-2">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="text-sm text-slate-500">
            {tr("Không có báo cáo vi phạm nào trong hàng đợi.", "No content reports in this queue.")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              data-testid={`moderation-report-${r.id}`}
              className="stitch-card flex flex-wrap items-start justify-between gap-4 p-5"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      r.status === "OPEN" ? "orange" : r.status === "HIDDEN" ? "danger" : "neutral"
                    }
                  >
                    {r.status}
                  </Badge>
                  <span className="font-bold text-[#0B1C30]">{r.worksheet.title}</span>
                  {r.worksheet.publicHiddenByAdmin && (
                    <Badge variant="danger">{tr("Đang bị ẩn khỏi Discover", "Hidden from Discover")}</Badge>
                  )}
                </div>
                <p className="flex items-start gap-1.5 text-sm text-[#464555]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>{r.reason}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {tr("Tác giả:", "Author:")} {r.worksheet.owner.name} ({r.worksheet.owner.email}) •{" "}
                  {tr("Người báo cáo:", "Reporter:")} {r.reporter.name} •{" "}
                  {formatDateTime(r.createdAt, locale)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!r.worksheet.publicHiddenByAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="min-h-[40px]"
                    disabled={busyId === r.id}
                    onClick={() => void handleModerate(r.id, "HIDE")}
                    data-testid={`moderation-hide-${r.id}`}
                  >
                    <EyeOff className="h-4 w-4" />
                    {tr("Ẩn khỏi Discover", "Hide")}
                  </Button>
                )}
                {r.worksheet.publicHiddenByAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[40px]"
                    disabled={busyId === r.id}
                    onClick={() => void handleModerate(r.id, "RESTORE")}
                    data-testid={`moderation-restore-${r.id}`}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {tr("Khôi phục", "Restore")}
                  </Button>
                )}
                {r.status === "OPEN" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[40px]"
                    disabled={busyId === r.id}
                    onClick={() => void handleModerate(r.id, "DISMISS")}
                    data-testid={`moderation-dismiss-${r.id}`}
                  >
                    {tr("Bỏ qua", "Dismiss")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
