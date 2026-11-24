"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ResetPasswordTarget {
  id: string;
  name: string;
  email?: string | null;
  roleLabel?: string;
}

export function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: ResetPasswordTarget | null;
  onClose: () => void;
}) {
  const { m, tr } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<"pw" | "both" | null>(null);

  useEffect(() => {
    setTempPassword(null);
    setSubmitting(false);
    setCopiedKey(null);
  }, [target?.id]);

  const handleConfirm = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${target.id}/reset-password`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      setTempPassword(json.temporaryPassword);
      toast.success(tr("Đã đặt lại mật khẩu tạm.", "Temporary password generated."));
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = (text: string, which: "pw" | "both") => {
    void navigator.clipboard?.writeText(text);
    setCopiedKey(which);
    toast.success(m.common.copied);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#4F46E5]" />
            {tr("Đặt lại mật khẩu", "Reset password")}
          </DialogTitle>
          {target && (
            <DialogDescription>
              {target.name}
              {target.email ? ` (${target.email})` : ""}
              {target.roleLabel ? ` · ${target.roleLabel}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>

        {!tempPassword ? (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {tr("Xác nhận tạo mật khẩu tạm mới?", "Generate a new temporary password?")}
              </p>
              <p className="text-xs leading-relaxed">
                {tr(
                  "Tài khoản này sẽ bị đăng xuất khỏi tất cả thiết bị đang mở và phải đặt mật khẩu mới ngay khi đăng nhập lại.",
                  "This account will be signed out of all active devices and must choose a new password at next sign-in."
                )}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                {m.common.cancel}
              </Button>
              <Button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
                <KeyRound className="h-4 w-4" />
                {submitting
                  ? tr("Đang tạo…", "Generating…")
                  : tr("Đặt lại mật khẩu", "Reset password")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-[#464555]">
              {tr(
                "Mật khẩu tạm dưới đây chỉ hiển thị một lần. Hãy sao chép và gửi cho người dùng.",
                "This temporary password is shown only once. Copy and share it with the user."
              )}
            </p>
            <div className="rounded-2xl bg-[#EEF2FF] px-4 py-4 text-center font-mono text-2xl font-extrabold tracking-widest text-[#3525CD] select-all">
              {tempPassword}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => copyText(tempPassword, "pw")}
              >
                {copiedKey === "pw" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {tr("Sao chép mật khẩu", "Copy password")}
              </Button>
              {target?.email && (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => copyText(`${target.email} / ${tempPassword}`, "both")}
                >
                  {copiedKey === "both" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {tr("Sao chép email + MK", "Copy email + PW")}
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {m.common.close}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
