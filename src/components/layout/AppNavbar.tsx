"use client";

import Link from "next/link";
import { PivoraLogo } from "@/components/brand/PivoraLogo";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import {
  Bell,
  CheckCheck,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { ThemeLangToggle } from "./ThemeLangToggle";
import { cn, formatDateTime, getInitials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export interface NavLinkItem {
  href: string;
  label: string;
  exact?: boolean;
  /** extra path prefixes that also mark this link active (e.g. /teacher/classes for "Lớp học") */
  activePrefixes?: string[];
  dot?: "red" | "none";
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface AppNavbarProps {
  appName: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    avatarUrl?: string | null;
  };
  links: NavLinkItem[];
  topBanner?: React.ReactNode;
}

export function AppNavbar({ appName, user, links, topBanner }: AppNavbarProps) {
  const { m: vi, tr, locale } = useI18n();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false });
    } finally {
      window.location.assign("/api/auth/clear-session");
    }
  };

  useEffect(() => {
    if (!notifOpen && !mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notifOpen, mobileOpen]);

  const { data: notifData } = useQuery<{
    items: NotificationItem[];
    unreadCount: number;
  }>({
    queryKey: ["notifications", locale],
    queryFn: () =>
      apiFetchJson<{ items: NotificationItem[]; unreadCount: number }>("/api/notifications"),
    refetchInterval: 30_000,
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markOne = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setNotifOpen(false);
  };

  const unreadCount = notifData?.unreadCount ?? 0;
  const items = notifData?.items ?? [];

  const isActive = (link: NavLinkItem) => {
    if (link.activePrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return true;
    }
    if (link.exact) return pathname === link.href;
    return pathname === link.href || pathname.startsWith(`${link.href}/`);
  };

  const homeHref =
    user.role === "ADMIN"
      ? "/admin"
      : user.role === "TEACHER"
        ? "/teacher"
        : user.role === "PARENT"
          ? "/parent"
          : "/student";

  return (
    <header data-app-navbar className="sticky top-0 z-40 border-b border-slate-200/80 bg-white pt-[env(safe-area-inset-top)] shadow-toolbar">
      <div className="relative z-40 bg-inherit">
        {topBanner}
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6 lg:px-8">
        {/* Logo + Nav */}
        <div className="flex min-w-0 items-center gap-6">
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
            <PivoraLogo
              name={appName}
              className="gap-2"
              markClassName="h-8 w-8 sm:h-9 sm:w-9"
              textClassName="text-base sm:text-lg"
            />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label={tr("Điều hướng chính", "Main navigation")}>
            {links.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all",
                    active
                      ? "bg-[#4F46E5] text-white shadow-sm"
                      : "text-[#464555] hover:bg-[#EFF4FF] hover:text-[#3525CD]"
                  )}
                >
                  {link.dot === "red" && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeLangToggle className="hidden sm:flex" />
          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen((o) => !o);
                setMobileOpen(false);
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[#464555] transition hover:bg-[#EFF4FF] hover:text-[#3525CD]"
              aria-label={vi.nav.notifications}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotifOpen(false)}
                />
                <div className="fixed inset-x-3 top-[calc(3.75rem+env(safe-area-inset-top))] z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <span className="text-sm font-bold text-[#0B1C30]">
                      {vi.notifications.title}
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllMutation.mutate()}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] hover:underline"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        {vi.notifications.markAllRead}
                      </button>
                    )}
                  </div>
                  <div className="max-h-[60vh] space-y-1 overflow-y-auto overscroll-contain sm:max-h-80">
                    {items.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-400">
                        {vi.notifications.empty}
                      </p>
                    ) : (
                      items.map((n) => (
                        <div
                          key={n.id}
                          className={cn(
                            "rounded-xl p-2.5 text-left transition",
                            n.read ? "bg-white hover:bg-slate-50" : "bg-[#EFF4FF]/70 hover:bg-[#EFF4FF]"
                          )}
                        >
                          {n.link ? (
                            <Link
                              href={n.link}
                              onClick={() => void markOne(n.id)}
                              className="block"
                            >
                              <p className="text-xs font-semibold text-[#0B1C30]">{n.title}</p>
                              <p className="mt-0.5 text-xs text-[#464555] line-clamp-2">{n.body}</p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {formatDateTime(n.createdAt)}
                              </p>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void markOne(n.id)}
                              className="block w-full text-left"
                            >
                              <p className="text-xs font-semibold text-[#0B1C30]">{n.title}</p>
                              <p className="mt-0.5 text-xs text-[#464555]">{n.body}</p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {formatDateTime(n.createdAt)}
                              </p>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User pill */}
          <Link
            href="/account"
            title={tr("Tài khoản của tôi", "My account")}
            className="flex items-center gap-2.5 rounded-full p-0.5 transition hover:bg-[#EFF4FF] sm:pl-3"
          >
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold text-[#0B1C30]">{user.name}</p>
              <p className="text-xs text-[#464555]">{vi.roles[user.role]}</p>
            </div>
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3525CD] text-xs font-bold text-white">
                {getInitials(user.name)}
              </div>
            )}
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSignOut()}
            className="hidden text-slate-500 hover:text-red-600 sm:inline-flex"
            title={vi.auth.logoutButton}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">{vi.auth.logoutButton}</span>
          </Button>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => {
              setMobileOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label={tr("Mở menu", "Open menu")}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-slate-900/20 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-40 max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-y-auto border-t border-slate-100 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden">
            <Link
              href="/account"
              onClick={() => setMobileOpen(false)}
              className="mb-2 flex items-center gap-3 rounded-xl bg-[#F8F9FF] p-3 sm:hidden"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={user.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3525CD] text-sm font-bold text-white">
                  {getInitials(user.name)}
                </div>
              )}
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold text-[#0B1C30]">{user.name}</p>
                <p className="truncate text-xs text-[#464555]">
                  {vi.roles[user.role]} · {tr("Tài khoản của tôi", "My account")}
                </p>
              </div>
            </Link>
            <nav className="flex flex-col gap-1" aria-label={tr("Điều hướng chính", "Main navigation")}>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-xl px-3.5 py-3 text-sm font-semibold",
                    isActive(link)
                      ? "bg-[#4F46E5] text-white"
                      : "text-[#464555] hover:bg-[#EFF4FF]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 sm:hidden">
              <ThemeLangToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleSignOut()}
                className="text-slate-500 hover:text-red-600"
              >
                <LogOut className="h-4 w-4" />
                {vi.auth.logoutButton}
              </Button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
