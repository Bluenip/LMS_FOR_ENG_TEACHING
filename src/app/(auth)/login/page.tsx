"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BookOpen, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function LoginPage() {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const appName = process.env.NEXT_PUBLIC_APP_NAME || vi.app.defaultName;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {
        if (res.code === "ACCOUNT_LOCKED" || res.error.includes("ACCOUNT_LOCKED")) {
          setError(vi.auth.accountLocked);
        } else if (res.error.includes("RATE_LIMITED")) {
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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F46E5] text-white shadow-md">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-[#3525CD]">{appName}</span>
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
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F46E5] text-white">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="text-lg font-bold text-[#3525CD]">{appName}</span>
              </div>
              <h2 className="text-2xl font-bold text-[#0B1C30]">{vi.auth.loginTitle}</h2>
              <p className="mt-1 text-sm text-[#464555]">{vi.auth.loginSubtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 py-2.5 text-sm font-medium text-[#BA1A1A]"
                >
                  {error}
                </div>
              )}

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

              <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                {loading ? vi.common.loading : vi.auth.loginButton}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-[#464555]">
              {vi.auth.noAccount}{" "}
              <Link href="/register" className="font-semibold text-[#4F46E5] hover:underline">
                {vi.auth.registerLink}
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
      </div>
    </div>
  );
}
