"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TotpStatus {
  enabled: boolean;
  verifiedAt: string | null;
  remainingBackupCodes: number;
}

interface TotpSetupPayload {
  qrDataUrl: string;
  manualKey: string;
  otpauthUri: string;
}

export function AdminTotpSection({
  initialEnabled,
  onStatusChange,
}: {
  initialEnabled: boolean;
  onStatusChange?: (enabled: boolean) => void;
}) {
  const { m, tr } = useI18n();
  const [status, setStatus] = useState<TotpStatus>({
    enabled: initialEnabled,
    verifiedAt: null,
    remainingBackupCodes: 0,
  });
  const [setup, setSetup] = useState<TotpSetupPayload | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodesOnce, setBackupCodesOnce] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Dialog for disable or regenerate backup codes
  const [actionMode, setActionMode] = useState<"disable" | "regen" | null>(null);
  const [actionPassword, setActionPassword] = useState("");
  const [actionCode, setActionCode] = useState("");

  const loadStatus = async () => {
    const res = await fetch("/api/account/totp");
    if (res.ok) {
      const json = (await res.json()) as TotpStatus;
      setStatus(json);
      onStatusChange?.(json.enabled);
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSetup = async () => {
    setBusy(true);
    setBackupCodesOnce(null);
    try {
      const res = await fetch("/api/account/totp/setup", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      setSetup(json as TotpSetupPayload);
      setVerifyCode("");
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/account/totp/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      setSetup(null);
      setVerifyCode("");
      setBackupCodesOnce((json.backupCodes as string[]) ?? []);
      toast.success(tr("Đã bật xác thực 2 bước (2FA)!", "Two-factor authentication enabled!"));
      await loadStatus();
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const submitActionDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionMode) return;
    setBusy(true);
    try {
      const url =
        actionMode === "disable"
          ? "/api/account/totp/disable"
          : "/api/account/totp/backup-codes";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: actionPassword, code: actionCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      if (actionMode === "disable") {
        setBackupCodesOnce(null);
        toast.success(tr("Đã tắt xác thực 2 bước (2FA).", "Two-factor authentication disabled."));
      } else {
        setBackupCodesOnce((json.backupCodes as string[]) ?? []);
        toast.success(tr("Đã tạo bộ mã dự phòng mới.", "Generated new backup codes."));
      }
      setActionMode(null);
      setActionPassword("");
      setActionCode("");
      await loadStatus();
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error(m.common.errorGeneric);
    }
  };

  return (
    <section className="stitch-card space-y-4 p-5" data-testid="admin-totp-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30]">
            <ShieldCheck className="h-4 w-4 text-[#4F46E5]" />
            {tr("Đăng nhập 2 bước (2FA / TOTP)", "Two-factor authentication (2FA / TOTP)")}
          </h2>
          <p className="mt-0.5 text-xs text-[#464555]">
            {tr(
              "Bảo vệ tài khoản giáo viên / quản trị bằng ứng dụng xác thực (Google Authenticator, 1Password, Authy…).",
              "Protect your teacher or administrator account with an authenticator app (Google Authenticator, 1Password, Authy…)."
            )}
          </p>
        </div>
        {status.enabled ? (
          <Badge variant="mint">{tr("Đang bật", "Enabled")}</Badge>
        ) : (
          <Badge variant="neutral">{tr("Chưa bật", "Disabled")}</Badge>
        )}
      </div>

      {backupCodesOnce && backupCodesOnce.length > 0 && (
        <div
          data-testid="totp-backup-codes"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-amber-900">
              {tr(
                "Mã dự phòng (chỉ hiển thị MỘT LẦN — hãy lưu ở nơi an toàn):",
                "Backup codes (shown ONCE — store them safely):"
              )}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[40px]"
              onClick={() =>
                void copyText(
                  backupCodesOnce.join("\n"),
                  tr("Đã sao chép tất cả mã dự phòng.", "Copied all backup codes.")
                )
              }
            >
              <Copy className="h-3.5 w-3.5" /> {m.common.copy}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {backupCodesOnce.map((code) => (
              <code
                key={code}
                className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-center font-mono text-xs font-bold text-[#0B1C30]"
              >
                {code}
              </code>
            ))}
          </div>
        </div>
      )}

      {!status.enabled && !setup && (
        <div>
          <Button
            type="button"
            className="min-h-[40px]"
            disabled={busy}
            onClick={() => void startSetup()}
          >
            <ShieldCheck className="h-4 w-4" />
            {busy ? m.common.loading : tr("Bật xác thực 2 bước", "Enable two-factor auth")}
          </Button>
        </div>
      )}

      {!status.enabled && setup && (
        <form onSubmit={confirmEnable} className="space-y-4 rounded-xl border border-slate-200 bg-[#F8F9FF] p-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div
              className="shrink-0 rounded-xl border border-slate-200 p-2"
              style={{ backgroundColor: "#ffffff" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt={tr("Mã QR thiết lập 2FA", "2FA setup QR code")}
                width={180}
                height={180}
                className="h-44 w-44"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-2.5 text-xs">
              <p className="font-semibold text-[#0B1C30]">
                {tr(
                  "1. Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Authy…).",
                  "1. Scan the QR code with your authenticator app (Google Authenticator, Authy…)."
                )}
              </p>
              <div className="space-y-1">
                <p className="text-[#464555]">
                  {tr("Hoặc nhập khoá thủ công:", "Or enter the key manually:")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code
                    data-testid="totp-manual-key"
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider text-[#0B1C30] break-all"
                  >
                    {setup.manualKey}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[40px]"
                    onClick={() =>
                      void copyText(
                        setup.manualKey.replace(/\s+/g, ""),
                        tr("Đã sao chép khoá bí mật.", "Copied setup key.")
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" /> {m.common.copy}
                  </Button>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <Label htmlFor="totp-verify-code" className="text-xs">
                  {tr("2. Nhập mã 6 số hiện trên ứng dụng để kích hoạt:", "2. Enter the 6-digit code from your app to activate:")}
                </Label>
                <Input
                  id="totp-verify-code"
                  data-testid="totp-setup-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={10}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  className="max-w-xs font-mono tracking-widest"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="submit"
                  className="min-h-[40px]"
                  disabled={busy || verifyCode.replace(/\D/g, "").length < 6}
                >
                  {busy ? m.common.saving : tr("Xác nhận bật 2FA", "Confirm & enable 2FA")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[40px]"
                  disabled={busy}
                  onClick={() => setSetup(null)}
                >
                  {m.common.cancel}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {status.enabled && (
        <div className="space-y-3">
          <p className="text-xs text-[#464555]">
            {tr(
              `Mã dự phòng còn lại: ${status.remainingBackupCodes} / 8.`,
              `Remaining backup codes: ${status.remainingBackupCodes} / 8.`
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[40px]"
              onClick={() => {
                setActionPassword("");
                setActionCode("");
                setActionMode("regen");
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {tr("Tạo lại mã dự phòng", "Regenerate backup codes")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[40px] text-red-600 hover:bg-red-50"
              onClick={() => {
                setActionPassword("");
                setActionCode("");
                setActionMode("disable");
              }}
            >
              <ShieldOff className="h-4 w-4" />
              {tr("Tắt xác thực 2 bước", "Disable 2FA")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(actionMode)} onOpenChange={(open) => !open && setActionMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#4F46E5]" />
              {actionMode === "disable"
                ? tr("Tắt xác thực 2 bước (2FA)", "Disable two-factor authentication")
                : tr("Tạo lại mã dự phòng 2FA", "Regenerate 2FA backup codes")}
            </DialogTitle>
            <DialogDescription>
              {actionMode === "disable"
                ? tr(
                    "Nhập mật khẩu hiện tại và mã 6 số (hoặc mã dự phòng) để tắt 2FA.",
                    "Enter your current password and a 6-digit code (or backup code) to disable 2FA."
                  )
                : tr(
                    "Các mã dự phòng cũ sẽ mất hiệu lực ngay khi tạo bộ mã mới.",
                    "Previous backup codes will be invalidated immediately."
                  )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitActionDialog} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="totp-action-pw" className="text-xs">
                {tr("Mật khẩu hiện tại", "Current password")}
              </Label>
              <Input
                id="totp-action-pw"
                type="password"
                required
                value={actionPassword}
                onChange={(e) => setActionPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="totp-action-code" className="text-xs">
                {tr("Mã 6 số hoặc mã dự phòng", "6-digit code or backup code")}
              </Label>
              <Input
                id="totp-action-code"
                required
                autoComplete="one-time-code"
                placeholder="000000"
                value={actionCode}
                onChange={(e) => setActionCode(e.target.value)}
                className="font-mono tracking-wider"
              />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-[40px]"
                disabled={busy}
                onClick={() => setActionMode(null)}
              >
                {m.common.cancel}
              </Button>
              <Button
                type="submit"
                variant={actionMode === "disable" ? "destructive" : "default"}
                className="min-h-[40px]"
                disabled={busy || !actionPassword || actionCode.trim().length < 6}
              >
                {busy ? m.common.saving : m.common.confirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
