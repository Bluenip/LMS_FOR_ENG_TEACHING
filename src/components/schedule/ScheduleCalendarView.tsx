"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import type { AttendanceStatus, SessionStatus } from "@prisma/client";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Users,
  Video,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttendanceSheetDialog } from "./AttendanceSheetDialog";

export interface ScheduleSessionItem {
  id: string;
  classId: string;
  className: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  isMakeup: boolean;
  meetingUrl: string | null;
  notes: string | null;
  lessonIds: string[];
  assignmentIds: string[];
  attendanceSummary?: {
    presentCount: number;
    lateCount: number;
    excusedCount: number;
    absentCount: number;
    totalMarked: number;
    attendanceRatePct: number | null;
  };
  myAttendance?: {
    status: AttendanceStatus;
    note: string | null;
  } | null;
}

interface ScheduleFeedResponse {
  classes: Array<{ id: string; name: string }>;
  sessions: ScheduleSessionItem[];
  role: string;
}

interface SessionDetailResponse {
  session: ScheduleSessionItem & {
    lessons: Array<{ id: string; title: string }>;
    assignments: Array<{ id: string; title: string; dueAt: string | null }>;
  };
}

function getMondayOfWeek(anchor: Date): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderAttendanceBadge(status: AttendanceStatus, tr: (vi: string, en: string) => string) {
  if (status === "PRESENT") return <Badge variant="mint">{tr("Có mặt", "Present")}</Badge>;
  if (status === "LATE") return <Badge variant="orange">{tr("Đi muộn", "Late")}</Badge>;
  if (status === "EXCUSED") return <Badge variant="sky">{tr("Vắng phép", "Excused")}</Badge>;
  return <Badge variant="danger">{tr("Vắng KP", "Absent")}</Badge>;
}

