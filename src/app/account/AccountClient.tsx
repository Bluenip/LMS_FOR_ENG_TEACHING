"use client";

import { BackLink } from "@/components/navigation/BackLink";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogOut, Monitor } from "lucide-react";
import { toast } from "sonner";
import type { OwnProfileDto } from "@/server/accountService";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime, getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminTotpSection } from "@/components/accounts/AdminTotpSection";
import { NotificationPreferencesSection } from "@/components/accounts/NotificationPreferencesSection";

export function AccountClient({
  initialUser,
  homeHref,
  forced,
}: {
  initialUser: OwnProfileDto;
  homeHref: string;
  forced: boolean;
}) {
  const { m, tr, locale } = useI18n();
  const router = useRouter();
  const [me, setMe] = useState<OwnProfileDto>(initialUser);
  const [name, setName] = useState(initialUser.name);
  const [email, setEmail] = useState(initialUser.email);
  const [phone, setPhone] = useState(initialUser.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initialUser.dateOfBirth ?? "");
  const [gender, setGender] = useState(initialUser.gender ?? "");
  const [bio, setBio] = useState(initialUser.bio ?? "");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      provider: string;
      ipMasked: string | null;
      userAgent: string | null;
      createdAt: string;
    }>
  >([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/account/sessions")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { sessions?: typeof sessions } | null) => {
        if (active && json?.sessions) setSessions(json.sessions);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingSessions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSignOutAllDevices = async () => {
    setRevokingSessions(true);
    try {
      const res = await fetch("/api/account/logout-all", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? m.common.errorGeneric);
      toast.success(
        tr(
          "Đã đăng xuất khỏi mọi thiết bị khác! Vui lòng đăng nhập lại khi chuyển thiết bị.",
          "Signed out all other devices!"
        )
      );
      setLogoutAllOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.common.errorGeneric);
    } finally {
      setRevokingSessions(false);
    }
  };

  const todayYmd = new Date().toISOString().slice(0, 10);

  const syncUser = (user: OwnProfileDto) => {
    setMe(user);
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    setDateOfBirth(user.dateOfBirth ?? "");
    setGender(user.gender ?? "");
    setBio(user.bio ?? "");
  };

  const load = async () => {
    const res = await fetch("/api/account");
    if (res.ok) {
      const { user } = (await res.json()) as { user: OwnProfileDto };
      syncUser(user);
    }
  };

  const call = async (url: string, init: RequestInit, ok: string, refresh = true) => {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? m.common.errorGeneric);
      toast.success(ok);
      if (refresh) {
        if (json.user && typeof json.user.email === "string") {
          syncUser(json.user as OwnProfileDto);
        } else {
          await load();
        }
        router.refresh();
      }
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
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      },
      tr("Đã đổi mật khẩu.", "Password changed."),
      false
    );
    if (ok) {
      if (me.totpEnabled) {
        // Admin with 2FA enabled must sign in again with the new password + 2FA code
        window.location.href = "/api/auth/clear-session?reason=session";
        return;
      }
      // other devices are signed out; renew this device's session with the latest email & new password
      const signInRes = await signIn("credentials", {
        email: me.email,
        password: next,
        redirect: false,
      });
      if (signInRes?.error) {
        window.location.href = "/api/auth/clear-session?reason=session";
        return;
      }
      window.location.href = homeHref;
    }
  };

  const isForced = forced || me.mustChangePassword;

  return (
    <div className="mx-auto max-w-xl space-y-5">
        {!isForced && (
          <BackLink fallbackHref={homeHref} label={tr("Quay lại", "Back")} />
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-[#0B1C30]">
            {tr("Tài khoản của tôi", "My account")}
          </h1>
          <Badge variant="default">{m.roles[me.role]}</Badge>
        </div>

        {isForced && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {tr(
              "Bạn đang dùng mật khẩu tạm. Vui lòng đặt mật khẩu mới để tiếp tục.",
              "You are using a temporary password. Please set a new password to continue."
            )}
          </p>
        )}

        <section className="stitch-card space-y-4 p-5">
          <div className="flex items-center gap-4">
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.avatarUrl}
                alt={me.name}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#3525CD] text-lg font-bold text-white">
                {getInitials(me.name || "?")}
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
                  void call(
                    "/api/account/avatar",
                    { method: "POST", body: fd },
                    tr("Đã cập nhật ảnh đại diện.", "Profile picture updated.")
                  );
                  e.target.value = "";
                }}
              />
              <Button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                {tr("Đổi ảnh đại diện", "Change picture")}
              </Button>
              {me.avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void call(
                      "/api/account/avatar",
                      { method: "DELETE" },
                      tr("Đã xoá ảnh.", "Picture removed.")
                    )
                  }
                >
                  {m.common.delete}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-[#464555]">
            {tr("JPG, PNG hoặc WebP, tối đa 2MB.", "JPG, PNG or WebP, max 2MB.")}
          </p>

          <form
            className="grid gap-3.5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void call(
                "/api/account",
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name,
                    email,
                    phone,
                    dateOfBirth: dateOfBirth || null,
                    gender: gender || null,
                    bio: bio || null,
                  }),
                },
                tr("Đã lưu hồ sơ.", "Profile saved.")
              );
            }}
          >
            <div>
              <Label htmlFor="account-name" className="text-xs">
                {m.auth.fullName}
              </Label>
              <Input
                id="account-name"
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="account-email" className="text-xs">
                {m.auth.email}
              </Label>
              <Input
                id="account-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-[#464555]">
                {tr("Dùng để đăng nhập vào hệ thống.", "Used to sign in to your account.")}
              </p>
            </div>

            <div>
              <Label htmlFor="account-phone" className="text-xs">
                {m.auth.phone}
              </Label>
              <Input
                id="account-phone"
                type="tel"
                maxLength={20}
                placeholder={tr("VD: 0912345678", "e.g. +84 912 345 678")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="account-dob" className="text-xs">
                {tr("Ngày sinh", "Date of birth")}
              </Label>
              <Input
                id="account-dob"
                type="date"
                min="1900-01-01"
                max={todayYmd}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="account-gender" className="text-xs">
                {tr("Giới tính", "Gender")}
              </Label>
              <select
                id="account-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value="">{tr("— Không chọn —", "— Not specified —")}</option>
                <option value="MALE">{tr("Nam", "Male")}</option>
                <option value="FEMALE">{tr("Nữ", "Female")}</option>
                <option value="OTHER">{tr("Khác", "Other")}</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="account-bio" className="text-xs">
                  {tr("Giới thiệu ngắn", "Short bio")}
                </Label>
                <span className="text-[11px] text-slate-400 tabular-nums">{bio.length}/300</span>
              </div>
              <Textarea
                id="account-bio"
                rows={3}
                maxLength={300}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={tr(
                  "Mục tiêu học tập, môn giảng dạy hoặc ghi chú ngắn…",
                  "Learning goals, subjects taught, or a short note…"
                )}
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? m.common.saving : m.common.save}
              </Button>
            </div>
          </form>
        </section>

        <section className="stitch-card p-5">
          <h2 className="mb-3 text-sm font-bold text-[#0B1C30]">
            {tr("Đổi mật khẩu", "Change password")}
          </h2>
          <form onSubmit={changePassword} className="grid gap-3">
            <div>
              <Label htmlFor="account-cur-pw" className="text-xs">
                {tr("Mật khẩu hiện tại", "Current password")}
              </Label>
              <Input
                id="account-cur-pw"
                type="password"
                autoComplete="current-password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="account-new-pw" className="text-xs">
                {tr("Mật khẩu mới (tối thiểu 8 ký tự)", "New password (min 8 characters)")}
              </Label>
              <Input
                id="account-new-pw"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Button type="submit" disabled={busy || next.length < 8 || !cur}>
                {tr("Đổi mật khẩu", "Change password")}
              </Button>
            </div>
          </form>
        </section>

        <NotificationPreferencesSection />

        {(me.role === "ADMIN" || me.role === "TEACHER") && (
          <AdminTotpSection
            initialEnabled={me.totpEnabled}
            onStatusChange={(enabled) => setMe((prev) => ({ ...prev, totpEnabled: enabled }))}
          />
        )}

        {/* Recent Login History & Sign Out All Devices */}
        <section className="stitch-card space-y-4 p-5" data-testid="login-sessions-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30]">
                <Monitor className="h-4 w-4 text-[#4F46E5]" />
                {tr("Lịch sử đăng nhập gần đây", "Recent login history")}
              </h2>
              <p className="mt-0.5 text-xs text-[#464555]">
                {tr(
                  "Theo dõi các lượt đăng nhập gần nhất (IP được ẩn phần cuối để bảo vệ riêng tư).",
                  "Inspect recent sign-ins (IP addresses are masked for privacy)."
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[40px] border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => setLogoutAllOpen(true)}
              data-testid="logout-all-devices-btn"
            >
              <LogOut className="h-4 w-4" />
              {tr("Đăng xuất khỏi mọi thiết bị khác", "Sign out all other devices")}
            </Button>
          </div>

          {loadingSessions ? (
            <p className="text-xs text-slate-400">{m.common.loading}</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-slate-400">
              {tr("Chưa có lịch sử đăng nhập nào được ghi nhận.", "No login sessions recorded yet.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[#464555]">
                    <th className="py-2 pr-3 font-semibold">{tr("Phương thức", "Method")}</th>
                    <th className="py-2 pr-3 font-semibold">IP</th>
                    <th className="py-2 pr-3 font-semibold">{tr("Thiết bị", "Device")}</th>
                    <th className="py-2 font-semibold">{tr("Thời gian", "Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.id} data-testid={`login-session-row-${s.id}`}>
                      <td className="py-2 pr-3">
                        <Badge variant="indigo">{s.provider}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">
                        {s.ipMasked ?? "—"}
                      </td>
                      <td className="py-2 pr-3 max-w-[240px] truncate text-slate-600">
                        {s.userAgent ?? "—"}
                      </td>
                      <td className="py-2 whitespace-nowrap text-slate-500">
                        {formatDateTime(s.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Dialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{tr("Đăng xuất tất cả thiết bị?", "Sign out all devices?")}</DialogTitle>
              <DialogDescription>
                {tr(
                  "Mọi phiên đăng nhập đang mở trên máy khác hoặc trình duyệt khác sẽ bị vô hiệu hoá ngay lập tức.",
                  "All active sessions on other browsers or devices will be invalidated immediately."
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setLogoutAllOpen(false)}>
                {m.common.cancel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={revokingSessions}
                onClick={() => void handleSignOutAllDevices()}
                data-testid="confirm-logout-all-btn"
              >
                {revokingSessions ? m.common.saving : tr("Xác nhận đăng xuất", "Confirm sign out")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
