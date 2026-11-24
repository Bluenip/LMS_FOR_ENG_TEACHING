"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Maximize2,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldAlert,
  Trophy,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ProctorEventType, ProctorMode, ViolationAction } from "@prisma/client";
import type { AnswerValue } from "@/lib/grading/types";
import { cn, formatScore, formatSecondsMMSS } from "@/lib/utils";
import { vi } from "@/messages/vi";
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
import { PdfCanvasPage, usePdfDocument } from "@/components/worksheet/PdfCanvasPage";
import { OverlayFieldInput } from "@/components/worksheet/OverlayFieldInput";
import { AnswerSheetPanel } from "@/components/worksheet/AnswerSheetPanel";
import {
  isAnswerFilled,
  type StudentFieldDTO,
  type WorksheetPageDTO,
} from "@/components/worksheet/types";

interface StudentAssignmentPayload {
  serverNow: string;
  assignment: {
    id: string;
    classId: string;
    title: string;
    openAt: string | null;
    dueAt: string | null;
    timeLimitMin: number | null;
    maxAttempts: number;
    showResult: "NEVER" | "AFTER_SUBMIT" | "AFTER_DUE";
    showAnswerKey: boolean;
    showLeaderboard: string;
    proctorMode: ProctorMode;
    violationAction: ViolationAction;
    maxViolations: number;
    requireFullscreen: boolean;
    blockCopyPaste: boolean;
    class: { id: string; name: string };
    worksheet: {
      id: string;
      title: string;
      instructions: string | null;
      pdfFileKey: string | null;
      pageCount: number;
      questionCount: number;
      pages: WorksheetPageDTO[];
      fields: StudentFieldDTO[];
    };
  };
  submission: {
    id: string;
    attemptNo: number;
    status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
    startedAt: string;
    submittedAt: string | null;
    isLate: boolean;
    maxScore: number;
    totalScore: number | null;
    autoScore: number | null;
    manualScore: number | null;
    teacherComment: string | null;
    violationCount: number;
    lockedAt: string | null;
    attemptVersion: number;
    restartCount: number;
    rulesAcceptedAt: string | null;
    attemptToken: string | null;
    remainingSeconds: number | null;
    answers: Array<{
      fieldId: string;
      value: AnswerValue;
      isCorrect: boolean | null;
      score: number | null;
      teacherNote: string | null;
    }>;
  } | null;
  attemptsSummary: Array<{
    id: string;
    attemptNo: number;
    status: string;
    totalScore: number | null;
    maxScore: number;
  }>;
  revealResult: boolean;
  revealKey: boolean;
  canStartNewAttempt: boolean;
}

interface QueuedProctorEvent {
  type: ProctorEventType;
  durationMs?: number;
  clientAt: string;
  meta?: Record<string, unknown>;
}

