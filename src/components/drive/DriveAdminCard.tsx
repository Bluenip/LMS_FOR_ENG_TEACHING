"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  HardDrive,
  Link2,
  RefreshCw,
  Trash2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { DriveStatusPayload } from "@/server/driveService";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function DriveAdminCard() {
  const { tr } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const driveResult = searchParams.get("drive");

  const [disconnecting, setDisconnecting] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  const { data, isLoading, refetch } = useQuery<DriveStatusPayload>({
    queryKey: ["drive-status", "admin"],
    queryFn: () =>
      apiFetchJson<DriveStatusPayload>(
        "/api/drive/status?quota=1",
        undefined,
        tr("Không tải được trạng thái Google Drive", "Could not load Google Drive status")
      ),
  });

  const shared = data?.shared;
  const quota = shared?.quota;
  const usagePct =
    quota?.usageBytes != null && quota?.limitBytes && quota.limitBytes > 0
      ? Math.min(100, Math.round((quota.usageBytes / quota.limitBytes) * 100))
      : null;

  const callbackBanner = (() => {
    if (!driveResult) return null;
    switch (driveResult) {
      case "connected":
        return {
          ok: true,
          text: tr("Đã kết nối Google Drive thành công!", "Google Drive connected successfully!"),
        };
      case "denied":
        return {
          ok: false,
          text: tr("Bạn đã huỷ cấp quyền Google Drive.", "Google Drive authorization was cancelled."),
        };
      case "different-account":
        return {
          ok: false,
          text: tr(
            "Không thể đổi sang tài khoản Google khác khi đang kết nối. Hãy ngắt kết nối trước.",
            "Cannot switch to a different Google account while connected. Disconnect first."
          ),
        };
      case "scope":
        return {
          ok: false,
          text: tr("Thiếu quyền truy cập drive.file từ Google.", "Missing drive.file scope from Google."),
        };
      case "norefresh":
        return {
          ok: false,
          text: tr(
            "Google không cấp refresh token. Hãy gỡ quyền ứng dụng trong Google Account rồi kết nối lại.",
            "Google did not return a refresh token. Revoke the app in Google Account and reconnect."
          ),
        };
      case "state":
        return {
          ok: false,
          text: tr("Phiên xác thực OAuth đã hết hạn. Vui lòng thử lại.", "OAuth state expired. Please try again."),
        };
      default:
        return {
          ok: false,
          text: tr("Kết nối Google Drive thất bại. Vui lòng thử lại.", "Google Drive connection failed. Please try again."),
        };
    }
  })();

  const handleDisconnect = async () => {
    if (
      !confirm(
        tr(
          "Ngắt kết nối Google Drive dùng chung? File đã tải lên vẫn được giữ nguyên trên Drive.",
          "Disconnect the shared Google Drive? Previously uploaded files will remain in Drive."
        )
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      await apiFetchJson("/api/drive/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "shared" }),
      });
      toast.success(tr("Đã ngắt kết nối Google Drive.", "Google Drive disconnected."));
      queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Ngắt kết nối thất bại", "Disconnect failed"));
    } finally {
      setDisconnecting(false);
    }
  };

  const handlePrune = async () => {
    setPruning(true);
    try {
      const res = await apiFetchJson<{
        trashedOnDrive: number;
        removedRecords: number;
        unshared: number;
        failed: number;
        skippedNoConnection: boolean;
      }>("/api/drive/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      toast.success(
        tr(
          `Đã dọn xong: chuyển thùng rác ${res.trashedOnDrive} file, xoá ${res.removedRecords} bản ghi, thu hồi chia sẻ ${res.unshared} file.`,
          `Cleanup finished: trashed ${res.trashedOnDrive} file(s), removed ${res.removedRecords} record(s), unshared ${res.unshared} file(s).`
        )
      );
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Dọn file thất bại", "Cleanup failed"));
    } finally {
      setPruning(false);
    }
  };

  const handleTogglePublicVideos = async (checked: boolean) => {
    setSavingToggle(true);
    try {
      await apiFetchJson("/api/drive/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "shared", allowPublicLessonVideos: checked }),
      });
      toast.success(
        checked
          ? tr("Đã bật chế độ Drive Preview cho video bài giảng.", "Enabled Drive Preview sharing for lesson videos.")
          : tr("Đã tắt chia sẻ công khai video bài giảng (mọi file đều riêng tư).", "Disabled public sharing for lesson videos (all files stay private).")
      );
      queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Cập nhật thất bại", "Update failed"));
    } finally {
      setSavingToggle(false);
    }
  };

  return (
    <section className="stitch-card p-6 space-y-4" data-testid="admin-drive-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
            <Cloud className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#0B1C30]">
                {tr("Google Drive dùng chung", "Shared Google Drive")}
              </h2>
              {shared?.status === "ACTIVE" && (
                <Badge variant="mint" data-testid="drive-status-badge">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {tr("Đã kết nối", "Connected")}
                </Badge>
              )}
              {shared?.status === "REVOKED" && (
                <Badge variant="danger" data-testid="drive-status-badge">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {tr("Đã bị thu hồi", "Revoked")}
                </Badge>
              )}
              {!isLoading && (!shared || shared.status === "DISCONNECTED" || shared.status === "NOT_CONNECTED") && (
                <Badge variant="neutral" data-testid="drive-status-badge">
                  {tr("Chưa kết nối", "Not connected")}
                </Badge>
              )}
              <Badge variant="default">
                STORAGE_DRIVER={data?.storageDriver ?? "local"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-[#464555]">
              {tr(
                "Lưu PDF đề, file nghe, bản backup (.engclass.zip) và bài nộp lên tài khoản Google Drive chung của trường. Scope chỉ dùng drive.file.",
                "Store worksheet PDFs, audio, backups (.engclass.zip), and student files in a shared school Google Drive using minimal drive.file scope."
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLoading ? (
            <span className="text-xs text-slate-400">{tr("Đang tải…", "Loading…")}</span>
          ) : data?.configured ? (
            shared?.connected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrune}
                  disabled={pruning}
                  data-testid="drive-prune-btn"
                >
                  <Trash2 className="h-4 w-4 text-[#F97316]" />
                  {pruning ? tr("Đang dọn…", "Cleaning…") : tr("Dọn file mồ côi", "Prune orphan files")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  data-testid="drive-disconnect-btn"
                  className="text-[#BA1A1A] hover:bg-red-50"
                >
                  <Unlink className="h-4 w-4" />
                  {tr("Ngắt kết nối", "Disconnect")}
                </Button>
              </>
            ) : (
              <Button size="sm" asChild data-testid="drive-connect-btn">
                <a href="/api/drive/connect?scope=shared">
                  <Link2 className="h-4 w-4" />
                  {shared?.status === "REVOKED"
                    ? tr("Kết nối lại Google Drive", "Reconnect Google Drive")
                    : tr("Kết nối Google Drive", "Connect Google Drive")}
                </a>
              </Button>
            )
          ) : (
            <Badge variant="orange">
              {tr("Thiếu biến môi trường GOOGLE_CLIENT_ID / SECRET / DRIVE_ENCRYPTION_KEY", "Missing GOOGLE_CLIENT_ID / SECRET / DRIVE_ENCRYPTION_KEY")}
            </Badge>
          )}
        </div>
      </div>

      {callbackBanner && (
        <div
          className={
            callbackBanner.ok
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
              : "rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#BA1A1A]"
          }
        >
          {callbackBanner.text}
        </div>
      )}

      {!isLoading && shared?.status === "REVOKED" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          {tr(
            "Quyền truy cập Google Drive đã bị thu hồi hoặc refresh token hết hạn. Hãy bấm Kết nối lại Google Drive.",
            "Google Drive access was revoked or the refresh token expired. Click Reconnect Google Drive."
          )}
        </div>
      )}

      {shared?.email && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-[#F8F9FF] p-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-400">
              {tr("Tài khoản đã kết nối", "Connected account")}
            </p>
            <p className="mt-0.5 text-sm font-bold text-[#0B1C30]">{shared.email}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400">
              <span className="inline-flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" />
                {tr("Dung lượng Drive", "Drive storage")}
              </span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex items-center gap-1 text-[#4F46E5] hover:underline normal-case"
              >
                <RefreshCw className="h-3 w-3" />
                {tr("Làm mới", "Refresh")}
              </button>
            </div>
            <p className="mt-0.5 text-sm font-bold text-[#0B1C30] tabular-nums">
              {quota
                ? `${formatBytes(quota.usageBytes)} / ${
                    quota.limitBytes ? formatBytes(quota.limitBytes) : tr("Không giới hạn", "Unlimited")
                  }`
                : "—"}
            </p>
            {usagePct !== null && (
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={
                    usagePct > 90
                      ? "h-full rounded-full bg-[#BA1A1A]"
                      : usagePct > 75
                        ? "h-full rounded-full bg-[#F97316]"
                        : "h-full rounded-full bg-[#4F46E5]"
                  }
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {shared?.connected && (
        <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div>
            <p className="text-xs font-bold text-[#0B1C30]">
              {tr(
                "Cho phép đặt quyền xem theo link cho video bài giảng (Drive Preview)",
                "Allow link-view permission for lesson videos (Drive Preview)"
              )}
            </p>
            <p className="text-[11px] text-[#464555]">
              {tr(
                "Mặc định TẮT: mọi file đều riêng tư và stream qua server. Chỉ bật nếu muốn phát video bài giảng bằng trình phát Google Drive Preview.",
                "OFF by default: all files stay private and stream through the server. Enable only if you want Google Drive Preview playback for lesson videos."
              )}
            </p>
          </div>
          <Switch
            checked={Boolean(shared.allowPublicLessonVideos)}
            disabled={savingToggle}
            onCheckedChange={handleTogglePublicVideos}
          />
        </label>
      )}
    </section>
  );
}
