"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Flag,
  Lock,
  Radio,
  Send,
  ShieldAlert,
  Unlock,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ProctorEventType } from "@prisma/client";
import type { LiveProctorPayload } from "@/lib/proctor-bus";
import { cn, formatDateTime, formatSecondsMMSS } from "@/lib/utils";
import { vi } from "@/messages/vi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LiveStudentCard {
  studentId: string;
  studentName: string;
  studentEmail: string;
  submissionId: string | null;
  liveStatus: "NOT_STARTED" | "IN_PROGRESS" | "LEFT_TAB" | "LOCKED" | "SUBMITTED";
  answeredCount: number;
  totalQuestions: number;
  violationCount: number;
  restartCount: number;
  flagged: boolean;
  lockedAt: string | null;
  remainingSeconds: number | null;
  events: Array<{
    id: string;
    type: ProctorEventType;
    at: string;
    durationMs: number | null;
  }>;
}

interface LiveSnapshot {
  assignment: {
    id: string;
    title: string;
    classId: string;
    className: string;
    proctorMode: string;
    violationAction: string;
    maxViolations: number;
    timeLimitMin: number | null;
    totalQuestions: number;
  };
  counts: {
    total: number;
    inProgress: number;
    submitted: number;
    leftTab: number;
    locked: number;
    notStarted: number;
  };
  students: LiveStudentCard[];
  recentEvents: Array<{
    id: string;
    submissionId: string;
    studentId: string;
    studentName: string;
    type: ProctorEventType;
    at: string;
    durationMs: number | null;
    message?: string;
  }>;
}

function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore autoplay restriction if user hasn't interacted yet
  }
}

