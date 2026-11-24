"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BookOpen, GraduationCap, User, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { vi } from "@/messages/vi";

type RegisterRole = "STUDENT" | "TEACHER" | "PARENT";

export default function RegisterPage() {
  const router = useRouter();
  const appName = process.env.NEXT_PUBLIC_APP_NAME || vi.app.defaultName;

  const [role, setRole] = useState<RegisterRole>("STUDENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || undefined, password, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? vi.common.errorGeneric);
        return;
      }

      const signInRes = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (signInRes?.error) {
        router.push("/login");
        return;
      }

      toast.success("Đăng ký tài khoản thành công!");
      router.push("/");
      router.refresh();
    } catch {
      setError(vi.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  const roleChoices: Array<{ value: RegisterRole; label: string; icon: React.ReactNode }> = [
    { value: "STUDENT", label: vi.roles.STUDENT, icon: <User className="h-4 w-4" /> },
    { value: "TEACHER", label: vi.roles.TEACHER, icon: <GraduationCap className="h-4 w-4" /> },
    { value: "PARENT", label: vi.roles.PARENT, icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FF] px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-indigo-950/5">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F46E5] text-white shadow-sm">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.auth.registerTitle}</h1>
          <p className="mt-1 text-sm text-[#464555]">
            {appName} — {vi.auth.registerSubtitle}
          </p>
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

          {/* Role segmented selector */}
          <div className="space-y-1.5">
            <Label>{vi.auth.role}</Label>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#EFF4FF] p-1">
              {roleChoices.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRole(item.value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition",
                    role === item.value
                      ? "bg-white text-[#3525CD] shadow-sm"
                      : "text-[#464555] hover:text-[#0B1C30]"
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">{vi.auth.fullName}</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">{vi.auth.email}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">{vi.auth.phone}</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{vi.auth.password}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>

          <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
            {loading ? vi.common.loading : vi.auth.registerButton}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-[#464555]">
          {vi.auth.hasAccount}{" "}
          <Link href="/login" className="font-semibold text-[#4F46E5] hover:underline">
            {vi.auth.loginLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