export default function StudentDoAssignmentPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const router = useRouter();

  const [payload, setPayload] = useState<StudentAssignmentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [attemptVersion, setAttemptVersion] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [restartedBanner, setRestartedBanner] = useState<string | null>(null);
  const [leftOverlay, setLeftOverlay] = useState<{ visible: boolean; at: string } | null>(null);
  // Exam requires fullscreen but the page is not in fullscreen (e.g. the browser refused the
  // request on start, or the page was reloaded): block the content until the student enters it.
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const [zoom, setZoom] = useState(1.0);
  // On narrow screens start with the PDF fitted to the screen width (760px = 100%)
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 820) return;
    const fit = Math.floor(((window.innerWidth - 48) / 760) * 20) / 20;
    setZoom(Math.max(0.3, Math.min(1, fit)));
  }, []);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "error">("saved");
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startingAttempt, setStartingAttempt] = useState(false);

  const dirtyFieldIdsRef = useRef<Set<string>>(new Set());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const attemptVersionRef = useRef(attemptVersion);
  attemptVersionRef.current = attemptVersion;
  const lastBlurReportRef = useRef<number>(0);
  const hiddenStartedAtRef = useRef<number | null>(null);

  const fetchPayload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không tải được bài tập");
      const data = json as StudentAssignmentPayload;

      // Redirect to mandatory rules page if proctored and rules not yet accepted on active submission
      if (
        data.assignment.proctorMode !== "OFF" &&
        (!data.submission ||
          (data.submission.status === "IN_PROGRESS" && !data.submission.rulesAcceptedAt))
      ) {
        if (data.canStartNewAttempt || data.submission?.status === "IN_PROGRESS") {
          router.replace(`/student/assignments/${assignmentId}/rules`);
          return;
        }
      }

      setPayload(data);
      if (data.submission) {
        const map: Record<string, AnswerValue> = {};
        for (const a of data.submission.answers) {
          map[a.fieldId] = a.value;
        }
        setAnswers(map);
        setAttemptVersion(data.submission.attemptVersion);
        setViolationCount(data.submission.violationCount);
        setIsLocked(Boolean(data.submission.lockedAt));
        setRemainingSeconds(data.submission.remainingSeconds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, router]);

  useEffect(() => {
    void fetchPayload();
  }, [fetchPayload]);

  const pdfUrl = payload?.assignment.worksheet.pdfFileKey
    ? `/api/files/${payload.assignment.worksheet.pdfFileKey}`
    : null;
  const { pdfDoc } = usePdfDocument(pdfUrl);

  const submission = payload?.submission ?? null;
  const assignment = payload?.assignment ?? null;
  const isInProgress = submission?.status === "IN_PROGRESS";
  const allFields = useMemo(
    () => assignment?.worksheet.fields ?? [],
    [assignment]
  );

  // Start new attempt (non-proctored direct start, or redirect to rules if proctored)
  const handleStartAttempt = async () => {
    if (!assignment) return;
    if (assignment.proctorMode !== "OFF") {
      router.push(`/student/assignments/${assignmentId}/rules`);
      return;
    }
    setStartingAttempt(true);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rulesAccepted: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không thể bắt đầu làm bài");
      await fetchPayload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setStartingAttempt(false);
    }
  };

  // Flush dirty answers to server
  const flushAutosave = useCallback(async () => {
    if (!submission || submission.status !== "IN_PROGRESS" || isLocked) return;
    const dirtyIds = Array.from(dirtyFieldIdsRef.current);
    if (dirtyIds.length === 0) return;

    const batch = dirtyIds.map((fieldId) => ({
      fieldId,
      value: answersRef.current[fieldId] ?? "",
    }));

    setSaveState("saving");
    try {
      const res = await fetch(`/api/submissions/${submission.id}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptVersion: attemptVersionRef.current,
          attemptToken: submission.attemptToken ?? undefined,
          answers: batch,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "STALE_ATTEMPT_VERSION") {
          toast.error("Bài làm vừa bị đặt lại từ đầu. Đang đồng bộ lại…");
          dirtyFieldIdsRef.current.clear();
          await fetchPayload();
          return;
        }
        if (json.code === "SUBMISSION_LOCKED") {
          setIsLocked(true);
          return;
        }
        if (json.code === "TIME_EXPIRED" || json.code === "ALREADY_SUBMITTED") {
          await fetchPayload();
          return;
        }
        throw new Error(json.error ?? "Autosave failed");
      }
      dirtyIds.forEach((id) => dirtyFieldIdsRef.current.delete(id));
      if (json.remainingSeconds !== undefined) {
        setRemainingSeconds(json.remainingSeconds);
      }
      setSaveState("saved");
    } catch {
      setSaveState(navigator.onLine ? "error" : "offline");
    }
  }, [submission, isLocked, fetchPayload]);

  const handleAnswerChange = (fieldId: string, value: AnswerValue) => {
    if (!isInProgress || isLocked) return;
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    dirtyFieldIdsRef.current.add(fieldId);
    setSaveState("saving");

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void flushAutosave();
    }, 1200);
  };

  // Flush answers when back online
  useEffect(() => {
    const onOnline = () => {
      void flushAutosave();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushAutosave]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!submission || submission.status !== "IN_PROGRESS" || submitting) return;
    setSubmitting(true);
    try {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const allBatch = allFields.map((f) => ({
        fieldId: f.id,
        value: answersRef.current[f.id] ?? "",
      }));

      const res = await fetch(`/api/submissions/${submission.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptVersion: attemptVersionRef.current,
          answers: allBatch,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Nộp bài thất bại");

      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => undefined);
      }
      setConfirmSubmitOpen(false);
      toast.success("Nộp bài thành công!");
      await fetchPayload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }, [submission, submitting, allFields, fetchPayload]);

  // Server-synced countdown timer (ticks 1s locally, auto-submits at 0)
  useEffect(() => {
    if (!isInProgress || remainingSeconds === null) return;
    if (remainingSeconds <= 0) {
      toast.warning(vi.assignments.do.timeUp);
      void handleSubmit();
      return;
    }
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        return Math.max(0, prev - 1);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isInProgress, remainingSeconds, handleSubmit]);

  // ===== ANTI-CHEAT PROCTORING ENGINE =====
  const sendProctorEvent = useCallback(
    async (ev: QueuedProctorEvent) => {
      if (!submission || submission.status !== "IN_PROGRESS" || !assignment) return;
      if (assignment.proctorMode === "OFF") return;

      const queueKey = `engclass_proctor_q_${submission.id}`;
      try {
        const res = await fetch(`/api/submissions/${submission.id}/proctor-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: ev.type,
            durationMs: ev.durationMs ?? null,
            clientAt: ev.clientAt,
            meta: ev.meta ?? {
              userAgent: navigator.userAgent,
              screen: `${window.screen.width}x${window.screen.height}`,
              viewport: `${window.innerWidth}x${window.innerHeight}`,
            },
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const result = await res.json();

        setViolationCount(result.violationCount);
        if (result.attemptVersion !== undefined) {
          setAttemptVersion(result.attemptVersion);
        }

        if (result.locked) {
          setIsLocked(true);
          toast.error("Bài thi đã bị khoá do vượt ngưỡng vi phạm!");
        } else if (result.restarted) {
          // Server wiped all answers & incremented attemptVersion; timer is NOT reset!
          dirtyFieldIdsRef.current.clear();
          setAnswers({});
          setRestartedBanner(
            `Vi phạm quy chế thi! Toàn bộ ${result.clearedAnswersCount} đáp án đã bị xoá và bài thi được đặt lại từ câu 1. Đồng hồ không đặt lại.`
          );
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast.error("Bài thi đã bị đặt lại từ đầu!", { duration: 6000 });
        } else if (result.autoSubmitted) {
          setLeftOverlay(null);
          toast.error("Vượt quá số lần vi phạm — hệ thống đã tự nộp bài!", { duration: 6000 });
          await fetchPayload();
        }
      } catch {
        // Offline queue
        try {
          const existing: QueuedProctorEvent[] = JSON.parse(
            localStorage.getItem(queueKey) ?? "[]"
          );
          existing.push(ev);
          localStorage.setItem(queueKey, JSON.stringify(existing));
        } catch {
          // ignore storage quota errors
        }
      }
    },
    [submission, assignment, fetchPayload]
  );

  // Flush queued offline proctor events when network comes back
  useEffect(() => {
    if (!submission || !isInProgress) return;
    const queueKey = `engclass_proctor_q_${submission.id}`;
    const onOnline = async () => {
      try {
        const queued: QueuedProctorEvent[] = JSON.parse(localStorage.getItem(queueKey) ?? "[]");
        if (queued.length === 0) return;
        localStorage.removeItem(queueKey);
        for (const item of queued) {
          await sendProctorEvent(item);
        }
      } catch {
        // ignore
      }
    };
    const onOffline = () => {
      void sendProctorEvent({
        type: "NETWORK_OFFLINE",
        clientAt: new Date().toISOString(),
      });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [submission, isInProgress, sendProctorEvent]);

  // Attach client lockdown listeners when exam is IN_PROGRESS and proctored
  useEffect(() => {
    if (!isInProgress || !assignment || assignment.proctorMode === "OFF") return;

    const isLockdown = assignment.proctorMode === "LOCKDOWN" || assignment.proctorMode === "SEB";
    const blockClipboard = assignment.blockCopyPaste || isLockdown;
    const fullscreenRequired =
      (assignment.requireFullscreen || isLockdown) && Boolean(document.fullscreenEnabled);
    if (fullscreenRequired && !document.fullscreenElement) {
      setNeedsFullscreen(true);
    }
    // Hide the app navbar during a proctored exam so students cannot navigate away silently
    document.body.dataset.examMode = "1";

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenStartedAtRef.current = Date.now();
        lastBlurReportRef.current = Date.now();
        if (isLockdown) {
          setLeftOverlay({
            visible: true,
            at: new Date().toLocaleTimeString("vi-VN"),
          });
        }
        void sendProctorEvent({
          type: "TAB_HIDDEN",
          clientAt: new Date().toISOString(),
        });
      } else if (hiddenStartedAtRef.current) {
        const elapsed = Date.now() - hiddenStartedAtRef.current;
        hiddenStartedAtRef.current = null;
        if (elapsed >= 2000 && !isLockdown) {
          toast.warning(`Bạn vừa rời tab ${Math.round(elapsed / 1000)} giây.`);
        }
      }
    };

    const onWindowBlur = () => {
      // Focus moving into an embedded iframe (YouTube, PDF...) inside the exam page
      // fires window blur too: that is not leaving the exam.
      window.setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME") return;
        reportWindowBlur();
      }, 0);
    };
    const reportWindowBlur = () => {
      const now = Date.now();
      // Avoid double-reporting if visibilitychange just fired
      if (now - lastBlurReportRef.current < 1500) return;
      lastBlurReportRef.current = now;
      if (isLockdown) {
        setLeftOverlay({ visible: true, at: new Date().toLocaleTimeString("vi-VN") });
      }
      void sendProctorEvent({
        type: "WINDOW_BLUR",
        clientAt: new Date().toISOString(),
      });
    };

    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        setNeedsFullscreen(false);
        return;
      }
      if (fullscreenRequired) {
        setNeedsFullscreen(true);
        setLeftOverlay({ visible: true, at: new Date().toLocaleTimeString("vi-VN") });
        void sendProctorEvent({
          type: "FULLSCREEN_EXIT",
          clientAt: new Date().toISOString(),
        });
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (blockClipboard) {
        e.preventDefault();
        toast.warning("Sao chép bị vô hiệu hoá trong chế độ thi.");
      }
      void sendProctorEvent({ type: "COPY", clientAt: new Date().toISOString() });
    };
    const onPaste = (e: ClipboardEvent) => {
      if (blockClipboard) {
        e.preventDefault();
        toast.warning("Dán văn bản bị vô hiệu hoá trong chế độ thi.");
      }
      void sendProctorEvent({ type: "PASTE", clientAt: new Date().toISOString() });
    };
    const onCut = (e: ClipboardEvent) => {
      if (blockClipboard) e.preventDefault();
      void sendProctorEvent({ type: "CUT", clientAt: new Date().toISOString() });
    };
    const onContextMenu = (e: MouseEvent) => {
      if (blockClipboard) e.preventDefault();
      void sendProctorEvent({ type: "CONTEXT_MENU", clientAt: new Date().toISOString() });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        e.preventDefault();
        void sendProctorEvent({ type: "PRINT_SCREEN_KEY", clientAt: new Date().toISOString() });
        return;
      }
      if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i")) {
        e.preventDefault();
        void sendProctorEvent({ type: "DEVTOOLS_SUSPECTED", clientAt: new Date().toISOString() });
        return;
      }
      if (blockClipboard && (e.ctrlKey || e.metaKey)) {
        const k = e.key.toLowerCase();
        if (["c", "v", "x", "p", "u"].includes(k)) {
          e.preventDefault();
        }
      }
    };

    const onResize = () => {
      if (window.screen.width >= 1024 && window.innerWidth < window.screen.width * 0.55) {
        void sendProctorEvent({
          type: "RESIZE_SUSPICIOUS",
          clientAt: new Date().toISOString(),
          meta: { innerWidth: window.innerWidth, screenWidth: window.screen.width },
        });
      }
    };

    // Optional multi-screen detection via Window Management API if already granted
    const winWithScreens = window as unknown as {
      getScreenDetails?: () => Promise<{ screens: unknown[] }>;
    };
    if (typeof winWithScreens.getScreenDetails === "function" && navigator.permissions) {
      navigator.permissions
        .query({ name: "window-management" as PermissionName })
        .then((perm) => {
          if (perm.state === "granted") {
            return winWithScreens.getScreenDetails?.().then((details) => {
              if (details && details.screens.length > 1) {
                void sendProctorEvent({
                  type: "MULTI_SCREEN",
                  clientAt: new Date().toISOString(),
                  meta: { screenCount: details.screens.length },
                });
              }
            });
          }
        })
        .catch(() => undefined);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      delete document.body.dataset.examMode;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [isInProgress, assignment, sendProctorEvent]);

  if (loading) {
    return (
      <div className="stitch-card p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  if (error || !payload || !assignment) {
    return (
      <div className="stitch-card mx-auto max-w-xl p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-red-600">{error ?? "Không tìm thấy bài tập."}</p>
        <Button variant="outline" asChild>
          <Link href="/student">Quay lại trang học sinh</Link>
        </Button>
      </div>
    );
  }

  // If no submission exists yet (non-proctored), show Start card
  if (!submission) {
    return (
      <div className="stitch-card mx-auto max-w-xl p-8 text-center space-y-5">
        <Badge variant="default">{assignment.class.name}</Badge>
        <h1 className="text-2xl font-bold text-[#0B1C30]">{assignment.title}</h1>
        {assignment.worksheet.instructions && (
          <p className="text-sm text-[#464555]">{assignment.worksheet.instructions}</p>
        )}
        <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold text-[#464555]">
          <span className="rounded-full bg-[#F8F9FF] px-3 py-1.5 border border-slate-200">
            {assignment.worksheet.questionCount ?? allFields.length} câu hỏi
          </span>
          {assignment.timeLimitMin && (
            <span className="rounded-full bg-[#FFEDD5] px-3 py-1.5 text-[#C2410C]">
              Thời gian: {assignment.timeLimitMin} phút
            </span>
          )}
          <span className="rounded-full bg-[#F8F9FF] px-3 py-1.5 border border-slate-200">
            Tối đa {assignment.maxAttempts} lượt
          </span>
        </div>
        {payload.canStartNewAttempt ? (
          <Button
            variant="accent"
            size="lg"
            onClick={handleStartAttempt}
            disabled={startingAttempt}
          >
            {startingAttempt ? "Đang bắt đầu…" : vi.assignments.do.start}
          </Button>
        ) : (
          <p className="text-sm font-semibold text-red-600">
            Hiện không thể bắt đầu lượt làm bài mới (chưa mở, đã quá hạn hoặc hết lượt).
          </p>
        )}
      </div>
    );
  }

  const unansweredFields = allFields.filter((f) => !isAnswerFilled(answers[f.id]));
  const gradeByFieldId = Object.fromEntries(
    submission.answers.map((a) => [
      a.fieldId,
      { isCorrect: a.isCorrect, score: a.score, teacherNote: a.teacherNote },
    ])
  );
  const remainingViolations = Math.max(0, assignment.maxViolations - violationCount);
  const blurContent =
    isLocked || Boolean(leftOverlay?.visible) || (isInProgress && needsFullscreen);

  return (
    <div className="space-y-4 pb-20 lg:pb-8">
      {/* Proctoring Fixed Rule Banner (when proctored & in progress) */}
      {isInProgress && assignment.proctorMode !== "OFF" && (
        <div
          data-testid="proctor-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-[#FEF2F2] px-4 py-2.5 text-xs font-semibold text-[#93000A]"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#BA1A1A] shrink-0" />
            <span>
              Chế độ thi ({vi.proctor.modes[assignment.proctorMode]}):{" "}
              {assignment.violationAction === "LOCK" && "rời tab/vi phạm = khoá bài"}
              {assignment.violationAction === "RESTART" && "vi phạm = huỷ đáp án làm lại từ đầu"}
              {assignment.violationAction === "AUTO_SUBMIT" && "chạm ngưỡng = tự nộp bài"}
              {assignment.violationAction === "WARN" && "đang giám sát trực tiếp"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="danger" data-testid="violation-counter">
              Vi phạm: {violationCount}/{assignment.maxViolations} (còn {remainingViolations} lần)
            </Badge>
          </div>
        </div>
      )}

      {/* Restart Alert Banner */}
      {restartedBanner && (
        <div
          data-testid="restarted-banner"
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-orange-400 bg-orange-50 px-5 py-3.5 text-sm font-bold text-orange-950"
        >
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-600 shrink-0" />
            <span>{restartedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setRestartedBanner(null)}
            className="text-xs underline"
          >
            Đã hiểu
          </button>
        </div>
      )}

      {/* Stitch Top Doing Toolbar */}
      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-toolbar backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/student" title="Quay lại">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-sm sm:text-base font-bold text-[#0B1C30]">
                {assignment.title}
              </h1>
              {isInProgress && (
                <span
                  data-testid="student-autosave-badge"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    saveState === "saved" && "bg-emerald-50 text-emerald-700",
                    saveState === "saving" && "bg-indigo-50 text-indigo-700",
                    saveState === "offline" && "bg-amber-50 text-amber-700",
                    saveState === "error" && "bg-red-50 text-red-700"
                  )}
                >
                  {saveState === "offline" && <WifiOff className="h-3 w-3" />}
                  {saveState === "saved" && "• Đã lưu tự động"}
                  {saveState === "saving" && "• Đang lưu…"}
                  {saveState === "offline" && "Ngoại tuyến"}
                  {saveState === "error" && "Lỗi lưu"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {assignment.class.name} • Lượt {submission.attemptNo}/{assignment.maxAttempts}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Zoom Controls (50% - 200%) */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
            <button
              type="button"
              data-testid="zoom-out-btn"
              onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.25) * 100) / 100))}
              className="p-1 text-slate-600 hover:text-indigo-600"
              aria-label="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span
              data-testid="zoom-level"
              className="min-w-[44px] text-center text-xs font-bold tabular-nums"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              data-testid="zoom-in-btn"
              onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.25) * 100) / 100))}
              className="p-1 text-slate-600 hover:text-indigo-600"
              aria-label="Phóng to"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Server Countdown Timer Pill */}
          {isInProgress && remainingSeconds !== null && (
            <div
              data-testid="exam-timer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-sm font-extrabold tabular-nums",
                remainingSeconds < 180
                  ? "bg-red-100 text-[#BA1A1A] animate-pulse"
                  : "bg-[#FFEDD5] text-[#C2410C]"
              )}
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline text-[11px] font-sans font-bold">
                {vi.assignments.do.timeRemaining}
              </span>
              {formatSecondsMMSS(remainingSeconds)}
            </div>
          )}

          {isInProgress ? (
            <Button
              variant="accent"
              size="sm"
              data-testid="open-submit-btn"
              disabled={isLocked || submitting}
              onClick={() => setConfirmSubmitOpen(true)}
            >
              <Send className="h-4 w-4" />
              {vi.assignments.do.submit}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/student/classes/${assignment.classId}/leaderboard?assignmentId=${assignment.id}`}
                >
                  <Trophy className="h-4 w-4 text-[#F97316]" />
                  Xếp hạng
                </Link>
              </Button>
              {payload.canStartNewAttempt && (
                <Button variant="accent" size="sm" onClick={handleStartAttempt}>
                  <RefreshCcw className="h-4 w-4" />
                  {vi.assignments.do.retry}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Post-Submit Result Summary Banner */}
      {!isInProgress && (
        <div
          data-testid="submission-result-banner"
          className="stitch-card border-emerald-200 bg-gradient-to-r from-[#EEF2FF] to-[#F0FDF4] p-5"
        >
          {payload.revealResult ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-[#0B1C30]">
                    {vi.assignments.do.yourScore}:{" "}
                    <span className="text-[#3525CD] tabular-nums">
                      {formatScore(submission.totalScore, submission.maxScore)}
                    </span>
                  </h2>
                  {submission.status === "SUBMITTED" && (
                    <Badge variant="orange">Chờ chấm câu tự luận</Badge>
                  )}
                  {submission.isLate && <Badge variant="danger">Nộp trễ</Badge>}
                </div>
                {submission.teacherComment && (
                  <p className="text-sm text-[#464555]">
                    <strong>Nhận xét của giáo viên:</strong> {submission.teacherComment}
                  </p>
                )}
              </div>
              {payload.attemptsSummary.length > 1 && (
                <div className="text-xs text-slate-500">
                  Tổng số lượt đã làm: {payload.attemptsSummary.length}/{assignment.maxAttempts}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-sm font-semibold text-[#3525CD]">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>
                Đã nộp bài thành công!{" "}
                {assignment.showResult === "AFTER_DUE"
                  ? vi.assignments.do.resultAfterDue
                  : vi.assignments.do.resultHidden}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Split View: PDF + Overlays (Left) & Answer Sheet (Right / Mobile Bottom Sheet) */}
      <div
        className={cn(
          "flex flex-col gap-6 lg:flex-row lg:items-start transition",
          blurContent && "pointer-events-none select-none blur-md opacity-40"
        )}
      >
        <div className="min-w-0 flex-1 space-y-5 overflow-x-auto">
          {assignment.worksheet.instructions && (
            <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-xs text-[#464555]">
              <strong className="text-[#3525CD]">Hướng dẫn: </strong>
              {assignment.worksheet.instructions}
            </div>
          )}

          {assignment.worksheet.pages.length > 0 ? (
            assignment.worksheet.pages.map((p) => (
              <PdfCanvasPage
                key={p.pageIndex}
                pdfDoc={pdfDoc}
                pageIndex={p.pageIndex}
                widthPt={p.widthPt}
                heightPt={p.heightPt}
                zoom={zoom}
                eager={p.pageIndex === 0}
              >
                {({ widthPx, heightPx }) =>
                  allFields
                    .filter((f) => f.placement === "OVERLAY" && f.pageIndex === p.pageIndex)
                    .map((field) => {
                      const g = gradeByFieldId[field.id];
                      return (
                        <OverlayFieldInput
                          key={field.id}
                          field={field}
                          pageWidthPx={widthPx}
                          pageHeightPx={heightPx}
                          zoom={zoom}
                          value={answers[field.id]}
                          onChange={(val) => handleAnswerChange(field.id, val)}
                          disabled={!isInProgress || isLocked}
                          revealResult={payload.revealResult}
                          revealKey={payload.revealKey}
                          isCorrect={g?.isCorrect}
                          score={g?.score}
                          teacherNote={g?.teacherNote}
                          highlighted={highlightedFieldId === field.id}
                        />
                      );
                    })
                }
              </PdfCanvasPage>
            ))
          ) : (
            <div className="stitch-card p-10 text-center text-sm text-slate-500">
              Bài tập này chỉ sử dụng Phiếu trả lời ở bảng bên phải.
            </div>
          )}
        </div>

        <AnswerSheetPanel
          allFields={allFields}
          answers={answers}
          onChange={handleAnswerChange}
          onJumpToField={(field) => {
            if (field.placement === "OVERLAY") {
              setHighlightedFieldId(field.id);
              const el = document.querySelector(`[data-overlay-field-id="${field.id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              setTimeout(() => setHighlightedFieldId(null), 1800);
            }
          }}
          disabled={!isInProgress || isLocked}
          revealResult={payload.revealResult}
          revealKey={payload.revealKey}
          gradeByFieldId={gradeByFieldId}
        />
      </div>

      {/* Fullscreen required gate (no violation recorded: shown when not yet in fullscreen) */}
      {isInProgress && !isLocked && needsFullscreen && !leftOverlay?.visible && (
        <div
          data-testid="fullscreen-gate"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-7 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-[#0B1C30]">Bài thi yêu cầu toàn màn hình</h2>
            <p className="text-sm text-[#464555]">
              Nhấn nút bên dưới để vào chế độ toàn màn hình và tiếp tục làm bài. Đồng hồ vẫn đang
              đếm ngược.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen();
                } catch {
                  toast.error("Trình duyệt từ chối toàn màn hình. Vui lòng thử lại.");
                }
              }}
            >
              <Maximize2 className="h-4 w-4" />
              Vào toàn màn hình
            </Button>
          </div>
        </div>
      )}

      {/* STITCH OVERLAY 1: Left Tab / Exited Fullscreen Shield */}
      {isInProgress && !isLocked && leftOverlay?.visible && (
        <div
          data-testid="left-exam-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#BA1A1A] to-[#F97316]" />
            <div className="p-7 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-[#BA1A1A]">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1C30]">
                {vi.proctor.leftExamTitle}
              </h2>
              <p className="text-sm text-[#464555]">
                Hệ thống phát hiện bạn rời tab hoặc thoát toàn màn hình lúc{" "}
                <strong>{leftOverlay.at}</strong>. Giáo viên coi thi đã nhận được cảnh báo realtime.
              </p>

              <div className="rounded-2xl border border-red-200 bg-[#FEF2F2] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#BA1A1A]">
                  <span>CẢNH BÁO VI PHẠM</span>
                  <span>
                    {violationCount} / {assignment.maxViolations} lần
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: Math.min(assignment.maxViolations, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-lg py-1 text-[11px] font-bold",
                        i < violationCount
                          ? "bg-[#BA1A1A] text-white"
                          : "bg-white text-slate-400 border border-slate-200"
                      )}
                    >
                      Lần {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {remainingSeconds !== null && (
                <div className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-2.5 text-xs font-semibold">
                  <span className="text-slate-500">Thời gian vẫn đang đếm ngược:</span>
                  <span className="font-mono text-sm font-bold text-[#C2410C] tabular-nums">
                    {formatSecondsMMSS(remainingSeconds)}
                  </span>
                </div>
              )}

              <Button
                size="lg"
                className="w-full"
                onClick={async () => {
                  if (
                    (assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN") &&
                    document.documentElement.requestFullscreen
                  ) {
                    try {
                      await document.documentElement.requestFullscreen();
                    } catch {
                      // handled below: the overlay stays until fullscreen is really active
                    }
                    if (document.fullscreenEnabled && !document.fullscreenElement) {
                      toast.error("Trình duyệt chưa vào chế độ toàn màn hình. Vui lòng thử lại.");
                      return;
                    }
                  }
                  setLeftOverlay(null);
                }}
              >
                <Maximize2 className="h-4 w-4" />
                {vi.proctor.returnFullscreen}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STITCH OVERLAY 2: Locked Submission Shield (LOCK Action) */}
      {isInProgress && isLocked && (
        <div
          data-testid="locked-exam-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="h-1.5 w-full bg-[#BA1A1A]" />
            <div className="p-7 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-[#BA1A1A]">
                <Lock className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1C30]">
                {vi.proctor.lockedTitle}
              </h2>
              <p className="text-sm text-[#464555]">{vi.proctor.lockedSubtitle}</p>
              <Badge variant="danger" className="px-3 py-1">
                Số vi phạm: {violationCount} / {assignment.maxViolations}
              </Badge>
              <div className="pt-2 flex flex-col gap-2">
                <Button onClick={() => void fetchPayload()} className="w-full">
                  <RefreshCcw className="h-4 w-4" />
                  Kiểm tra giáo viên đã mở khoá chưa
                </Button>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/student">Quay về trang chủ</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal with Unanswered Warning */}
      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.assignments.do.submitConfirmTitle}</DialogTitle>
            <DialogDescription>{vi.assignments.do.submitConfirmBody}</DialogDescription>
          </DialogHeader>

          {unansweredFields.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1">
              <p className="font-bold">
                {vi.assignments.do.unansweredWarning} {unansweredFields.length} câu
              </p>
              <p className="text-amber-800">
                Các câu còn trống:{" "}
                {unansweredFields
                  .slice(0, 12)
                  .map((f) => f.label)
                  .join(", ")}
                {unansweredFields.length > 12 ? "…" : ""}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
              Kiểm tra lại
            </Button>
            <Button
              variant="accent"
              data-testid="confirm-submit-btn"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Đang nộp…" : "Xác nhận nộp bài"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
