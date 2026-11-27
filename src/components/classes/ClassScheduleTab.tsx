"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import type { AttendanceStatus, SessionStatus } from "@prisma/client";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttendanceSheetDialog } from "@/components/schedule/AttendanceSheetDialog";

interface ScheduleRuleDTO {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  title: string | null;
  meetingUrl: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sessionCount: number;
}

interface ClassSessionDTO {
  id: string;
  classId: string;
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

interface MonthlyReportDTO {
  year: number;
  month: number;
  sessionCount: number;
  classAvgRatePct: number | null;
  rows: Array<{
    student: { id: string; name: string; email: string };
    summary: {
      presentCount: number;
      lateCount: number;
      excusedCount: number;
      absentCount: number;
      totalMarked: number;
      attendanceRatePct: number | null;
    };
  }>;
}

const WEEKDAY_LABELS: Array<{ dow: number; vi: string; en: string }> = [
  { dow: 1, vi: "Thứ 2", en: "Monday" },
  { dow: 2, vi: "Thứ 3", en: "Tuesday" },
  { dow: 3, vi: "Thứ 4", en: "Wednesday" },
  { dow: 4, vi: "Thứ 5", en: "Thursday" },
  { dow: 5, vi: "Thứ 6", en: "Friday" },
  { dow: 6, vi: "Thứ 7", en: "Saturday" },
  { dow: 0, vi: "Chủ nhật", en: "Sunday" },
];

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function defaultMakeupWindow(): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + 90 * 60_000);
  return {
    start: toDatetimeLocalValue(start.toISOString()),
    end: toDatetimeLocalValue(end.toISOString()),
  };
}

