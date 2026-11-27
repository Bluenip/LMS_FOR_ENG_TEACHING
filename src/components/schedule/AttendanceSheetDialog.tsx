"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import type { AttendanceStatus } from "@prisma/client";
import { CheckCheck, Loader2, Save, Users } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BehaviorQuickAwardRow, useSessionBehaviorTotals } from "@/components/classes/ClassBehaviorTab";

interface AttendanceStudentRow {
  studentId: string;
  name: string;
  email: string;
  status: AttendanceStatus | null;
  note: string | null;
  markedAt: string | null;
}

interface SessionAttendancePayload {
  session: {
    id: string;
    classId: string;
    className: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: string;
  };
  students: AttendanceStudentRow[];
  summary: {
    presentCount: number;
    lateCount: number;
    excusedCount: number;
    absentCount: number;
    totalMarked: number;
    attendanceRatePct: number | null;
  };
}

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  labelVi: string;
  labelEn: string;
  activeClass: string;
}> = [
  {
    value: "PRESENT",
    labelVi: "Có mặt",
    labelEn: "Present",
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    value: "LATE",
    labelVi: "Đi muộn",
    labelEn: "Late",
    activeClass: "border-amber-500 bg-amber-500 text-white",
  },
  {
    value: "EXCUSED",
    labelVi: "Vắng phép",
    labelEn: "Excused",
    activeClass: "border-sky-600 bg-sky-600 text-white",
  },
  {
    value: "ABSENT",
    labelVi: "Vắng KP",
    labelEn: "Absent",
    activeClass: "border-red-600 bg-red-600 text-white",
  },
];

export function AttendanceSheetDialog({
  sessionId,
  open,
  onOpenChange,
  onSaved,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { tr } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SessionAttendancePayload>({
    queryKey: ["session-attendance", sessionId],
    enabled: open && Boolean(sessionId),
    queryFn: () =>
      apiFetchJson<SessionAttendancePayload>(
        `/api/sessions/${sessionId}/attendance`,
        undefined,
        tr("Không tải được danh sách điểm danh", "Could not load attendance sheet")
      ),
  });
  const { data: behaviorData } = useSessionBehaviorTotals(
    data?.session.classId ?? "",
    sessionId ?? "",
    open && Boolean(data?.session.classId && sessionId)
  );
  const behaviorTotals = new Map(
    (behaviorData?.students ?? []).map((row) => [row.student.id, row.total])
  );

  const [draftStatuses, setDraftStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const stMap: Record<string, AttendanceStatus> = {};
    const ntMap: Record<string, string> = {};
    for (const row of data.students) {
      stMap[row.studentId] = row.status ?? "PRESENT";
      ntMap[row.studentId] = row.note ?? "";
    }
    setDraftStatuses(stMap);
    setDraftNotes(ntMap);
  }, [data]);

  const handleMarkAllPresent = () => {
    if (!data) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const s of data.students) {
      next[s.studentId] = "PRESENT";
    }
    setDraftStatuses(next);
  };

  const handleSave = async () => {
    if (!sessionId || !data || data.students.length === 0) return;
    setSaving(true);
    try {
      await apiFetchJson(
        `/api/sessions/${sessionId}/attendance`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: data.students.map((s) => ({
              studentId: s.studentId,
              status: draftStatuses[s.studentId] ?? "PRESENT",
              note: draftNotes[s.studentId]?.trim() || null,
            })),
          }),
        },
        tr("Lưu điểm danh thất bại", "Could not save attendance")
      );
      toast.success(tr("Đã lưu điểm danh buổi học.", "Attendance saved."));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session-attendance", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["class-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-report"] }),
        queryClient.invalidateQueries({ queryKey: ["schedule-feed"] }),
        queryClient.invalidateQueries({ queryKey: ["class-gradebook"] }),
      ]);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi lưu điểm danh", "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const counts = data
    ? data.students.reduce(
        (acc, s) => {
          const st = draftStatuses[s.studentId] ?? "PRESENT";
          acc[st]++;
          return acc;
        },
        { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0 }
      )
    : { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="attendance-sheet-dialog"
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#4F46E5]" />
            {tr("Điểm danh buổi học", "Session Attendance")}
          </DialogTitle>
          {data && (
            <DialogDescription>
              {data.session.className} • {data.session.title} • {formatDateTime(data.session.startsAt)}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("Đang tải danh sách lớp…", "Loading class roster…")}
          </div>
        ) : data.students.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            {tr("Lớp chưa có học sinh đang hoạt động.", "No active students in this class.")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F8F9FF] dark:bg-slate-800/70 p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="mint">{tr("Có mặt:", "Present:")} {counts.PRESENT}</Badge>
                <Badge variant="orange">{tr("Đi muộn:", "Late:")} {counts.LATE}</Badge>
                <Badge variant="sky">{tr("Vắng phép:", "Excused:")} {counts.EXCUSED}</Badge>
                <Badge variant="danger">{tr("Vắng KP:", "Absent:")} {counts.ABSENT}</Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                data-testid="mark-all-present-btn"
                onClick={handleMarkAllPresent}
              >
                <CheckCheck className="h-4 w-4 text-emerald-600" />
                {tr("Tất cả có mặt", "Mark all present")}
              </Button>
            </div>

            <div className="space-y-2.5">
              {data.students.map((stu, idx) => {
                const current = draftStatuses[stu.studentId] ?? "PRESENT";
                return (
                  <div
                    key={stu.studentId}
                    data-testid={`attendance-row-${stu.studentId}`}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
                          {idx + 1}. {stu.name}
                        </p>
                        <p className="text-[11px] text-slate-400">{stu.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map((opt) => {
                          const active = current === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              data-testid={`att-btn-${stu.studentId}-${opt.value}`}
                              onClick={() =>
                                setDraftStatuses((prev) => ({
                                  ...prev,
                                  [stu.studentId]: opt.value,
                                }))
                              }
                              className={`min-h-9 rounded-lg border px-2.5 text-xs font-semibold transition ${
                                active
                                  ? opt.activeClass
                                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              {tr(opt.labelVi, opt.labelEn)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Input
                      value={draftNotes[stu.studentId] ?? ""}
                      onChange={(e) =>
                        setDraftNotes((prev) => ({ ...prev, [stu.studentId]: e.target.value }))
                      }
                      data-testid={`att-note-${stu.studentId}`}
                      placeholder={tr("Ghi chú (tuỳ chọn, ví dụ: xin nghỉ ốm)…", "Optional note…")}
                      className="h-9 text-xs"
                    />
                    {sessionId && (
                      <BehaviorQuickAwardRow
                        classId={data.session.classId}
                        sessionId={sessionId}
                        studentId={stu.studentId}
                        sessionTotal={behaviorTotals.get(stu.studentId) ?? 0}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-10"
                onClick={() => onOpenChange(false)}
              >
                {tr("Đóng", "Close")}
              </Button>
              <Button
                type="button"
                variant="accent"
                className="min-h-10"
                disabled={saving || data.session.status === "CANCELLED"}
                data-testid="save-attendance-btn"
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {tr("Lưu điểm danh", "Save attendance")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