export function ScheduleCalendarView({ mode }: { mode: "TEACHER" | "STUDENT" }) {
  const { tr, locale } = useI18n();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [classId, setClassId] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);

  const { rangeStart, rangeEnd, gridDays, periodLabel } = useMemo(() => {
    if (view === "week") {
      const start = getMondayOfWeek(anchor);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const days = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      });
      const label = `${start.toLocaleDateString(locale === "en" ? "en-US" : "vi-VN", {
        day: "2-digit",
        month: "2-digit",
      })} – ${end.toLocaleDateString(locale === "en" ? "en-US" : "vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })}`;
      return { rangeStart: start, rangeEnd: end, gridDays: days, periodLabel: label };
    }

    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = getMondayOfWeek(firstOfMonth);
    const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const lastMonday = getMondayOfWeek(lastOfMonth);
    const gridEnd = new Date(lastMonday);
    gridEnd.setDate(gridEnd.getDate() + 6);
    gridEnd.setHours(23, 59, 59, 999);

    const days: Date[] = [];
    for (
      const cur = new Date(gridStart);
      cur <= gridEnd;
      cur.setDate(cur.getDate() + 1)
    ) {
      days.push(new Date(cur));
    }
    const label = firstOfMonth.toLocaleDateString(locale === "en" ? "en-US" : "vi-VN", {
      month: "long",
      year: "numeric",
    });
    return { rangeStart: gridStart, rangeEnd: gridEnd, gridDays: days, periodLabel: label };
  }, [anchor, view, locale]);

  const { data, isLoading } = useQuery<ScheduleFeedResponse>({
    queryKey: [
      "schedule-feed",
      mode,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      classId,
    ],
    queryFn: () => {
      const qs = new URLSearchParams({
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      });
      if (classId) qs.set("classId", classId);
      return apiFetchJson<ScheduleFeedResponse>(
        `/api/schedule?${qs.toString()}`,
        undefined,
        tr("Không tải được lịch học", "Could not load schedule")
      );
    },
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<SessionDetailResponse>({
    queryKey: ["session-detail", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      apiFetchJson<SessionDetailResponse>(
        `/api/sessions/${selectedSessionId}`,
        undefined,
        tr("Không tải được chi tiết buổi học", "Could not load session detail")
      ),
  });

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, ScheduleSessionItem[]>();
    for (const s of data?.sessions ?? []) {
      const k = dayKeyLocal(new Date(s.startsAt));
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    return map;
  }, [data]);

  const shiftPeriod = (dir: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  };

  const weekdayHeaders =
    locale === "en"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

  const todayKey = dayKeyLocal(new Date());

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#0B1C30] dark:text-slate-100">
            {mode === "TEACHER"
              ? tr("Lịch giảng dạy & Buổi học", "Teaching Schedule & Sessions")
              : tr("Thời khoá biểu của tôi", "My Class Schedule")}
          </h1>
          <p className="text-sm text-[#464555] dark:text-slate-400">
            {mode === "TEACHER"
              ? tr(
                  "Theo dõi buổi học toàn bộ lớp, mở phòng trực tuyến và điểm danh nhanh.",
                  "View upcoming sessions across classes, launch online rooms, and record attendance."
                )
              : tr(
                  "Xem lịch học theo tuần/tháng, vào link phòng học và kiểm tra chuyên cần.",
                  "Browse weekly or monthly class sessions, join online rooms, and view attendance."
                )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            aria-label={tr("Lọc theo lớp", "Filter by class")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium outline-none focus:border-[#4F46E5]"
          >
            <option value="">{tr("Tất cả lớp", "All classes")}</option>
            {(data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setView("week")}
              className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition ${
                view === "week"
                  ? "bg-[#4F46E5] text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {tr("Tuần", "Week")}
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition ${
                view === "month"
                  ? "bg-[#4F46E5] text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {tr("Tháng", "Month")}
            </button>
          </div>
        </div>
      </div>

      {/* Period Navigator */}
      <div className="stitch-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={() => shiftPeriod(-1)}
            aria-label={tr("Kỳ trước", "Previous")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={() => setAnchor(new Date())}
          >
            {tr("Hôm nay", "Today")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={() => shiftPeriod(1)}
            aria-label={tr("Kỳ sau", "Next")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100 capitalize">
          <CalendarDays className="h-4 w-4 text-[#4F46E5]" />
          {periodLabel}
        </div>
      </div>

      {isLoading ? (
        <div className="stitch-card flex items-center justify-center gap-2 py-14 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Đang tải lịch học…", "Loading schedule…")}
        </div>
      ) : (
        <>
          {/* Desktop Week/Month Calendar Grid (hidden on <768px to guarantee zero overflow on 375px) */}
          <div className="hidden md:block stitch-card overflow-hidden" data-testid="schedule-desktop-grid">
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-[#F8F9FF] dark:bg-slate-800/60">
              {weekdayHeaders.map((hdr) => (
                <div
                  key={hdr}
                  className="px-2 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  {hdr}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
              {gridDays.map((day) => {
                const k = dayKeyLocal(day);
                const list = sessionsByDay.get(k) ?? [];
                const isToday = k === todayKey;
                const isOtherMonth =
                  view === "month" && day.getMonth() !== anchor.getMonth();

                return (
                  <div
                    key={k}
                    className={`min-h-[125px] p-2 space-y-1.5 ${
                      isToday
                        ? "bg-indigo-50/40 dark:bg-indigo-950/20"
                        : isOtherMonth
                          ? "bg-slate-50/60 dark:bg-slate-900/40 opacity-60"
                          : "bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold tabular-nums ${
                          isToday
                            ? "bg-[#4F46E5] text-white"
                            : "text-[#0B1C30] dark:text-slate-200"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {list.length > 0 && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {list.length} {tr("buổi", "sess.")}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {list.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          data-testid={`calendar-session-${s.id}`}
                          onClick={() => setSelectedSessionId(s.id)}
                          className={`w-full rounded-lg border p-1.5 text-left text-[11px] transition hover:shadow-sm ${
                            s.status === "CANCELLED"
                              ? "border-slate-200 bg-slate-100 text-slate-400 line-through dark:border-slate-700 dark:bg-slate-800"
                              : s.isMakeup
                                ? "border-orange-200 bg-orange-50/80 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                                : "border-indigo-200 bg-[#EEF2FF] text-[#3525CD] dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                          }`}
                        >
                          <p className="font-bold tabular-nums">
                            {formatHm(s.startsAt)}–{formatHm(s.endsAt)}
                          </p>
                          <p className="truncate font-semibold">{s.title}</p>
                          <p className="truncate text-[10px] opacity-75">{s.className}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Responsive Daily List (<768px) */}
          <div className="md:hidden space-y-3" data-testid="schedule-mobile-list">
            {(data?.sessions ?? []).length === 0 ? (
              <div className="stitch-card p-8 text-center text-sm text-slate-400">
                {tr("Không có buổi học nào trong khoảng thời gian này.", "No sessions in this range.")}
              </div>
            ) : (
              (data?.sessions ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className="stitch-card w-full p-4 text-left space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#4F46E5] tabular-nums">
                      {formatDateTime(s.startsAt, locale)}
                    </span>
                    {s.status === "CANCELLED" ? (
                      <Badge variant="neutral">{tr("Đã huỷ", "Cancelled")}</Badge>
                    ) : s.isMakeup ? (
                      <Badge variant="orange">{tr("Buổi bù", "Makeup")}</Badge>
                    ) : (
                      <Badge variant="indigo">{s.className}</Badge>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">{s.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="h-3.5 w-3.5" />
                      {formatHm(s.startsAt)}–{formatHm(s.endsAt)}
                    </span>
                    {s.myAttendance && renderAttendanceBadge(s.myAttendance.status, tr)}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/* Session Detail Dialog */}
      <Dialog
        open={Boolean(selectedSessionId)}
        onOpenChange={(o) => !o && setSelectedSessionId(null)}
      >
        <DialogContent data-testid="session-detail-dialog" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailData?.session.title ?? tr("Chi tiết buổi học", "Session Detail")}
            </DialogTitle>
            {detailData && (
              <DialogDescription>
                {detailData.session.className} •{" "}
                {formatDateTime(detailData.session.startsAt, locale)} ({formatHm(detailData.session.startsAt)}–{formatHm(detailData.session.endsAt)})
              </DialogDescription>
            )}
          </DialogHeader>

          {detailLoading || !detailData ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Đang tải…", "Loading…")}
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {detailData.session.status === "CANCELLED" && (
                  <Badge variant="danger">{tr("Buổi học đã huỷ", "Cancelled")}</Badge>
                )}
                {detailData.session.isMakeup && (
                  <Badge variant="orange">{tr("Buổi bù / tăng cường", "Makeup session")}</Badge>
                )}
                {mode === "STUDENT" &&
                  detailData.session.myAttendance &&
                  renderAttendanceBadge(detailData.session.myAttendance.status, tr)}
                {mode === "TEACHER" && detailData.session.attendanceSummary && (
                  <Badge variant="indigo">
                    {tr("Đã điểm danh:", "Marked:")}{" "}
                    {detailData.session.attendanceSummary.totalMarked}
                  </Badge>
                )}
              </div>

              {detailData.session.meetingUrl && (
                <a
                  href={detailData.session.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Video className="h-4 w-4" />
                  {tr("Vào phòng học trực tuyến", "Join live meeting")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {detailData.session.notes && (
                <div className="rounded-xl bg-[#F8F9FF] dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-[#0B1C30] dark:text-slate-100 mb-1">
                    {tr("Ghi chú buổi học", "Session notes")}
                  </p>
                  <p className="whitespace-pre-wrap">{detailData.session.notes}</p>
                </div>
              )}

              {detailData.session.lessons.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {tr("Bài giảng đính kèm", "Attached lessons")}
                  </p>
                  {detailData.session.lessons.map((l) => (
                    <Link
                      key={l.id}
                      href={`/${mode === "TEACHER" ? "teacher" : "student"}/classes/${detailData.session.classId}?tab=lessons`}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#3525CD] dark:text-indigo-300 hover:bg-indigo-50/40"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      {l.title}
                    </Link>
                  ))}
                </div>
              )}

              {detailData.session.assignments.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {tr("Bài tập buổi học", "Linked assignments")}
                  </p>
                  {detailData.session.assignments.map((a) => (
                    <Link
                      key={a.id}
                      href={
                        mode === "TEACHER"
                          ? `/teacher/assignments/${a.id}/grading`
                          : `/student/assignments/${a.id}/do`
                      }
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#3525CD] dark:text-indigo-300 hover:bg-indigo-50/40"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" />
                        {a.title}
                      </span>
                      {a.dueAt && (
                        <span className="text-[11px] font-normal text-slate-400">
                          {formatDateTime(a.dueAt, locale)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              <DialogFooter className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-10" asChild>
                  <Link
                    href={`/${mode === "TEACHER" ? "teacher" : "student"}/classes/${detailData.session.classId}?tab=schedule`}
                  >
                    {tr("Mở tab Lịch lớp", "Open Class Schedule")}
                  </Link>
                </Button>
                {mode === "TEACHER" && detailData.session.status !== "CANCELLED" && (
                  <Button
                    type="button"
                    variant="accent"
                    className="min-h-10"
                    onClick={() => {
                      const sid = detailData.session.id;
                      setSelectedSessionId(null);
                      setAttendanceSessionId(sid);
                    }}
                  >
                    <Users className="h-4 w-4" />
                    {tr("Điểm danh buổi này", "Take attendance")}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {mode === "TEACHER" && (
        <AttendanceSheetDialog
          sessionId={attendanceSessionId}
          open={Boolean(attendanceSessionId)}
          onOpenChange={(o) => !o && setAttendanceSessionId(null)}
        />
      )}
    </div>
  );
}