export default function TeacherLiveProctorPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const queryClient = useQueryClient();

  const [sseConnected, setSseConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [liveAlerts, setLiveAlerts] = useState<LiveProctorPayload[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const { data: snapshot, isLoading } = useQuery<LiveSnapshot>({
    queryKey: ["live-proctor", assignmentId],
    queryFn: async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/live?mode=snapshot`);
      if (!res.ok) throw new Error("Không tải được phòng giám sát trực tiếp");
      return res.json();
    },
    refetchInterval: 8000,
  });

  // Subscribe to Realtime SSE stream (/api/assignments/:id/live)
  useEffect(() => {
    const source = new EventSource(`/api/assignments/${assignmentId}/live`);

    source.addEventListener("connected", () => {
      setSseConnected(true);
    });

    source.addEventListener("proctor", (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as LiveProctorPayload;
        if (
          payload.kind === "PROCTOR_EVENT" ||
          payload.kind === "SUBMISSION_LOCKED" ||
          payload.kind === "SUBMISSION_RESTARTED" ||
          payload.kind === "SUBMISSION_SUBMITTED"
        ) {
          setLiveAlerts((prev) => [payload, ...prev].slice(0, 40));
          if (payload.kind !== "SUBMISSION_SUBMITTED") {
            if (soundRef.current) playAlertChime();
            toast.error(payload.message ?? `${payload.studentName} có hành vi bất thường!`, {
              duration: 6000,
            });
          }
        }
        // Immediately refresh grid state
        queryClient.invalidateQueries({ queryKey: ["live-proctor", assignmentId] });
      } catch {
        // ignore parse errors
      }
    });

    source.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      source.close();
    };
  }, [assignmentId, queryClient]);

  const sendAction = async (
    submissionId: string,
    action: "UNLOCK" | "LOCK" | "FORCE_SUBMIT" | "REMIND" | "FLAG" | "UNFLAG"
  ) => {
    const res = await fetch(
      `/api/assignments/${assignmentId}/live/${submissionId}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }
    );
    if (!res.ok) {
      toast.error("Thao tác thất bại");
      return;
    }
    const labels: Record<typeof action, string> = {
      UNLOCK: "Đã mở khoá bài thi cho học sinh!",
      LOCK: "Đã khoá bài thi!",
      FORCE_SUBMIT: "Đã thu bài học sinh!",
      REMIND: "Đã gửi nhắc nhở tới màn hình học sinh!",
      FLAG: "Đã đánh dấu nghi vấn.",
      UNFLAG: "Đã bỏ đánh dấu nghi vấn.",
    };
    toast.success(labels[action]);
    queryClient.invalidateQueries({ queryKey: ["live-proctor", assignmentId] });
  };

  if (isLoading || !snapshot) {
    return (
      <div className="stitch-card p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  const inspectedStudent = snapshot.students.find((s) => s.studentId === selectedStudentId);

  return (
    <div className="space-y-5">
      {/* Top Stitch Live Header */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/teacher/assignments/${assignmentId}/grading`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Badge variant="danger" className="gap-1.5 px-3 py-1">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              TRỰC TIẾP (LIVE)
            </Badge>
            <h1 className="text-lg sm:text-xl font-bold text-[#0B1C30]">
              {snapshot.assignment.title}
            </h1>
            <Badge variant="default">{snapshot.assignment.className}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <span
              data-testid="sse-status"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                sseConnected
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  sseConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                )}
              />
              {sseConnected ? "SSE Đã kết nối" : "Đang kết nối…"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSoundEnabled((v) => !v)}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-[#4F46E5]" />
              ) : (
                <VolumeX className="h-4 w-4 text-slate-400" />
              )}
              Âm thanh
            </Button>
          </div>
        </div>

        {/* Status Summary Pills */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            • Đang làm: {snapshot.counts.inProgress}
          </span>
          <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[#3525CD]">
            ✓ Đã nộp: {snapshot.counts.submitted}
          </span>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">
            ⚠ Rời tab: {snapshot.counts.leftTab}
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-[#BA1A1A]">
            🔒 Bị khoá: {snapshot.counts.locked}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            Chưa vào: {snapshot.counts.notStarted}
          </span>
        </div>
      </div>

      {/* Main 2-column layout: Student Grid + Realtime Alerts Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left: Student Grid */}
        <div className="lg:col-span-8 space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {snapshot.students.map((st) => {
              const pct =
                st.totalQuestions > 0
                  ? Math.round((st.answeredCount / st.totalQuestions) * 100)
                  : 0;
              const borderStyle =
                st.liveStatus === "LOCKED"
                  ? "border-2 border-[#BA1A1A] bg-red-50/30"
                  : st.liveStatus === "LEFT_TAB"
                    ? "border-2 border-[#F97316] bg-orange-50/30"
                    : "border border-slate-200/80 bg-white";

              return (
                <div
                  key={st.studentId}
                  onClick={() => setSelectedStudentId(st.studentId)}
                  className={cn(
                    "cursor-pointer rounded-2xl p-4 shadow-card transition hover:shadow-card-hover space-y-3",
                    borderStyle,
                    selectedStudentId === st.studentId && "ring-2 ring-[#4F46E5]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#0B1C30]">
                        {st.studentName}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">{st.studentEmail}</p>
                    </div>
                    {st.remainingSeconds !== null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 tabular-nums">
                        {formatSecondsMMSS(st.remainingSeconds)}
                      </span>
                    )}
                  </div>

                  {/* Status + Violations */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {st.liveStatus === "IN_PROGRESS" && <Badge variant="mint">Đang làm</Badge>}
                    {st.liveStatus === "SUBMITTED" && <Badge variant="default">Đã nộp</Badge>}
                    {st.liveStatus === "LEFT_TAB" && <Badge variant="orange">Rời tab</Badge>}
                    {st.liveStatus === "LOCKED" && (
                      <Badge variant="danger">
                        <Lock className="h-3 w-3" /> Bị khoá
                      </Badge>
                    )}
                    {st.liveStatus === "NOT_STARTED" && (
                      <Badge variant="neutral">Chưa vào</Badge>
                    )}

                    <Badge variant={st.violationCount > 0 ? "danger" : "neutral"}>
                      {st.violationCount} vi phạm
                    </Badge>
                    {st.flagged && <Badge variant="danger">Nghi vấn</Badge>}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 tabular-nums">
                      <span>Tiến độ</span>
                      <span>
                        {st.answeredCount}/{st.totalQuestions} câu
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          st.liveStatus === "SUBMITTED"
                            ? "bg-emerald-500"
                            : st.liveStatus === "LOCKED"
                              ? "bg-red-500"
                              : "bg-[#4F46E5]"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Direct Teacher Actions */}
                  {st.submissionId && (
                    <div
                      className="flex flex-wrap gap-1.5 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {st.liveStatus === "LOCKED" ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 flex-1 text-[11px]"
                          onClick={() => void sendAction(st.submissionId!, "UNLOCK")}
                        >
                          <Unlock className="h-3 w-3" />
                          {vi.proctor.unlock}
                        </Button>
                      ) : st.liveStatus === "IN_PROGRESS" || st.liveStatus === "LEFT_TAB" ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-[11px]"
                            onClick={() => void sendAction(st.submissionId!, "REMIND")}
                          >
                            <Bell className="h-3 w-3" />
                            Nhắc
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-[11px]"
                            onClick={() => void sendAction(st.submissionId!, "LOCK")}
                          >
                            <Lock className="h-3 w-3" />
                            Khoá
                          </Button>
                        </>
                      ) : null}

                      {st.liveStatus !== "SUBMITTED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => void sendAction(st.submissionId!, "FORCE_SUBMIT")}
                        >
                          <Send className="h-3 w-3" />
                          Thu bài
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          void sendAction(st.submissionId!, st.flagged ? "UNFLAG" : "FLAG")
                        }
                        title={st.flagged ? vi.proctor.unflag : vi.proctor.flag}
                      >
                        <Flag
                          className={cn(
                            "h-3 w-3",
                            st.flagged ? "fill-red-500 text-red-500" : "text-slate-400"
                          )}
                        />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Realtime Alerts Feed & Student Event Timeline */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="stitch-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-sm font-bold text-[#0B1C30]">
                  {vi.proctor.liveAlerts}
                </h2>
              </div>
              <Badge variant="neutral">
                {liveAlerts.length + snapshot.recentEvents.length} sự kiện
              </Badge>
            </div>

            <div
              data-testid="live-alerts-feed"
              className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1"
            >
              {liveAlerts.map((al, i) => (
                <div
                  key={`live-${al.at}-${i}`}
                  className="rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[#BA1A1A]">
                      {formatDateTime(al.at)}
                    </span>
                    <Badge variant="danger" className="text-[10px]">
                      Mới
                    </Badge>
                  </div>
                  <p className="font-bold text-[#0B1C30]">{al.studentName}</p>
                  <p className="text-[#93000A]">
                    {al.message ??
                      (al.eventType ? vi.proctor.events[al.eventType] : "Sự kiện giám sát")}
                  </p>
                </div>
              ))}

              {snapshot.recentEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-400">
                      {formatDateTime(ev.at)}
                    </span>
                    <Badge variant="orange" className="text-[10px]">
                      {ev.type === "DEVTOOLS_SUSPECTED" ? "Nghi vấn" : "Vi phạm"}
                    </Badge>
                  </div>
                  <p className="font-bold text-[#0B1C30]">{ev.studentName}</p>
                  <p className="text-[#464555]">
                    {vi.proctor.events[ev.type] ?? ev.type}
                    {ev.durationMs ? ` (${Math.round(ev.durationMs / 1000)}s)` : ""}
                  </p>
                </div>
              ))}

              {liveAlerts.length === 0 && snapshot.recentEvents.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-400 space-y-2">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />
                  <p>Chưa ghi nhận hành vi bất thường nào.</p>
                </div>
              )}
            </div>
          </div>

          {/* Selected Student Timeline */}
          {inspectedStudent && (
            <div className="stitch-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0B1C30]">
                  Timeline: {inspectedStudent.studentName}
                </h3>
                <ShieldAlert className="h-4 w-4 text-[#F97316]" />
              </div>
              {inspectedStudent.events.length === 0 ? (
                <p className="text-xs text-slate-400">Học sinh này chưa có sự kiện vi phạm nào.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {inspectedStudent.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between rounded-lg bg-[#F8F9FF] px-3 py-2"
                    >
                      <span className="font-medium text-[#0B1C30]">
                        {vi.proctor.events[ev.type] ?? ev.type}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {formatDateTime(ev.at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
