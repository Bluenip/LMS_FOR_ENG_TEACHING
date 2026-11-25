"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PivoraLogo } from "@/components/brand/PivoraLogo";
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

function getSafeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/register")) return "/";
  return raw;
}

function LoginPageContent() {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));
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
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError(vi.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F8F9FF]">
      {/* Subtle ambient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.09),transparent_58%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.16),transparent_58%)]"
      />

      {/* Minimal top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-4 text-sm font-semibold text-[#0B1C30] shadow-sm transition hover:border-indigo-200 hover:bg-[#EFF4FF] hover:text-[#3525CD]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F46E5] transition-transform group-hover:-translate-x-0.5">
            <ArrowLeft className="h-4 w-4" />
          </span>
          <span>{tr("Trang chủ", "Home")}</span>
        </Link>
        <ThemeLangToggle />
      </header>

      {/* Centered Login Card */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12 pt-2">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex justify-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-2xl px-2 py-1 transition hover:opacity-85"
            >
              <PivoraLogo name={appName} markClassName="h-9 w-9" textClassName="text-xl" />
              <span className="rounded-full bg-[#E2DFFF] px-2 py-0.5 text-[11px] font-bold text-[#3525CD]">
                LMS
              </span>
            </Link>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-indigo-950/5 sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-[#0B1C30]">
                {vi.auth.loginTitle}
              </h1>
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
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@pivora.vn"
                        className="h-11 pl-10"
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
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-11 pl-10 pr-10"
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
                      className="h-11 font-mono tracking-widest"
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

            <p className="mt-5 text-center text-xs leading-relaxed text-[#464555]">
              {tr(
                "Chưa có tài khoản? Liên hệ giáo viên hoặc quản trị viên để được cấp.",
                "No account yet? Ask your teacher or the administrator to create one."
              )}{" "}
              <Link href="/privacy" className="font-semibold text-[#4F46E5] hover:underline">
                {tr("Quyền riêng tư", "Privacy")}
              </Link>
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
      </main>
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