export function ClassScheduleTab({
  classId,
  className,
  isTeacher,
  canEditSchedule,
  lessons,
  assignments,
}: {
  classId: string;
  className: string;
  isTeacher: boolean;
  canEditSchedule: boolean;
  lessons: Array<{ id: string; title: string }>;
  assignments: Array<{ id: string; title: string }>;
}) {
  const { tr, locale } = useI18n();
  const queryClient = useQueryClient();

  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ rules: ScheduleRuleDTO[] }>({
    queryKey: ["class-schedule-rules", classId],
    queryFn: () =>
      apiFetchJson(
        `/api/classes/${classId}/schedule-rules`,
        undefined,
        tr("Không tải được lịch lặp tuần", "Could not load weekly rules")
      ),
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{
    sessions: ClassSessionDTO[];
  }>({
    queryKey: ["class-sessions", classId],
    queryFn: () =>
      apiFetchJson(
        `/api/classes/${classId}/sessions`,
        undefined,
        tr("Không tải được danh sách buổi học", "Could not load sessions")
      ),
  });

  const { data: reportData, isLoading: reportLoading } = useQuery<MonthlyReportDTO>({
    queryKey: ["attendance-report", classId, reportYear, reportMonth],
    enabled: isTeacher,
    queryFn: () =>
      apiFetchJson(
        `/api/classes/${classId}/attendance/report?year=${reportYear}&month=${reportMonth}`,
        undefined,
        tr("Không tải được báo cáo chuyên cần", "Could not load monthly attendance report")
      ),
  });

  // Weekly rule dialog state
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleDow, setRuleDow] = useState<number>(3);
  const [ruleStart, setRuleStart] = useState("19:00");
  const [ruleEnd, setRuleEnd] = useState("20:30");
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleMeet, setRuleMeet] = useState("");
  const [ruleWeeks, setRuleWeeks] = useState("12");
  const [savingRule, setSavingRule] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  // Makeup / Create session dialog state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ClassSessionDTO | null>(null);
  const [sesTitle, setSesTitle] = useState("");
  const [sesStart, setSesStart] = useState(() => defaultMakeupWindow().start);
  const [sesEnd, setSesEnd] = useState(() => defaultMakeupWindow().end);
  const [sesMeet, setSesMeet] = useState("");
  const [sesNotes, setSesNotes] = useState("");
  const [sesStatus, setSesStatus] = useState<SessionStatus>("SCHEDULED");
  const [sesLessonIds, setSesLessonIds] = useState<string[]>([]);
  const [sesAssignmentIds, setSesAssignmentIds] = useState<string[]>([]);
  const [savingSession, setSavingSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState<ClassSessionDTO | null>(null);

  // Attendance modal state
  const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);

  const rules = rulesData?.rules ?? [];
  const sessions = sessionsData?.sessions ?? [];

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRule(true);
    try {
      const res = await apiFetchJson<{ generatedCount: number }>(
        `/api/classes/${classId}/schedule-rules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dayOfWeek: ruleDow,
            startTime: ruleStart,
            endTime: ruleEnd,
            title: ruleTitle.trim() || null,
            meetingUrl: ruleMeet.trim() || null,
            generateWeeks: Math.max(1, Math.min(26, Number(ruleWeeks) || 12)),
          }),
        },
        tr("Không tạo được lịch học lặp", "Could not create schedule rule")
      );
      toast.success(
        tr(
          `Đã tạo lịch lặp và sinh ${res.generatedCount} buổi học.`,
          `Created rule and generated ${res.generatedCount} sessions.`
        )
      );
      setRuleOpen(false);
      setRuleTitle("");
      setRuleMeet("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class-schedule-rules", classId] }),
        queryClient.invalidateQueries({ queryKey: ["class-sessions", classId] }),
        queryClient.invalidateQueries({ queryKey: ["schedule-feed"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi tạo lịch", "Error"));
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!deletingRuleId) return;
    try {
      await apiFetchJson(
        `/api/classes/${classId}/schedule-rules?ruleId=${encodeURIComponent(deletingRuleId)}`,
        { method: "DELETE" },
        tr("Không xoá được lịch lặp", "Could not delete rule")
      );
      toast.success(tr("Đã xoá lịch lặp tuần.", "Schedule rule deleted."));
      setDeletingRuleId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class-schedule-rules", classId] }),
        queryClient.invalidateQueries({ queryKey: ["class-sessions", classId] }),
        queryClient.invalidateQueries({ queryKey: ["schedule-feed"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi xoá lịch", "Error"));
    }
  };

  const openCreateMakeup = () => {
    const win = defaultMakeupWindow();
    setEditingSession(null);
    setSesTitle(`${className} — ${tr("Buổi học bù", "Makeup session")}`);
    setSesStart(win.start);
    setSesEnd(win.end);
    setSesMeet("");
    setSesNotes("");
    setSesStatus("SCHEDULED");
    setSesLessonIds([]);
    setSesAssignmentIds([]);
    setSessionDialogOpen(true);
  };

  const openEditSession = (s: ClassSessionDTO) => {
    setEditingSession(s);
    setSesTitle(s.title);
    setSesStart(toDatetimeLocalValue(s.startsAt));
    setSesEnd(toDatetimeLocalValue(s.endsAt));
    setSesMeet(s.meetingUrl ?? "");
    setSesNotes(s.notes ?? "");
    setSesStatus(s.status);
    setSesLessonIds(s.lessonIds ?? []);
    setSesAssignmentIds(s.assignmentIds ?? []);
    setSessionDialogOpen(true);
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSession(true);
    try {
      const startIso = new Date(sesStart).toISOString();
      const endIso = new Date(sesEnd).toISOString();
      if (editingSession) {
        await apiFetchJson(
          `/api/sessions/${editingSession.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: sesTitle.trim(),
              startsAt: startIso,
              endsAt: endIso,
              status: sesStatus,
              meetingUrl: sesMeet.trim() || null,
              notes: sesNotes.trim() || null,
              lessonIds: sesLessonIds,
              assignmentIds: sesAssignmentIds,
            }),
          },
          tr("Không cập nhật được buổi học", "Could not update session")
        );
        toast.success(tr("Đã cập nhật buổi học.", "Session updated."));
      } else {
        await apiFetchJson(
          `/api/classes/${classId}/sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: sesTitle.trim(),
              startsAt: startIso,
              endsAt: endIso,
              isMakeup: true,
              meetingUrl: sesMeet.trim() || null,
              notes: sesNotes.trim() || null,
              lessonIds: sesLessonIds,
              assignmentIds: sesAssignmentIds,
            }),
          },
          tr("Không tạo được buổi học", "Could not create session")
        );
        toast.success(tr("Đã thêm buổi học mới.", "Session added."));
      }
      setSessionDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class-sessions", classId] }),
        queryClient.invalidateQueries({ queryKey: ["schedule-feed"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-report", classId] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi lưu buổi học", "Failed to save"));
    } finally {
      setSavingSession(false);
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!deletingSession) return;
    try {
      await apiFetchJson(
        `/api/sessions/${deletingSession.id}`,
        { method: "DELETE" },
        tr("Không xoá được buổi học", "Could not delete session")
      );
      toast.success(tr("Đã xoá buổi học.", "Session deleted."));
      setDeletingSession(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class-sessions", classId] }),
        queryClient.invalidateQueries({ queryKey: ["schedule-feed"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-report", classId] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi xoá buổi học", "Failed"));
    }
  };

  const toggleId = (list: string[], id: string, setter: (next: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div className="space-y-6">
      {/* Weekly Recurring Schedule Rules */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
              {tr("Lịch học cố định hằng tuần", "Recurring Weekly Timetable")}
            </h3>
            <p className="text-xs text-slate-500">
              {tr(
                "Thiết lập khung giờ lặp hằng tuần để tự động sinh lịch các buổi học cho lớp.",
                "Set recurring weekday slots to auto-generate sessions for this class."
              )}
            </p>
          </div>
          {canEditSchedule && (
            <Button
              type="button"
              variant="accent"
              className="min-h-10"
              data-testid="add-schedule-rule-btn"
              onClick={() => setRuleOpen(true)}
            >
              <CalendarPlus className="h-4 w-4" />
              {tr("Thêm lịch lặp tuần", "Add weekly rule")}
            </Button>
          )}
        </div>

        {rulesLoading ? (
          <p className="text-xs text-slate-400">{tr("Đang tải…", "Loading…")}</p>
        ) : rules.length === 0 ? (
          <p className="text-xs text-slate-400">
            {tr("Chưa có lịch lặp hằng tuần.", "No recurring weekly rules yet.")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((r) => {
              const dayObj = WEEKDAY_LABELS.find((d) => d.dow === r.dayOfWeek);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F9FF] dark:bg-slate-800/60 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#3525CD] dark:text-indigo-300">
                      {locale === "en" ? dayObj?.en : dayObj?.vi} · {r.startTime}–{r.endTime}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {r.title || className} ({r.sessionCount} {tr("buổi", "sess.")})
                    </p>
                  </div>
                  {canEditSchedule && (
                    <button
                      type="button"
                      aria-label={tr("Xoá quy tắc lịch", "Delete schedule rule")}
                      onClick={() => setDeletingRuleId(r.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
              {tr("Danh sách buổi học", "Class Sessions")} ({sessions.length})
            </h3>
            <p className="text-xs text-slate-500">
              {isTeacher
                ? tr("Mở điểm danh 1 chạm hoặc chỉnh sửa giờ học / bài giảng buổi học.", "Take 1-click attendance or edit session details & materials.")
                : tr("Xem giờ học, link vào lớp trực tuyến và trạng thái chuyên cần của bạn.", "View times, live meeting links, and your attendance status.")}
            </p>
          </div>
          {canEditSchedule && (
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              data-testid="add-makeup-session-btn"
              onClick={openCreateMakeup}
            >
              <Plus className="h-4 w-4 text-[#4F46E5]" />
              {tr("Thêm buổi bù / tăng cường", "Add makeup session")}
            </Button>
          )}
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("Đang tải buổi học…", "Loading sessions…")}
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {tr("Chưa có buổi học nào.", "No sessions scheduled yet.")}
          </p>
        ) : (
          <div className="space-y-2.5" data-testid="class-sessions-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                data-testid={`class-session-card-${s.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
                      {s.title}
                    </span>
                    {s.isMakeup && <Badge variant="orange">{tr("Buổi bù", "Makeup")}</Badge>}
                    {s.status === "CANCELLED" ? (
                      <Badge variant="danger">{tr("Đã huỷ", "Cancelled")}</Badge>
                    ) : s.status === "COMPLETED" ? (
                      <Badge variant="mint">{tr("Đã hoàn thành", "Completed")}</Badge>
                    ) : (
                      <Badge variant="indigo">{tr("Theo lịch", "Scheduled")}</Badge>
                    )}
                    {isTeacher && s.attendanceSummary && s.attendanceSummary.totalMarked > 0 && (
                      <Badge variant="neutral">
                        {tr("Có mặt:", "Present:")} {s.attendanceSummary.presentCount} ·{" "}
                        {tr("Muộn:", "Late:")} {s.attendanceSummary.lateCount} ·{" "}
                        {tr("Vắng:", "Absent:")} {s.attendanceSummary.absentCount}
                      </Badge>
                    )}
                    {!isTeacher && s.myAttendance && (
                      <Badge
                        variant={
                          s.myAttendance.status === "PRESENT"
                            ? "mint"
                            : s.myAttendance.status === "ABSENT"
                              ? "danger"
                              : "orange"
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {s.myAttendance.status === "PRESENT"
                          ? tr("Có mặt", "Present")
                          : s.myAttendance.status === "LATE"
                            ? tr("Đi muộn", "Late")
                            : s.myAttendance.status === "EXCUSED"
                              ? tr("Vắng có phép", "Excused")
                              : tr("Vắng không phép", "Absent")}
                      </Badge>
                    )}
                  </div>

                  <p className="flex flex-wrap items-center gap-3 text-xs text-slate-500 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDateTime(s.startsAt, locale)}
                    </span>
                    {s.meetingUrl && (
                      <a
                        href={s.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <Video className="h-3.5 w-3.5" />
                        {tr("Link phòng học", "Live room")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                  {s.notes && (
                    <p className="text-xs text-slate-400 line-clamp-1">{s.notes}</p>
                  )}
                </div>

                {isTeacher && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="accent"
                      className="min-h-9"
                      disabled={s.status === "CANCELLED"}
                      data-testid={`open-attendance-btn-${s.id}`}
                      onClick={() => setAttendanceSessionId(s.id)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {tr("Điểm danh", "Attendance")}
                    </Button>
                    {canEditSchedule && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-9"
                          onClick={() => openEditSession(s)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {tr("Sửa", "Edit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-9 text-red-600 hover:bg-red-50"
                          onClick={() => setDeletingSession(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Attendance Report (Teacher only) */}
      {isTeacher && (
        <div className="stitch-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
            <div>
              <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
                {tr("Báo cáo chuyên cần theo tháng", "Monthly Attendance Report")}
              </h3>
              <p className="text-xs text-slate-500">
                {tr(
                  "Công thức: (Có mặt×1 + Đi muộn×0.8 + Vắng phép×0.5) / Tổng buổi đã điểm danh.",
                  "Formula: (Present×1 + Late×0.8 + Excused×0.5) / Marked sessions."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(Number(e.target.value))}
                aria-label={tr("Tháng", "Month")}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {tr(`Tháng ${i + 1}`, `Month ${i + 1}`)}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                step="1"
                min="2020"
                max="2100"
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value) || now.getFullYear())}
                className="h-9 w-24 text-xs font-semibold"
              />
            </div>
          </div>

          {reportLoading || !reportData ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Đang tính chuyên cần…", "Calculating attendance…")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FF] dark:bg-slate-800/70 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{tr("Học sinh", "Student")}</th>
                    <th className="px-3 py-3 text-center">{tr("Có mặt", "Present")}</th>
                    <th className="px-3 py-3 text-center">{tr("Đi muộn", "Late")}</th>
                    <th className="px-3 py-3 text-center">{tr("Vắng phép", "Excused")}</th>
                    <th className="px-3 py-3 text-center">{tr("Vắng KP", "Absent")}</th>
                    <th className="px-3 py-3 text-center">{tr("% Chuyên cần", "Attendance %")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportData.rows.map((r) => (
                    <tr key={r.student.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-semibold text-[#0B1C30] dark:text-slate-100">
                        {r.student.name}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-emerald-700 font-semibold">
                        {r.summary.presentCount}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-amber-600 font-semibold">
                        {r.summary.lateCount}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-sky-600 font-semibold">
                        {r.summary.excusedCount}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-red-600 font-bold">
                        {r.summary.absentCount}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums font-extrabold text-[#3525CD] dark:text-indigo-300">
                        {r.summary.attendanceRatePct !== null
                          ? `${r.summary.attendanceRatePct}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Weekly Rule Dialog */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent data-testid="schedule-rule-dialog">
          <DialogHeader>
            <DialogTitle>{tr("Thêm lịch học lặp hằng tuần", "Add Weekly Schedule Rule")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Hệ thống tự động tạo các buổi học liên tiếp trong N tuần tới (bỏ qua nếu đã trùng).",
                "Automatically creates recurring class sessions for the next N weeks."
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{tr("Thứ trong tuần", "Weekday")}</Label>
                <select
                  value={ruleDow}
                  onChange={(e) => setRuleDow(Number(e.target.value))}
                  data-testid="rule-dow-select"
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  {WEEKDAY_LABELS.map((d) => (
                    <option key={d.dow} value={d.dow}>
                      {locale === "en" ? d.en : d.vi}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-start">{tr("Giờ bắt đầu", "Start time")}</Label>
                <Input
                  id="rule-start"
                  type="time"
                  value={ruleStart}
                  onChange={(e) => setRuleStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-end">{tr("Giờ kết thúc", "End time")}</Label>
                <Input
                  id="rule-end"
                  type="time"
                  value={ruleEnd}
                  onChange={(e) => setRuleEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rule-title">{tr("Tên buổi mặc định", "Default title")}</Label>
                <Input
                  id="rule-title"
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder={`${className} — Grammar`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-weeks">{tr("Số tuần sinh sẵn", "Generate weeks")}</Label>
                <Input
                  id="rule-weeks"
                  type="number"
                  step="1"
                  min="1"
                  max="26"
                  value={ruleWeeks}
                  onChange={(e) => setRuleWeeks(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-meet">{tr("Link Meet/Zoom cố định (tuỳ chọn)", "Meeting URL (optional)")}</Label>
              <Input
                id="rule-meet"
                value={ruleMeet}
                onChange={(e) => setRuleMeet(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setRuleOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" className="min-h-10" disabled={savingRule} data-testid="save-rule-btn">
                {savingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tr("Tạo lịch học", "Save rule")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Makeup / Edit Session Dialog */}
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent data-testid="session-form-dialog" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSession
                ? tr("Chỉnh sửa buổi học", "Edit Session")
                : tr("Thêm buổi học bù / tăng cường", "Add Makeup Session")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSession} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ses-title">{tr("Tên buổi học", "Session title")}</Label>
              <Input
                id="ses-title"
                data-testid="session-title-input"
                value={sesTitle}
                onChange={(e) => setSesTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ses-start">{tr("Bắt đầu", "Starts at")}</Label>
                <Input
                  id="ses-start"
                  type="datetime-local"
                  value={sesStart}
                  onChange={(e) => setSesStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ses-end">{tr("Kết thúc", "Ends at")}</Label>
                <Input
                  id="ses-end"
                  type="datetime-local"
                  value={sesEnd}
                  onChange={(e) => setSesEnd(e.target.value)}
                  required
                />
              </div>
            </div>

            {editingSession && (
              <div className="space-y-1.5">
                <Label>{tr("Trạng thái buổi học", "Status")}</Label>
                <select
                  value={sesStatus}
                  onChange={(e) => setSesStatus(e.target.value as SessionStatus)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  <option value="SCHEDULED">{tr("Theo lịch", "Scheduled")}</option>
                  <option value="COMPLETED">{tr("Đã hoàn thành", "Completed")}</option>
                  <option value="CANCELLED">{tr("Đã huỷ", "Cancelled")}</option>
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ses-meet">{tr("Link Meet / Zoom (tuỳ chọn)", "Meeting link (optional)")}</Label>
              <Input
                id="ses-meet"
                value={sesMeet}
                onChange={(e) => setSesMeet(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ses-notes">{tr("Ghi chú buổi học", "Notes")}</Label>
              <Textarea
                id="ses-notes"
                rows={2}
                value={sesNotes}
                onChange={(e) => setSesNotes(e.target.value)}
              />
            </div>

            {lessons.length > 0 && (
              <div className="space-y-1.5">
                <Label>{tr("Gắn bài giảng", "Link lessons")}</Label>
                <div className="max-h-28 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
                  {lessons.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={sesLessonIds.includes(l.id)}
                        onChange={() => toggleId(sesLessonIds, l.id, setSesLessonIds)}
                      />
                      <span>{l.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {assignments.length > 0 && (
              <div className="space-y-1.5">
                <Label>{tr("Gắn bài tập", "Link assignments")}</Label>
                <div className="max-h-28 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
                  {assignments.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={sesAssignmentIds.includes(a.id)}
                        onChange={() => toggleId(sesAssignmentIds, a.id, setSesAssignmentIds)}
                      />
                      <span>{a.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setSessionDialogOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" className="min-h-10" disabled={savingSession} data-testid="save-session-btn">
                {savingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tr("Lưu buổi học", "Save session")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirm Dialog */}
      <Dialog open={Boolean(deletingRuleId)} onOpenChange={(o) => !o && setDeletingRuleId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá lịch lặp hằng tuần?", "Delete weekly schedule rule?")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Các buổi sắp tới chưa điểm danh thuộc quy tắc này sẽ bị xoá; lịch sử các buổi cũ đã điểm danh vẫn được giữ nguyên.",
                "Upcoming unmarked sessions from this rule will be removed; past attended sessions are preserved."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" onClick={() => setDeletingRuleId(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button type="button" variant="destructive" className="min-h-10" onClick={() => void handleDeleteRule()}>
              {tr("Xoá lịch lặp", "Delete rule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Session Confirm Dialog */}
      <Dialog open={Boolean(deletingSession)} onOpenChange={(o) => !o && setDeletingSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá buổi học?", "Delete session?")}</DialogTitle>
            <DialogDescription>
              {deletingSession
                ? tr(
                    `Xoá vĩnh viễn buổi "${deletingSession.title}" và dữ liệu điểm danh của buổi này?`,
                    `Delete "${deletingSession.title}" and its attendance records?`
                  )
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" onClick={() => setDeletingSession(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button type="button" variant="destructive" className="min-h-10" onClick={() => void handleConfirmDeleteSession()}>
              {tr("Xoá", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance Modal */}
      {isTeacher && (
        <AttendanceSheetDialog
          sessionId={attendanceSessionId}
          open={Boolean(attendanceSessionId)}
          onOpenChange={(o) => !o && setAttendanceSessionId(null)}
        />
      )}
    </div>
  );
}
