"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cloud,
  HardDrive,
  Link2,
  Settings,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { DriveStatusPayload } from "@/server/driveService";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function TeacherSettingsContent() {
  const { tr, locale } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const driveResult = searchParams.get("drive");

  const [disconnecting, setDisconnecting] = useState(false);
  const [togglingBackup, setTogglingBackup] = useState(false);
  const [backingUpAll, setBackingUpAll] = useState(false);

  const { data, isLoading } = useQuery<DriveStatusPayload>({
    queryKey: ["drive-status", "teacher-settings"],
    queryFn: () =>
      apiFetchJson<DriveStatusPayload>(
        "/api/drive/status?quota=1",
        undefined,
        tr("Không tải được cài đặt Drive", "Could not load Drive settings")
      ),
  });

  const personal = data?.personal;
  const shared = data?.shared;

  const handleDisconnect = async () => {
    if (
      !confirm(
        tr(
          "Ngắt kết nối Google Drive cá nhân? Các file đã tải lên vẫn nằm nguyên trong Drive của bạn.",
          "Disconnect your personal Google Drive? Previously uploaded files will remain in your Drive."
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
        body: JSON.stringify({ scope: "personal" }),
      });
      toast.success(tr("Đã ngắt kết nối Google Drive cá nhân.", "Personal Google Drive disconnected."));
      queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleAutoBackup = async (enabled: boolean) => {
    setTogglingBackup(true);
    try {
      await apiFetchJson("/api/drive/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "personal", autoBackupEnabled: enabled }),
      });
      toast.success(
        enabled
          ? tr("Đã bật tự động sao lưu hằng ngày lên Drive.", "Daily automatic Drive backup enabled.")
          : tr("Đã tắt tự động sao lưu hằng ngày.", "Daily automatic Drive backup disabled.")
      );
      queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Cập nhật thất bại", "Update failed"));
    } finally {
      setTogglingBackup(false);
    }
  };

  const handleBackupAllNow = async () => {
    setBackingUpAll(true);
    try {
      const res = await apiFetchJson<{ count: number; fileName: string }>("/api/drive/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      toast.success(
        tr(
          `Đã sao lưu ${res.count} worksheet lên Google Drive (${res.fileName}).`,
          `Backed up ${res.count} worksheet(s) to Google Drive (${res.fileName}).`
        )
      );
      queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Sao lưu thất bại", "Backup failed"));
    } finally {
      setBackingUpAll(false);
    }
  };

  const sourceLabel =
    data?.effectiveSource === "personal"
      ? tr("Google Drive riêng của bạn", "Your personal Google Drive")
      : data?.effectiveSource === "shared"
        ? tr("Google Drive dùng chung của trường", "School shared Google Drive")
        : data?.effectiveSource === "s3"
          ? "S3 Storage"
          : tr("Ổ đĩa máy chủ (Local)", "Server local storage");

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F46E5] text-white">
          <Settings className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">
            {tr("Cài đặt tài khoản & Google Drive", "Account settings & Google Drive")}
          </h1>
          <p className="text-sm text-[#464555]">
            {tr(
              "Kết nối Google Drive cá nhân để lưu trữ học liệu và bật sao lưu tự động hằng ngày.",
              "Connect your personal Google Drive for worksheet storage and daily automatic backups."
            )}
          </p>
        </div>
      </div>

      {driveResult && (
        <div
          className={
            driveResult === "connected"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800"
              : "rounded-xl border border-red-200 bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#BA1A1A]"
          }
        >
          {driveResult === "connected"
            ? tr("Đã kết nối Google Drive cá nhân thành công!", "Personal Google Drive connected successfully!")
            : tr("Kết nối Google Drive không thành công. Vui lòng thử lại.", "Google Drive connection did not succeed. Please try again.")}
        </div>
      )}

      {/* Priority summary */}
      <div className="stitch-card p-5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase text-slate-400">
            {tr("Nơi lưu trữ đang áp dụng", "Active storage target")}
          </span>
          <Badge variant={data?.effectiveSource === "personal" || data?.effectiveSource === "shared" ? "mint" : "neutral"}>
            {sourceLabel}
          </Badge>
        </div>
        <p className="text-xs text-[#464555]">
          {tr(
            "Thứ tự ưu tiên: Google Drive riêng của giáo viên → Google Drive dùng chung → Ổ đĩa máy chủ.",
            "Priority order: Teacher's personal Drive → School shared Drive → Server storage."
          )}
        </p>
      </div>

      {/* Personal Drive Connection Card */}
      <section className="stitch-card p-6 space-y-4" data-testid="teacher-drive-settings-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
              <Cloud className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-[#0B1C30]">
                  {tr("Google Drive cá nhân", "Personal Google Drive")}
                </h2>
                {personal?.connected ? (
                  <Badge variant="mint">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {tr("Đã kết nối", "Connected")}
                  </Badge>
                ) : personal?.status === "REVOKED" ? (
                  <Badge variant="danger">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {tr("Đã bị thu hồi", "Revoked")}
                  </Badge>
                ) : (
                  <Badge variant="neutral">{tr("Chưa kết nối", "Not connected")}</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-[#464555]">
                {tr(
                  "File của bạn sẽ được lưu trong thư mục Pivora trên Google Drive cá nhân (quyền tối thiểu drive.file, mọi file riêng tư).",
                  "Your files will be stored inside the Pivora folder in your personal Google Drive (minimal drive.file scope, private by default)."
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isLoading ? null : data?.configured ? (
              personal?.connected ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-[#BA1A1A] hover:bg-red-50"
                >
                  <Unlink className="h-4 w-4" />
                  {tr("Ngắt kết nối", "Disconnect")}
                </Button>
              ) : (
                <Button size="sm" asChild data-testid="connect-personal-drive-btn">
                  <a href="/api/drive/connect?scope=personal">
                    <Link2 className="h-4 w-4" />
                    {personal?.status === "REVOKED"
                      ? tr("Kết nối lại Drive cá nhân", "Reconnect personal Drive")
                      : tr("Kết nối Drive cá nhân", "Connect personal Drive")}
                  </a>
                </Button>
              )
            ) : (
              <Badge variant="orange">
                {tr("Quản trị viên chưa cấu hình Google OAuth", "Admin has not configured Google OAuth")}
              </Badge>
            )}
          </div>
        </div>

        {personal?.email && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-[#F8F9FF] p-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-400">Email</p>
              <p className="mt-0.5 text-sm font-bold text-[#0B1C30]">{personal.email}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-400 inline-flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" />
                {tr("Dung lượng", "Storage")}
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#0B1C30] tabular-nums">
                {personal.quota
                  ? `${formatBytes(personal.quota.usageBytes)} / ${
                      personal.quota.limitBytes
                        ? formatBytes(personal.quota.limitBytes)
                        : tr("Không giới hạn", "Unlimited")
                    }`
                  : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Daily auto-backup toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div>
            <p className="text-xs font-bold text-[#0B1C30]">
              {tr("Tự động sao lưu hằng ngày (02:00)", "Daily automatic backup (02:00)")}
            </p>
            <p className="text-[11px] text-[#464555]">
              {tr(
                "Chỉ sao lưu những worksheet có thay đổi kể từ lần sao lưu trước, giữ 14 bản gần nhất.",
                "Only backs up worksheets changed since the last backup, retaining the latest 14 backups."
              )}
              {personal?.lastAutoBackupAt && (
                <>
                  {" "}
                  ({tr("Gần nhất:", "Last:")} {formatDateTime(personal.lastAutoBackupAt, locale)})
                </>
              )}
            </p>
          </div>
          <Switch
            checked={Boolean(personal?.autoBackupEnabled)}
            disabled={!personal?.connected || togglingBackup}
            onCheckedChange={handleToggleAutoBackup}
          />
        </div>

        {(personal?.connected || shared?.connected) && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={backingUpAll}
              onClick={handleBackupAllNow}
              data-testid="backup-all-drive-settings-btn"
            >
              <Archive className="h-4 w-4 text-emerald-600" />
              {backingUpAll
                ? tr("Đang sao lưu…", "Backing up…")
                : tr("Sao lưu toàn bộ kho lên Drive ngay", "Back up all worksheets to Drive now")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function TeacherSettingsPage() {
  return (
    <Suspense fallback={<div className="stitch-card p-12 text-center text-sm text-slate-400">…</div>}>
      <TeacherSettingsContent />
    </Suspense>
  );
}
