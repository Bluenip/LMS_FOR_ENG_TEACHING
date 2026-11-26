"use client";

import { BackLink } from "@/components/navigation/BackLink";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Bell,
  Camera,
  CameraOff,
  CheckCircle2,
  Flag,
  Headphones,
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
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LiveStudentCard {
  studentId: string;
  studentName: string;
  studentEmail: string;
  submissionId: string | null;
  liveStatus: "NOT_STARTED" | "IN_PROGRESS" | "LEFT_TAB" | "CAMERA_OFF" | "LOCKED" | "SUBMITTED";
  answeredCount: number;
  totalQuestions: number;
  violationCount: number;
  restartCount: number;
  flagged: boolean;
  lockedAt: string | null;
  audioPlayCounts?: Record<string, number>;
  totalAudioPlays?: number;
  remainingSeconds: number | null;
  events: Array<{
    id: string;
    type: ProctorEventType;
    at: string;
    durationMs: number | null;
    meta?: Record<string, unknown> | null;
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
    requireCamera?: boolean;
    cameraEnforce?: boolean;
    cameraCountLookAway?: boolean;
    requireMicMonitor?: boolean;
    audioMaxPlays?: number | null;
    audios?: Array<{ id: string; title: string }>;
    timeLimitMin: number | null;
    totalQuestions: number;
  };
  counts: {
    total: number;
    inProgress: number;
    submitted: number;
    leftTab: number;
    cameraOff?: number;
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
    meta?: Record<string, unknown> | null;
    message?: string;
  }>;
}

function getSnapshotKey(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  return typeof meta.snapshotKey === "string" && meta.snapshotKey.length > 0
    ? meta.snapshotKey
    : null;
}

