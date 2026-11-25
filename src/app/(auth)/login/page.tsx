"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PivoraLogo, PivoraMark } from "@/components/brand/PivoraLogo";
import { useI18n } from "@/lib/i18n/client";
import { ThemeLangToggle } from "@/components/layout/ThemeLangToggle";

const SHOW_DEMO_ACCOUNTS =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true";

const DEMO_ACCOUNTS = [
  { role: "TEACHER", email: "teacher1@engclass.vn", desc: "Cô Mai Phương" },
  { role: "STUDENT", email: "student1@engclass.vn", desc: "Nguyễn Văn Minh" },
  { role: "PARENT", email: "parent1@engclass.vn", desc: "Nguyễn Văn Hùng" },
  { role: "ADMIN", email: "admin@engclass.vn", desc: "" },
] as const;

function LoginPageContent() {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const appName = process.env.NEXT_PUBLIC_APP_NAME || vi.app.defaultName;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionNotice =
    reason === "session"
      ? vi.auth.sessionExpired
      : reason === "role"
        ? tr(
            "Vai trò tài khoản của bạn vừa được thay đổi. Vui lòng đăng nhập lại.",
            "Your account role was changed. Please sign in again."
          )
      : reason === "locked"
        ? vi.auth.accountLocked
        : reason === "no-register"
          ? tr(
              "Hệ thống không cho tự đăng ký. Tài khoản do quản trị viên hoặc giáo viên cấp.",
              "Self-registration is disabled. Accounts are created by an administrator or a teacher."
            )
          : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        ...(totpStep ? { totpCode: totpCode.trim() } : {}),
        redirect: false,
      });

      if (res?.error) {
        const code = res.code ?? "";
        if (code === "TOTP_REQUIRED" || res.error.includes("TOTP_REQUIRED")) {
          setTotpStep(true);
          setTotpCode("");
          setError(null);
          return;
        }
        if (code === "TOTP_INVALID" || res.error.includes("TOTP_INVALID")) {
          setTotpStep(true);
          setError(
            tr(
              "Mã xác thực 2 bước không đúng hoặc đã hết hạn.",
              "Two-factor verification code is incorrect or expired."
            )
          );
          return;
        }
        if (code === "ACCOUNT_LOCKED" || res.error.includes("ACCOUNT_LOCKED")) {
          setError(vi.auth.accountLocked);
        } else if (code === "RATE_LIMITED" || res.error.includes("RATE_LIMITED")) {
          setError(vi.auth.rateLimited);
        } else {
          setError(vi.auth.invalidCredentials);
        }
        return;
      }

      toast.success(tr("Đăng nhập thành công!", "Signed in successfully!"));
      router.push("/");
      router.refresh();
    } catch {
      setError(vi.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#F8F9FF] px-4 py-8">
      <ThemeLangToggle className="absolute right-4 top-4" />
      <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-8 lg:grid-cols-12">
        {/* Left Stitch Hero Preview */}
        <div className="hidden lg:col-span-7 lg:block">
          <div className="rounded-3xl bg-gradient-to-br from-[#EEF2FF] via-[#F4F6FF] to-[#FFF5EE] dark:from-[#162038] dark:via-[#111A2E] dark:to-[#1E1B2E] p-8 shadow-sm border border-indigo-100/70">
            <div className="flex items-center gap-3">
              <PivoraMark className="h-12 w-12 shrink-0" title={appName} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="pivora-ink text-xl font-semibold tracking-tight">{appName}</span>
                  <span className="rounded-full bg-[#E2DFFF] px-2 py-0.5 text-[11px] font-bold text-[#3525CD]">
                    LMS
                  </span>
                </div>
                <p className="text-xs text-[#464555]">{tr("Nền tảng số hóa Worksheet tương tác", "Interactive worksheet platform")}</p>
              </div>
            </div>

            <h1 className="mt-8 text-4xl font-bold leading-tight tracking-tight text-[#0B1C30]">
              {vi.auth.heroTitle}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-[#464555]">
              {vi.auth.heroSubtitle}
            </p>

            {/* Live Worksheet Preview Mock matching Stitch */}
            <div className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card-hover">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-sm font-bold text-[#0B1C30]">
                  Unit 7: The World of Work - Worksheet #01
                </span>
                <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4F46E5]">
                  Live Preview
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#4F46E5]">
                    <span>Question 1</span>
                    <span className="text-slate-400">{tr("1.0 điểm", "1.0 pt")}</span>
                  </div>
                  <p className="mt-2 text-sm text-[#0B1C30] leading-loose">
                    She{" "}
                    <span className="inline-flex items-center gap-1 rounded-lg border-2 border-[#4F46E5] bg-white px-2.5 py-0.5 font-semibold text-[#3525CD]">
                      has lived
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                    </span>{" "}
                    in Hanoi since 2018.
                  </p>
                </div>

                <div className="rounded-xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#4F46E5]">
                    <span>Question 2</span>
                    <span className="text-slate-400">{tr("1.0 điểm", "1.0 pt")}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#0B1C30]">
                    Choose the correct option to complete the sentence:
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                      A. apply
                    </div>
                    <div className="rounded-lg border-2 border-[#4F46E5] bg-[#EEF2FF] px-3 py-2 font-semibold text-[#3525CD]">
                      B. to apply
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Login Form Card */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 sm:p-8 shadow-xl shadow-indigo-950/5">
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2 lg:hidden">
                <PivoraLogo name={appName} textClassName="text-lg" />
              </div>
              <h2 className="text-2xl font-bold text-[#0B1C30]">{vi.auth.loginTitle}</h2>
              <p className="mt-1 text-sm text-[#464555]">{vi.auth.loginSubtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!error && sessionNotice && (
                <div
                  role="status"
                  data-testid="session-notice"
                  className={
                    reason === "locked"
                      ? "rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 py-2.5 text-sm font-medium text-[#BA1A1A]"
                      : "rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800"
                  }
                >
                  {sessionNotice}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 py-2.5 text-sm font-medium text-[#BA1A1A]"
                >
                  {error}
                </div>
              )}

              {!totpStep ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{vi.auth.email}</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@engclass.vn"
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">{vi.auth.password}</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="password"
                        name="password"
                        type={showPass ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={tr("Hiện/ẩn mật khẩu", "Show/hide password")}
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3 rounded-2xl border border-indigo-200 bg-[#EEF2FF]/60 p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#4F46E5]" />
                    <div className="text-xs">
                      <p className="font-bold text-[#0B1C30]">
                        {tr("Xác thực 2 bước (2FA)", "Two-factor verification")}
                      </p>
                      <p className="mt-0.5 text-[#464555]">
                        {tr(
                          `Nhập mã 6 số từ ứng dụng xác thực (hoặc mã dự phòng) cho ${email}.`,
                          `Enter the 6-digit code from your authenticator app (or a backup code) for ${email}.`
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="totpCode">
                      {tr("Mã xác thực 2 bước", "2FA code")}
                    </Label>
                    <Input
                      id="totpCode"
                      name="totpCode"
                      data-testid="login-totp-input"
                      autoFocus
                      autoComplete="one-time-code"
                      required
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      className="font-mono tracking-widest"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#4F46E5] hover:underline"
                    onClick={() => {
                      setTotpStep(false);
                      setTotpCode("");
                      setError(null);
                    }}
                  >
                    ← {tr("Quay lại nhập email / mật khẩu", "Back to email / password")}
                  </button>
                </div>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                {loading
                  ? vi.common.loading
                  : totpStep
                    ? tr("Xác nhận & Đăng nhập", "Verify & Sign in")
                    : vi.auth.loginButton}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-[#464555]">
              {tr(
                "Chưa có tài khoản? Liên hệ giáo viên hoặc quản trị viên để được cấp.",
                "No account yet? Ask your teacher or the administrator to create one."
              )}{" "}
              <a href="/privacy" className="font-semibold text-[#4F46E5] hover:underline">
                {tr("Quyền riêng tư", "Privacy")}
              </a>
            </p>

            {/* Quick demo account pills: never shown on a public deployment unless explicitly enabled */}
            {SHOW_DEMO_ACCOUNTS && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="mb-2.5 text-xs font-semibold text-[#464555]">
                {vi.auth.demoAccounts}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword("password123");
                      setError(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-[#F8F9FF] px-3 py-2 text-left transition hover:border-[#4F46E5] hover:bg-[#EEF2FF]"
                  >
                    <p className="text-xs font-bold text-[#3525CD]">
                      {acc.role === "ADMIN" ? "Admin" : vi.roles[acc.role]}
                    </p>
                    <p className="truncate text-[11px] text-[#464555]">
                      {acc.desc || vi.roles.ADMIN}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F9FF]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
