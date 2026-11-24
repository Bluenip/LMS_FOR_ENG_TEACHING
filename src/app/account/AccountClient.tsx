"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeLangToggle } from "@/components/layout/ThemeLangToggle";

interface Me {
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export function AccountClient({ email, homeHref, forced }: { email: string; homeHref: string; forced: boolean }) {
  const { m, tr } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const res = await fetch("/api/account");
    if (res.ok) {
      const { user } = await res.json();
      setMe(user);
      setName(user.name);
      setPhone(user.phone ?? "");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const call = async (url: string, init: RequestInit, ok: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? m.common.errorGeneric);
      toast.success(ok);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.common.errorGeneric);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await call(
      "/api/account/password",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) },
      tr("Đã đổi mật khẩu.", "Password changed.")
    );
    if (ok) {
      // other devices are signed out; renew this device's session with the new password
      await signIn("credentials", { email, password: next, redirect: false });
      window.location.href = homeHref;
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F8F9FF] px-4 py-10">
      <ThemeLangToggle className="absolute right-4 top-4" />
      <div className="mx-auto max-w-xl space-y-5">
        <Link href={homeHref} className="text-sm font-semibold text-[#4F46E5] hover:underline">
          ← {tr("Về trang chính", "Back to home")}
        </Link>
        <h1 className="text-2xl font-bold text-[#0B1C30]">{tr("Tài khoản của tôi", "My account")}</h1>
        {(forced || me?.mustChangePassword) && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {tr(
              "Bạn đang dùng mật khẩu tạm. Vui lòng đặt mật khẩu mới để tiếp tục.",
              "You are using a temporary password. Please set a new password to continue."
            )}
          </p>
        )}

        <section className="stitch-card space-y-4 p-5">
          <div className="flex items-center gap-4">
            {me?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#3525CD] text-lg font-bold text-white">
                {(me?.name ?? "?").slice(0, 1)}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.append("file", f);
                  void call("/api/account/avatar", { method: "POST", body: fd }, tr("Đã cập nhật ảnh đại diện.", "Profile picture updated."));
                  e.target.value = "";
                }}
              />
              <Button type="button" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {tr("Đổi ảnh đại diện", "Change picture")}
              </Button>
              {me?.avatarUrl && (
                <Button type="button" size="sm" variant="outline" disabled={busy}
                  onClick={() => void call("/api/account/avatar", { method: "DELETE" }, tr("Đã xoá ảnh.", "Picture removed."))}>
                  {m.common.delete}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-[#464555]">{tr("JPG, PNG hoặc WebP, tối đa 2MB.", "JPG, PNG or WebP, max 2MB.")}</p>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) }, tr("Đã lưu hồ sơ.", "Profile saved."));
            }}
          >
            <div>
              <Label className="text-xs">{m.auth.fullName}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{m.auth.phone}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
            <div className="sm:col-span-2 text-xs text-[#464555]">Email: {email}</div>
            <Button type="submit" disabled={busy}>{m.common.save}</Button>
          </form>
        </section>

        <section className="stitch-card p-5">
          <h2 className="mb-3 text-sm font-bold text-[#0B1C30]">{tr("Đổi mật khẩu", "Change password")}</h2>
          <form onSubmit={changePassword} className="grid gap-3">
            <div>
              <Label className="text-xs">{tr("Mật khẩu hiện tại", "Current password")}</Label>
              <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{tr("Mật khẩu mới (tối thiểu 8 ký tự)", "New password (min 8 characters)")}</Label>
              <Input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" disabled={busy || next.length < 8 || !cur}>{tr("Đổi mật khẩu", "Change password")}</Button>
          </form>
        </section>
      </div>
    </div>
  );
}