const SUSPECTED_TYPES = new Set<ProctorEventType>([
  "DEVTOOLS_SUSPECTED",
  "PASTE_SUSPECTED",
  "CAMERA_LOOK_AWAY",
  "CAMERA_GAZE_AWAY",
  "CAMERA_NO_FACE",
  "CAMERA_MULTI_FACE",
  "CAMERA_PHONE",
  "MIC_VOICE",
  "MOBILE_APP_SWITCH",
]);

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
  const { m: vi, tr } = useI18n();
  // refs so long-lived effects (listeners, SSE, PDF loading) don't restart on language change
  const trRef = useRef(tr);
  trRef.current = tr;
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const queryClient = useQueryClient();

  const [sseConnected, setSseConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [liveAlerts, setLiveAlerts] = useState<LiveProctorPayload[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [lightboxSnap, setLightboxSnap] = useState<{ url: string; caption: string } | null>(null);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const { data: snapshot, isLoading } = useQuery<LiveSnapshot>({
    queryKey: ["live-proctor", assignmentId],
    queryFn: () =>
      apiFetchJson<LiveSnapshot>(
        `/api/assignments/${assignmentId}/live?mode=snapshot`,
        undefined,
        tr("Không tải được phòng giám sát trực tiếp", "Could not load the live proctoring room")
      ),
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
            toast.error(payload.message ?? trRef.current(`${payload.studentName} có hành vi bất thường!`, `${payload.studentName} shows unusual behaviour!`), {
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
      toast.error(tr("Thao tác thất bại", "Action failed"));
      return;
    }
    const labels: Record<typeof action, string> = {
      UNLOCK: tr("Đã mở khoá bài thi cho học sinh!", "Exam unlocked for the student!"),
      LOCK: tr("Đã khoá bài thi!", "Exam locked!"),
      FORCE_SUBMIT: tr("Đã thu bài học sinh!", "Student's exam collected!"),
      REMIND: tr("Đã gửi nhắc nhở tới màn hình học sinh!", "Reminder sent to the student's screen!"),
      FLAG: tr("Đã đánh dấu nghi vấn.", "Flagged as suspicious."),
      UNFLAG: tr("Đã bỏ đánh dấu nghi vấn.", "Flag removed."),
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
            <BackLink
              iconOnly
              fallbackHref={`/teacher/assignments/${assignmentId}/grading`}
              label={tr("Quay lại", "Back")}
            />
            <Badge variant="danger" className="gap-1.5 px-3 py-1">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {tr("TRỰC TIẾP (LIVE)", "LIVE")}
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
              {sseConnected ? tr("SSE Đã kết nối", "SSE connected") : tr("Đang kết nối…", "Connecting…")}
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
              {tr("Âm thanh", "Sound")}
            </Button>
          </div>
        </div>

        {/* Status Summary Pills */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            {tr("• Đang làm:", "• In progress:")} {snapshot.counts.inProgress}
          </span>
          <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[#3525CD]">
            {tr("✓ Đã nộp:", "✓ Submitted:")} {snapshot.counts.submitted}
          </span>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">
            {tr("⚠ Rời tab:", "⚠ Left tab:")} {snapshot.counts.leftTab}
          </span>
          {snapshot.assignment.requireCamera && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-[#BA1A1A] inline-flex items-center gap-1">
              <CameraOff className="h-3 w-3" />
              {tr("Camera tắt:", "Cam off:")} {snapshot.counts.cameraOff ?? 0}
            </span>
          )}
          <span className="rounded-full bg-red-50 px-3 py-1 text-[#BA1A1A]">
            {tr("🔒 Bị khoá:", "🔒 Locked:")} {snapshot.counts.locked}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {tr("Chưa vào:", "Not joined:")} {snapshot.counts.notStarted}
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
                st.liveStatus === "LOCKED" || st.liveStatus === "CAMERA_OFF"
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
                    {st.liveStatus === "IN_PROGRESS" && <Badge variant="mint">{tr("Đang làm", "In progress")}</Badge>}
                    {st.liveStatus === "SUBMITTED" && <Badge variant="default">{tr("Đã nộp", "Submitted")}</Badge>}
                    {st.liveStatus === "LEFT_TAB" && <Badge variant="orange">{tr("Rời tab", "Left tab")}</Badge>}
                    {st.liveStatus === "CAMERA_OFF" && (
                      <Badge variant="danger">
                        <CameraOff className="h-3 w-3" /> {tr("Camera tắt", "Cam off")}
                      </Badge>
                    )}
                    {st.liveStatus === "LOCKED" && (
                      <Badge variant="danger">
                        <Lock className="h-3 w-3" /> {tr("Bị khoá", "Locked")}
                      </Badge>
                    )}
                    {st.liveStatus === "NOT_STARTED" && (
                      <Badge variant="neutral">{tr("Chưa vào", "Not joined")}</Badge>
                    )}

                    <Badge variant={st.violationCount > 0 ? "danger" : "neutral"}>
                      {st.violationCount} {tr("vi phạm", "violations")}
                    </Badge>
                    {(snapshot.assignment.audios?.length ?? 0) > 0 && st.submissionId && (
                      <Badge variant="outline" className="text-[10px]">
                        <Headphones className="h-2.5 w-2.5" /> {st.totalAudioPlays ?? 0}{" "}
                        {tr("lượt nghe", "plays")}
                      </Badge>
                    )}
                    {st.flagged && <Badge variant="danger">{tr("Nghi vấn", "Suspicious")}</Badge>}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 tabular-nums">
                      <span>{tr("Tiến độ", "Progress")}</span>
                      <span>
                        {st.answeredCount}/{st.totalQuestions} {tr("câu", "questions")}
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
                      ) : st.liveStatus === "IN_PROGRESS" ||
                        st.liveStatus === "LEFT_TAB" ||
                        st.liveStatus === "CAMERA_OFF" ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-[11px]"
                            onClick={() => void sendAction(st.submissionId!, "REMIND")}
                          >
                            <Bell className="h-3 w-3" />
                            {tr("Nhắc", "Remind")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-[11px]"
                            onClick={() => void sendAction(st.submissionId!, "LOCK")}
                          >
                            <Lock className="h-3 w-3" />
                            {tr("Khoá", "Lock")}
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
                          {tr("Thu bài", "Collect")}
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
                {liveAlerts.length + snapshot.recentEvents.length} {tr("sự kiện", "events")}
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
                      {tr("Mới", "New")}
                    </Badge>
                  </div>
                  <p className="font-bold text-[#0B1C30]">{al.studentName}</p>
                  <p className="text-[#93000A]">
                    {al.message ??
                      (al.eventType ? vi.proctor.events[al.eventType] : tr("Sự kiện giám sát", "Proctoring event"))}
                  </p>
                </div>
              ))}

              {snapshot.recentEvents.map((ev) => {
                const snapKey = getSnapshotKey(ev.meta);
                const isSuspected =
                  SUSPECTED_TYPES.has(ev.type) &&
                  !(
                    snapshot.assignment.cameraEnforce &&
                    (ev.type === "CAMERA_NO_FACE" ||
                      ev.type === "CAMERA_MULTI_FACE" ||
                      ev.type === "CAMERA_PHONE" ||
                      (snapshot.assignment.cameraCountLookAway &&
                        ev.type === "CAMERA_LOOK_AWAY"))
                  );
                return (
                  <div
                    key={ev.id}
                    className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatDateTime(ev.at)}
                      </span>
                      <Badge variant={isSuspected ? "outline" : "orange"} className="text-[10px]">
                        {ev.type.startsWith("CAMERA_") && <Camera className="h-2.5 w-2.5" />}
                        {isSuspected ? tr("Nghi vấn", "Suspicious") : tr("Vi phạm", "Violation")}
                      </Badge>
                    </div>
                    <p className="font-bold text-[#0B1C30]">{ev.studentName}</p>
                    <p className="text-[#464555]">
                      {vi.proctor.events[ev.type] ?? ev.type}
                      {ev.durationMs ? ` (${Math.round(ev.durationMs / 1000)}s)` : ""}
                    </p>
                    {snapKey && (
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxSnap({
                            url: `/api/files/${snapKey}`,
                            caption: `${ev.studentName} — ${vi.proctor.events[ev.type] ?? ev.type} (${formatDateTime(ev.at)})`,
                          })
                        }
                        className="group relative block overflow-hidden rounded-lg border border-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/${snapKey}`}
                          alt={vi.proctor.events[ev.type] ?? ev.type}
                          className="h-20 w-28 object-cover transition group-hover:opacity-90"
                        />
                        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          {tr("Phóng to", "Zoom")}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}

              {liveAlerts.length === 0 && snapshot.recentEvents.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-400 space-y-2">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />
                  <p>{tr("Chưa ghi nhận hành vi bất thường nào.", "No unusual behaviour recorded yet.")}</p>
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
                <p className="text-xs text-slate-400">{tr("Học sinh này chưa có sự kiện vi phạm nào.", "This student has no violation events.")}</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {inspectedStudent.events.map((ev) => {
                    const snapKey = getSnapshotKey(ev.meta);
                    return (
                      <div
                        key={ev.id}
                        className="rounded-lg bg-[#F8F9FF] px-3 py-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#0B1C30]">
                            {vi.proctor.events[ev.type] ?? ev.type}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {formatDateTime(ev.at)}
                          </span>
                        </div>
                        {snapKey && (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxSnap({
                                url: `/api/files/${snapKey}`,
                                caption: `${inspectedStudent.studentName} — ${vi.proctor.events[ev.type] ?? ev.type} (${formatDateTime(ev.at)})`,
                              })
                            }
                            className="overflow-hidden rounded border border-slate-200"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/files/${snapKey}`}
                              alt={vi.proctor.events[ev.type] ?? ev.type}
                              className="h-16 w-24 object-cover"
                            />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Snapshot Lightbox Modal */}
      <Dialog open={Boolean(lightboxSnap)} onOpenChange={(o) => !o && setLightboxSnap(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{lightboxSnap?.caption}</DialogTitle>
          </DialogHeader>
          {lightboxSnap && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightboxSnap.url}
              alt={lightboxSnap.caption}
              className="w-full rounded-xl border border-slate-200"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
