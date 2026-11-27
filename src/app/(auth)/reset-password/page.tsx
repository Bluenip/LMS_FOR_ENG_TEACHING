"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeLangToggle } from "@/components/layout/ThemeLangToggle";

function ResetPasswordInner() {
  const { tr } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(tr("Mật khẩu xác nhận không khớp.", "Passwords do not match."));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      setCompleted(true);
      toast.success(tr("Đặt lại mật khẩu thành công!", "Password reset successfully!"));
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Đặt lại mật khẩu thất bại", "Reset failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FF] dark:bg-slate-950 flex flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/login"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0B1C30] shadow-sm hover:bg-[#EFF4FF]"
        >
          <ArrowLeft className="h-4 w-4 text-[#4F46E5]" />
          {tr("Quay lại đăng nhập", "Back to sign in")}
        </Link>
        <ThemeLangToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-[420px] rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Đặt mật khẩu mới", "Set a new password")}
          </h1>
          <p className="mt-1 text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Tối thiểu 8 ký tự. Sau khi đổi, mọi phiên đăng nhập cũ sẽ tự động đăng xuất.",
              "Minimum 8 characters. Previous sessions will be signed out."
            )}
          </p>

          {!token ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-red-200 bg-[#FEF2F2] p-4 text-sm text-[#BA1A1A]">
                {tr(
                  "Thiếu mã xác thực trong liên kết. Vui lòng yêu cầu gửi lại từ trang Quên mật khẩu.",
                  "Missing reset token. Please request a new reset link."
                )}
              </div>
              <Button asChild className="h-11 w-full">
                <Link href="/forgot-password">{tr("Yêu cầu liên kết mới", "Request new link")}</Link>
              </Button>
            </div>
          ) : completed ? (
            <div
              data-testid="reset-password-success"
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2"
            >
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                {tr("Mật khẩu đã được cập nhật!", "Password updated!")}
              </div>
              <Link href="/login" className="inline-block text-xs font-semibold text-[#4F46E5] underline">
                {tr("Đăng nhập ngay", "Sign in now")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-pw">{tr("Mật khẩu mới", "New password")}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="reset-pw"
                    type="password"
                    minLength={8}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 pl-10"
                    data-testid="reset-new-password"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm">{tr("Xác nhận mật khẩu mới", "Confirm new password")}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="reset-confirm"
                    type="password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 pl-10"
                    data-testid="reset-confirm-password"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={submitting}
                data-testid="reset-submit-btn"
              >
                {submitting ? tr("Đang lưu…", "Saving…") : tr("Cập nhật mật khẩu", "Update password")}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F9FF]" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
