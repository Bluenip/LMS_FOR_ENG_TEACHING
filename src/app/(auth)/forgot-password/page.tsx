"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeLangToggle } from "@/components/layout/ThemeLangToggle";

export default function ForgotPasswordPage() {
  const { tr } = useI18n();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{
    message: string;
    smtpConfigured: boolean;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const json = await apiFetchJson<{
        ok: true;
        smtpConfigured: boolean;
        emailSent: boolean;
        message: string;
      }>("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setDone({ message: json.message, smtpConfigured: json.smtpConfigured });
      toast.success(tr("Đã xử lý yêu cầu đặt lại mật khẩu.", "Password reset request processed."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Không thể gửi yêu cầu", "Request failed"));
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
            {tr("Quên mật khẩu", "Forgot password")}
          </h1>
          <p className="mt-1 text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Nhập email tài khoản của bạn để nhận liên kết đặt lại mật khẩu (hiệu lực 30 phút).",
              "Enter your account email to receive a password reset link (valid for 30 minutes)."
            )}
          </p>

          {done ? (
            <div className="mt-5 space-y-4">
              <div
                data-testid="forgot-password-success"
                className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p>{done.message}</p>
                </div>
                {!done.smtpConfigured && (
                  <p className="text-xs text-amber-800">
                    {tr(
                      "Lưu ý: Máy chủ chưa bật gửi email SMTP. Vui lòng liên hệ Giáo viên hoặc Quản trị viên để được cấp lại mật khẩu trực tiếp.",
                      "Note: Outbound SMTP email is not configured on this server. Contact your teacher or administrator to reset your password."
                    )}
                  </p>
                )}
              </div>
              <Button asChild className="h-11 w-full" variant="outline">
                <Link href="/login">{tr("Về trang đăng nhập", "Return to sign in")}</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@pivora.vn"
                    className="h-11 pl-10"
                    data-testid="forgot-email-input"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={submitting}
                data-testid="forgot-submit-btn"
              >
                {submitting ? tr("Đang xử lý…", "Processing…") : tr("Gửi liên kết đặt lại", "Send reset link")}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
