"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Headphones,
  Lock,
  Maximize2,
  Mic,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldAlert,
  Smartphone,
  Trophy,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  CameraSensitivity,
  ProctorEventType,
  ProctorMode,
  ScoreScale,
  ViolationAction,
  WorksheetSubject,
} from "@prisma/client";
import type {
  AnswerValue,
  DictationGradeDetail,
  PhotoAnnotationMap,
  RubricScoreMap,
} from "@/lib/grading/types";
import type { ScaledScoreResult } from "@/lib/score-scale";
import {
  clearOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from "@/lib/offline-answer-queue";
import {
  cn,
  formatAttemptsLimit,
  formatAttemptsProgress,
  formatScore,
  formatSecondsMMSS,
} from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { useClipboardGuard } from "@/hooks/useClipboardGuard";
import { useCameraProctor } from "@/hooks/useCameraProctor";
import { useMicProctor } from "@/hooks/useMicProctor";
import { isMobileProctorEnvironment } from "@/lib/proctor/mobile-detect";
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
import { FocusQuestionRunner } from "@/components/worksheet/FocusQuestionRunner";
import { LimitedAudioPlayer } from "@/components/worksheet/LimitedAudioPlayer";
import {
  isAnswerFilled,
  type StudentFieldDTO,
  type WorksheetAudioDTO,
  type WorksheetPageDTO,
  type WorksheetPassageDTO,
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
    maxAttempts: number | null;
    showResult: "NEVER" | "AFTER_SUBMIT" | "AFTER_DUE";
    showAnswerKey: boolean;
    showLeaderboard: string;
    proctorMode: ProctorMode;
    violationAction: ViolationAction;
    maxViolations: number;
    requireFullscreen: boolean;
    blockCopyPaste: boolean;
    requireCamera: boolean;
    cameraEnforce: boolean;
    cameraSnapshots: boolean;
    cameraSensitivity?: CameraSensitivity;
    cameraCountLookAway?: boolean;
    requireMicMonitor?: boolean;
    audioMaxPlays: number | null;
    audioBlockPause: boolean;
    audioBlockSeek: boolean;
    oneQuestionPerPage?: boolean;
    scoreScale?: ScoreScale;
    weight?: number;
    hasOverride?: boolean;
    class: { id: string; name: string };
    worksheet: {
      id: string;
      title: string;
      subject?: WorksheetSubject;
      instructions: string | null;
      passages?: WorksheetPassageDTO[];
      pdfFileKey: string | null;
      pageCount: number;
      questionCount: number;
      audioCount?: number;
      pages: WorksheetPageDTO[];
      audios: WorksheetAudioDTO[];
      fields: StudentFieldDTO[];
    };
  };
  submission: {
    id: string;
    attemptNo: number;
    status: "IN_PROGRESS" | "SUBMITTED" | "GRADED" | "RETURNED";
    startedAt: string;
    submittedAt: string | null;
    isLate: boolean;
    maxScore: number;
    totalScore: number | null;
    scaledScore?: ScaledScoreResult | null;
    autoScore: number | null;
    manualScore: number | null;
    teacherComment: string | null;
    revisions?: Array<{
      id: string;
      revisionNo: number;
      submittedAt: string;
      returnedAt: string | null;
      teacherComment: string | null;
      totalScore: number | null;
      maxScore: number;
    }>;
    violationCount: number;
    lockedAt: string | null;
    attemptVersion: number;
    restartCount: number;
    rulesAcceptedAt: string | null;
    cameraConsentAt: string | null;
    attemptToken: string | null;
    audioPlayCounts?: Record<string, number>;
    remainingSeconds: number | null;
    answers: Array<{
      fieldId: string;
      value: AnswerValue;
      isCorrect: boolean | null;
      score: number | null;
      teacherNote: string | null;
      gradeDetail?: DictationGradeDetail | null;
      rubricScores?: RubricScoreMap | null;
      annotations?: PhotoAnnotationMap | null;
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
  const { m: vi, tr } = useI18n();
  // refs so long-lived effects (listeners, SSE, PDF loading) don't restart on language change
  const trRef = useRef(tr);
  trRef.current = tr;
  const viRef = useRef(vi);
  viRef.current = vi;
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const router = useRouter();

  const [payload, setPayload] = useState<StudentAssignmentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prereqLock, setPrereqLock] = useState<{
    assignmentId: string;
    title?: string;
    message: string;
  } | null>(null);

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [audioPlayCounts, setAudioPlayCounts] = useState<Record<string, number>>({});
  const [attemptVersion, setAttemptVersion] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [restartedBanner, setRestartedBanner] = useState<string | null>(null);
  const [leftOverlay, setLeftOverlay] = useState<{ visible: boolean; at: string } | null>(null);
  // Exam requires fullscreen but the page is not in fullscreen (e.g. the browser refused the
  // request on start, or the page was reloaded): block the content until the student enters it.
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  useEffect(() => {
    const syncMobile = () => setMobileMode(isMobileProctorEnvironment());
    syncMobile();
    window.addEventListener("resize", syncMobile);
    return () => window.removeEventListener("resize", syncMobile);
  }, []);
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
  const pendingOfflineRestoreRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const attemptVersionRef = useRef(attemptVersion);
  attemptVersionRef.current = attemptVersion;
  const lastBlurReportRef = useRef<number>(0);
  const lastMobileSwitchRef = useRef<number>(0);
  const hiddenStartedAtRef = useRef<number | null>(null);

  const fetchPayload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPrereqLock(null);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403 && json.code === "PREREQUISITE_NOT_SUBMITTED") {
          setPrereqLock({
            assignmentId: String(json.params?.prerequisiteAssignmentId ?? ""),
            title:
              typeof json.params?.prerequisiteTitle === "string"
                ? json.params.prerequisiteTitle
                : undefined,
            message: json.error ?? tr("Bạn cần nộp bài trước đó để mở bài này.", "Complete previous assignment first."),
          });
          return;
        }
        throw new Error(json.error ?? tr("Không tải được bài tập", "Could not load the assignment"));
      }
      const data = json as StudentAssignmentPayload;

      // Redirect to mandatory rules page if proctored, camera, or mic required and rules/consent not yet accepted
      const requiresRules =
        data.assignment.proctorMode !== "OFF" ||
        data.assignment.requireCamera ||
        Boolean(data.assignment.requireMicMonitor);
      if (
        requiresRules &&
        (!data.submission ||
          (data.submission.status === "IN_PROGRESS" &&
            (!data.submission.rulesAcceptedAt ||
              (data.assignment.requireCamera && !data.submission.cameraConsentAt))))
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
        if (data.submission.status === "IN_PROGRESS" || data.submission.status === "RETURNED") {
          const draft = loadOfflineDraft(data.submission.id, data.submission.attemptVersion);
          if (draft) {
            let restored = false;
            for (const [fid, val] of Object.entries(draft.answers)) {
              if (JSON.stringify(map[fid]) !== JSON.stringify(val)) {
                map[fid] = val;
                dirtyFieldIdsRef.current.add(fid);
                restored = true;
              }
            }
            if (restored) {
              pendingOfflineRestoreRef.current = true;
              setSaveState(navigator.onLine ? "saving" : "offline");
            }
          }
        } else {
          clearOfflineDraft(data.submission.id);
        }
        setAnswers(map);
        setAudioPlayCounts(data.submission.audioPlayCounts ?? {});
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
  }, [assignmentId, router, tr, vi]);

  useEffect(() => {
    void fetchPayload();
  }, [fetchPayload]);

  const pdfUrl = payload?.assignment.worksheet.pdfFileKey
    ? `/api/files/${payload.assignment.worksheet.pdfFileKey}`
    : null;
  const { pdfDoc } = usePdfDocument(pdfUrl);

  const submission = payload?.submission ?? null;
  const assignment = payload?.assignment ?? null;
  const isReturned = submission?.status === "RETURNED";
  const isLiveAttempt = submission?.status === "IN_PROGRESS";
  const isInProgress = isLiveAttempt || isReturned;
  const allFields = useMemo(
    () => assignment?.worksheet.fields ?? [],
    [assignment]
  );

  // Start new attempt (non-proctored direct start, or redirect to rules if proctored/camera/mic required)
  const handleStartAttempt = async () => {
    if (!assignment) return;
    if (
      assignment.proctorMode !== "OFF" ||
      assignment.requireCamera ||
      assignment.requireMicMonitor
    ) {
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
      if (!res.ok) throw new Error(json.error ?? tr("Không thể bắt đầu làm bài", "Could not start the attempt"));
      await fetchPayload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setStartingAttempt(false);
    }
  };

  // Flush dirty answers to server
  const flushAutosave = useCallback(async () => {
    if (
      !submission ||
      (submission.status !== "IN_PROGRESS" && submission.status !== "RETURNED") ||
      isLocked
    ) {
      return;
    }
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
          toast.error(tr("Bài làm vừa bị đặt lại từ đầu. Đang đồng bộ lại…", "Your attempt was just restarted. Re-syncing…"));
          dirtyFieldIdsRef.current.clear();
          clearOfflineDraft(submission.id);
          await fetchPayload();
          return;
        }
        if (json.code === "SUBMISSION_LOCKED") {
          setIsLocked(true);
          return;
        }
        if (json.code === "TIME_EXPIRED" || json.code === "ALREADY_SUBMITTED") {
          clearOfflineDraft(submission.id);
          await fetchPayload();
          return;
        }
        throw new Error(json.error ?? "Autosave failed");
      }
      dirtyIds.forEach((id) => dirtyFieldIdsRef.current.delete(id));
      if (dirtyFieldIdsRef.current.size === 0) {
        clearOfflineDraft(submission.id);
      }
      if (json.remainingSeconds !== undefined) {
        setRemainingSeconds(json.remainingSeconds);
      }
      setSaveState("saved");
    } catch {
      saveOfflineDraft(submission.id, attemptVersionRef.current, answersRef.current);
      setSaveState(navigator.onLine ? "error" : "offline");
    }
  }, [submission, isLocked, fetchPayload, tr]);

  useEffect(() => {
    if (
      pendingOfflineRestoreRef.current &&
      (submission?.status === "IN_PROGRESS" || submission?.status === "RETURNED") &&
      navigator.onLine
    ) {
      pendingOfflineRestoreRef.current = false;
      void flushAutosave();
    }
  }, [submission?.id, submission?.status, attemptVersion, flushAutosave]);

  const handleAnswerChange = (fieldId: string, value: AnswerValue) => {
    if (!isInProgress || isLocked) return;
    const nextAnswers = { ...answersRef.current, [fieldId]: value };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    dirtyFieldIdsRef.current.add(fieldId);
    if (submission) {
      saveOfflineDraft(submission.id, attemptVersionRef.current, nextAnswers);
    }
    setSaveState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saving");

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
    if (
      !submission ||
      (submission.status !== "IN_PROGRESS" && submission.status !== "RETURNED") ||
      submitting
    ) {
      return;
    }
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
      if (!res.ok) throw new Error(json.error ?? tr("Nộp bài thất bại", "Submit failed"));

      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => undefined);
      }
      clearOfflineDraft(submission.id);
      setConfirmSubmitOpen(false);
      toast.success(tr("Nộp bài thành công!", "Submitted successfully!"));
      await fetchPayload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }, [submission, submitting, allFields, fetchPayload, tr, vi]);

  // Server-synced countdown timer (ticks 1s locally, auto-submits at 0)
  useEffect(() => {
    if (!isLiveAttempt || remainingSeconds === null) return;
    if (remainingSeconds <= 0) {
      toast.warning(viRef.current.assignments.do.timeUp);
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
  }, [isLiveAttempt, remainingSeconds, handleSubmit]);

  // ===== ANTI-CHEAT PROCTORING ENGINE =====
  const sendProctorEvent = useCallback(
    async (ev: QueuedProctorEvent) => {
      if (!submission || submission.status !== "IN_PROGRESS" || !assignment) return;
      if (
        assignment.proctorMode === "OFF" &&
        !assignment.blockCopyPaste &&
        !assignment.requireCamera &&
        !assignment.requireMicMonitor
      ) {
        return;
      }

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
          toast.error(tr("Bài thi đã bị khoá do vượt ngưỡng vi phạm!", "The exam was locked: too many violations!"));
        } else if (result.restarted) {
          // Server wiped all answers & incremented attemptVersion; timer is NOT reset!
          dirtyFieldIdsRef.current.clear();
          clearOfflineDraft(submission.id);
          setAnswers({});
          setRestartedBanner(
            tr(`Vi phạm quy chế thi! Toàn bộ ${result.clearedAnswersCount} đáp án đã bị xoá và bài thi được đặt lại từ câu 1. Đồng hồ không đặt lại.`, `Exam rule violation! All ${result.clearedAnswersCount} answers were cleared and the exam restarted from question 1. The timer was not reset.`)
          );
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast.error(tr("Bài thi đã bị đặt lại từ đầu!", "The exam has been restarted!"), { duration: 6000 });
        } else if (result.autoSubmitted) {
          setLeftOverlay(null);
          toast.error(tr("Vượt quá số lần vi phạm — hệ thống đã tự nộp bài!", "Too many violations — the system submitted your exam!"), { duration: 6000 });
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
    [submission, assignment, fetchPayload, tr]
  );

  // Flush queued offline proctor events when network comes back
  useEffect(() => {
    if (!submission || !isLiveAttempt) return;
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
  }, [submission, isLiveAttempt, sendProctorEvent]);

  const isLockdownMode =
    assignment?.proctorMode === "LOCKDOWN" || assignment?.proctorMode === "SEB";
  const blockClipboardActive = Boolean(assignment?.blockCopyPaste || isLockdownMode);

  // Hardened clipboard / drag-drop / beforeinput / indirect-paste guard
  // Runs independently of proctorMode so homework with blockCopyPaste=true is also protected!
  useClipboardGuard({
    enabled: Boolean(
      isLiveAttempt &&
        assignment &&
        (blockClipboardActive || assignment.proctorMode !== "OFF")
    ),
    mode: blockClipboardActive ? "block" : "monitor",
    blockSelection: blockClipboardActive,
    tr,
    onWarn: (msg) => toast.warning(msg),
    onEvent: (ev) => {
      void sendProctorEvent({
        type: ev.type,
        clientAt: new Date().toISOString(),
        meta: ev.meta,
      });
    },
  });

  // Layer 2: Webcam AI proctoring (MediaPipe FaceLandmarker + ObjectDetector, local in browser)
  const cameraProctor = useCameraProctor({
    enabled: Boolean(isLiveAttempt && assignment?.requireCamera && submission?.id),
    submissionId: submission?.id ?? null,
    captureSnapshots: Boolean(assignment?.cameraSnapshots),
    sensitivity: assignment?.cameraSensitivity ?? "MEDIUM",
    onProctorEvent: sendProctorEvent,
    onWarning: (type) => {
      const msg =
        type === "CAMERA_NO_FACE"
          ? tr("Không thấy khuôn mặt của bạn trong camera.", "Your face is not visible on camera.")
          : type === "CAMERA_MULTI_FACE"
            ? tr("Camera phát hiện có nhiều người.", "More than one person detected on camera.")
            : type === "CAMERA_LOOK_AWAY"
              ? tr("Bạn đang quay mặt khỏi màn hình.", "You are looking away from the screen.")
              : type === "CAMERA_GAZE_AWAY"
                ? tr("Bạn đang nhìn lệch khỏi màn hình quá lâu.", "Your gaze drifted away from the screen.")
                : tr("Camera phát hiện điện thoại.", "A phone was detected on camera.");
      toast.warning(msg, {
        description: tr("Đã ghi lại cho giáo viên.", "This was recorded for your teacher."),
        duration: 5000,
      });
    },
  });
  const micProctor = useMicProctor({
    enabled: Boolean(isLiveAttempt && assignment?.requireMicMonitor && submission?.id),
    onVoiceEvent: async (ev) => {
      await sendProctorEvent({
        type: "MIC_VOICE",
        durationMs: ev.durationMs,
        clientAt: ev.clientAt,
        meta: { peakRms: Number(ev.peakRms.toFixed(3)) },
      });
    },
    onWarning: () => {
      toast.warning(
        trRef.current("Phát hiện tiếng nói kéo dài qua micro.", "Sustained speech detected on microphone."),
        {
          description: trRef.current("Đã ghi lại cho giáo viên.", "This was recorded for your teacher."),
          duration: 5000,
        }
      );
    },
  });
  const [cameraDebug, setCameraDebug] = useState(false);
  useEffect(() => {
    setCameraDebug(new URLSearchParams(window.location.search).has("camdebug"));
  }, []);

  // Attach client lockdown listeners when exam is IN_PROGRESS and proctored
  useEffect(() => {
    if (!isLiveAttempt || !assignment || assignment.proctorMode === "OFF") return;

    const isMobile = mobileMode || isMobileProctorEnvironment();
    const isLockdown = assignment.proctorMode === "LOCKDOWN" || assignment.proctorMode === "SEB";
    const fullscreenRequired =
      !isMobile &&
      (assignment.requireFullscreen || isLockdown) &&
      Boolean(document.fullscreenEnabled);
    if (fullscreenRequired && !document.fullscreenElement) {
      setNeedsFullscreen(true);
    } else if (!fullscreenRequired) {
      setNeedsFullscreen(false);
    }
    // Hide the app navbar during a proctored exam so students cannot navigate away silently
    document.body.dataset.examMode = "1";

    const reportMobileSwitch = (reason: "visibilitychange" | "pagehide") => {
      const now = Date.now();
      if (now - lastMobileSwitchRef.current < 1500) return;
      lastMobileSwitchRef.current = now;
      lastBlurReportRef.current = now;
      if (isLockdown) {
        setLeftOverlay({
          visible: true,
          at: new Date().toLocaleTimeString("vi-VN"),
        });
      }
      void sendProctorEvent({
        type: "MOBILE_APP_SWITCH",
        clientAt: new Date().toISOString(),
        meta: { reason },
      });
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenStartedAtRef.current = Date.now();
        if (isMobile) {
          reportMobileSwitch("visibilitychange");
          return;
        }
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
          toast.warning(trRef.current(`Bạn vừa rời tab ${Math.round(elapsed / 1000)} giây.`, `You left the tab for ${Math.round(elapsed / 1000)} seconds.`));
        }
      }
    };

    const onPageHide = () => {
      if (isMobile) {
        reportMobileSwitch("pagehide");
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
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      delete document.body.dataset.examMode;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [isLiveAttempt, assignment, sendProctorEvent, mobileMode]);

  if (loading) {
    return (
      <div className="stitch-card p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  if (prereqLock) {
    return (
      <div
        className="stitch-card mx-auto max-w-xl p-10 text-center space-y-4 border-amber-200 dark:border-amber-800"
        data-testid="prerequisite-lock-card"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-[#0B1C30] dark:text-slate-100">
          {tr("Bài tập đang bị khoá theo lộ trình Workbook", "Locked by Workbook progression")}
        </h1>
        <p className="text-sm text-[#464555] dark:text-slate-300">{prereqLock.message}</p>
        {prereqLock.title && (
          <p className="text-xs font-semibold text-[#3525CD]">
            {tr("Cần hoàn thành trước:", "Required first:")} {prereqLock.title}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {prereqLock.assignmentId && (
            <Button variant="accent" asChild>
              <Link href={`/student/assignments/${prereqLock.assignmentId}/do`}>
                {tr("Mở bài tập trước đó →", "Go to prerequisite assignment →")}
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/student">{tr("Quay lại trang học sinh", "Back to student home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (error || !payload || !assignment) {
    return (
      <div className="stitch-card mx-auto max-w-xl p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-red-600">{error ?? tr("Không tìm thấy bài tập.", "Assignment not found.")}</p>
        <Button variant="outline" asChild>
          <Link href="/student">{tr("Quay lại trang học sinh", "Back to student home")}</Link>
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
            {assignment.worksheet.questionCount ?? allFields.length} {tr("câu hỏi", "questions")}
          </span>
          {assignment.timeLimitMin && (
            <span className="rounded-full bg-[#FFEDD5] px-3 py-1.5 text-[#C2410C]">
              {tr("Thời gian:", "Time:")} {assignment.timeLimitMin} {tr("phút", "min")}
            </span>
          )}
          <span className="rounded-full bg-[#F8F9FF] px-3 py-1.5 border border-slate-200">
            {formatAttemptsLimit(assignment.maxAttempts, tr)}
          </span>
        </div>
        {payload.canStartNewAttempt ? (
          <Button
            variant="accent"
            size="lg"
            onClick={handleStartAttempt}
            disabled={startingAttempt}
          >
            {startingAttempt ? tr("Đang bắt đầu…", "Starting…") : vi.assignments.do.start}
          </Button>
        ) : (
          <p className="text-sm font-semibold text-red-600">
            {tr("Hiện không thể bắt đầu lượt làm bài mới (chưa mở, đã quá hạn hoặc hết lượt).", "You cannot start a new attempt right now (not open yet, past due, or no attempts left).")}
          </p>
        )}
      </div>
    );
  }

  const unansweredFields = allFields.filter((f) => !isAnswerFilled(answers[f.id]));
  const gradeByFieldId = Object.fromEntries(
    submission.answers.map((a) => [
      a.fieldId,
      {
        isCorrect: a.isCorrect,
        score: a.score,
        teacherNote: a.teacherNote,
        gradeDetail: a.gradeDetail ?? null,
        rubricScores: a.rubricScores ?? null,
        annotations: a.annotations ?? null,
      },
    ])
  );
  const remainingViolations = Math.max(0, assignment.maxViolations - violationCount);
  const cameraBlocked = isLiveAttempt && assignment.requireCamera && cameraProctor.cameraOff;
  const blurContent =
    isLocked ||
    Boolean(leftOverlay?.visible) ||
    (isLiveAttempt && needsFullscreen) ||
    cameraBlocked;
  const worksheetAudios = assignment.worksheet.audios ?? [];
  const boundAudioIds = new Set(
    allFields
      .filter((f) => f.placement === "ANSWER_SHEET" && f.audioId)
      .map((f) => f.audioId as string)
  );
  // Show tracks at the top strip if they are not exclusively displayed inside an answer-sheet card
  const topAudios = worksheetAudios.filter((a) => !boundAudioIds.has(a.id));
  const handleAudioPlayCountChange = (audioId: string, nextPlaysUsed: number) => {
    setAudioPlayCounts((prev) => ({ ...prev, [audioId]: nextPlaysUsed }));
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-8">
      {/* Teacher Returned for Revision Banner */}
      {isReturned && (
        <div
          data-testid="returned-revision-banner"
          className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-5 py-4 space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
              <RotateCcw className="h-4 w-4 text-amber-600 shrink-0" />
              {tr("Giáo viên đã trả bài để bạn chỉnh sửa và nộp lại", "Teacher returned this submission for revision")}
            </p>
            {submission.revisions && submission.revisions.length > 0 && (
              <Badge variant="orange">
                {tr("Số lần đã trả:", "Revisions:")} {submission.revisions.length}
              </Badge>
            )}
          </div>
          {submission.teacherComment && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>{tr("Nhận xét giáo viên:", "Teacher feedback:")}</strong>{" "}
              {submission.teacherComment}
            </p>
          )}
        </div>
      )}

      {/* Proctoring Fixed Rule Banner (when proctored & in progress) */}
      {isLiveAttempt && assignment.proctorMode !== "OFF" && (
        <div
          data-testid="proctor-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-[#FEF2F2] px-4 py-2.5 text-xs font-semibold text-[#93000A]"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#BA1A1A] shrink-0" />
            <span>
              {tr("Chế độ thi (", "Exam mode (")}{vi.proctor.modes[assignment.proctorMode]}):{" "}
              {assignment.violationAction === "LOCK" && tr("rời tab/vi phạm = khoá bài", "leaving the tab/violation = locked")}
              {assignment.violationAction === "RESTART" && tr("vi phạm = huỷ đáp án làm lại từ đầu", "violation = answers cleared, restart")}
              {assignment.violationAction === "AUTO_SUBMIT" && tr("chạm ngưỡng = tự nộp bài", "threshold reached = auto submit")}
              {assignment.violationAction === "WARN" && tr("đang giám sát trực tiếp", "live proctoring")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="danger" data-testid="violation-counter">
              {tr("Vi phạm:", "Violations:")} {violationCount}/{assignment.maxViolations} {tr("(còn", "(")} {remainingViolations} {tr("lần)", "left)")}
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
            {tr("Đã hiểu", "Got it")}
          </button>
        </div>
      )}

      {/* Mobile Proctoring Mode Banner */}
      {isLiveAttempt && mobileMode && assignment.proctorMode !== "OFF" && (
        <div
          data-testid="mobile-proctor-banner"
          className="flex items-start gap-2.5 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-2.5 text-xs text-[#0B1C30]"
        >
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5]" />
          <span>
            {tr(
              "Chế độ giám sát Mobile: không ép toàn màn hình, mọi lần chuyển app/ẩn trình duyệt đều được ghi nhận.",
              "Mobile proctoring active: fullscreen lock disabled; switching apps or hiding this tab is logged."
            )}
          </span>
        </div>
      )}

      {/* Stitch Top Doing Toolbar */}
      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-toolbar backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/student" title={tr("Quay lại", "Back")}>
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
                  {saveState === "saved" && tr("• Đã lưu tự động", "• Auto-saved")}
                  {saveState === "saving" && tr("• Đang lưu…", "• Saving…")}
                  {saveState === "offline" &&
                    tr("Ngoại tuyến — đã lưu tạm trên máy", "Offline — draft saved locally")}
                  {saveState === "error" && tr("Lỗi lưu", "Save error")}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {assignment.class.name} {tr("• Lượt", "• Attempt")}{" "}
              {formatAttemptsProgress(submission.attemptNo, assignment.maxAttempts)}
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
              aria-label={tr("Thu nhỏ", "Zoom out")}
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
              aria-label={tr("Phóng to", "Zoom in")}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Server Countdown Timer Pill */}
          {isLiveAttempt && remainingSeconds !== null && (
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
              {isReturned ? tr("Nộp lại bài", "Resubmit") : vi.assignments.do.submit}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/student/classes/${assignment.classId}/leaderboard?assignmentId=${assignment.id}`}
                >
                  <Trophy className="h-4 w-4 text-[#F97316]" />
                  {tr("Xếp hạng", "Leaderboard")}
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
          className="stitch-card border-emerald-200 bg-gradient-to-r from-[#EEF2FF] to-[#F0FDF4] dark:from-[#162038] dark:to-[#0F2420] p-5"
        >
          {payload.revealResult ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-[#0B1C30]">
                    {vi.assignments.do.yourScore}:{" "}
                    <span className="text-[#3525CD] tabular-nums">
                      {formatScore(submission.totalScore, submission.maxScore)}
                    </span>
                  </h2>
                  {submission.scaledScore &&
                    assignment.scoreScale &&
                    assignment.scoreScale !== "SCALE_10" && (
                      <Badge variant="indigo" data-testid="scaled-score-badge">
                        {submission.scaledScore.formatted}
                      </Badge>
                    )}
                  {assignment.hasOverride && (
                    <Badge variant="sky">{tr("Có điều chỉnh riêng", "Custom extension")}</Badge>
                  )}
                  {submission.status === "SUBMITTED" && (
                    <Badge variant="orange">{tr("Chờ chấm câu tự luận", "Essay awaiting grading")}</Badge>
                  )}
                  {submission.isLate && <Badge variant="danger">{tr("Nộp trễ", "Late")}</Badge>}
                </div>
                {submission.teacherComment && (
                  <p className="text-sm text-[#464555]">
                    <strong>{tr("Nhận xét của giáo viên:", "Teacher's comment:")}</strong> {submission.teacherComment}
                  </p>
                )}
              </div>
              {payload.attemptsSummary.length > 1 && (
                <div className="text-xs text-slate-500">
                  {tr("Tổng số lượt đã làm:", "Attempts used:")}{" "}
                  {formatAttemptsProgress(payload.attemptsSummary.length, assignment.maxAttempts)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-sm font-semibold text-[#3525CD]">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>
                {tr("Đã nộp bài thành công!", "Submitted successfully!")}{" "}
                {assignment.showResult === "AFTER_DUE"
                  ? vi.assignments.do.resultAfterDue
                  : vi.assignments.do.resultHidden}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main View: Focus Mode (1 question/screen) OR Split View (PDF + Overlays & Answer Sheet) */}
      <div
        className={cn(
          "transition",
          assignment.oneQuestionPerPage
            ? "space-y-5"
            : assignment.worksheet.pages.length > 0
              ? "flex flex-col gap-6 lg:flex-row lg:items-start"
              : "mx-auto flex max-w-3xl flex-col gap-5",
          blurContent && "pointer-events-none select-none blur-md opacity-40"
        )}
      >
        {assignment.oneQuestionPerPage ? (
          <div className="space-y-5">
            {assignment.worksheet.instructions && (
              <div className="mx-auto max-w-3xl rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-xs text-[#464555]">
                <strong className="text-[#3525CD]">{tr("Hướng dẫn:", "Instructions:")} </strong>
                {assignment.worksheet.instructions}
              </div>
            )}
            {topAudios.length > 0 && (
              <div
                data-testid="worksheet-audio-strip"
                className="stitch-card mx-auto max-w-3xl p-4 space-y-2.5"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-[#0B1C30]">
                  <Headphones className="h-4 w-4 text-[#4F46E5]" />
                  {tr("File nghe bài tập", "Assignment audio tracks")}
                </div>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {topAudios.map((audio) => (
                    <LimitedAudioPlayer
                      key={audio.id}
                      audio={audio}
                      submissionId={submission.id}
                      playsUsed={audioPlayCounts[audio.id] ?? 0}
                      maxPlays={assignment.audioMaxPlays}
                      blockPause={assignment.audioBlockPause}
                      blockSeek={assignment.audioBlockSeek}
                      disabled={!isInProgress || isLocked}
                      onPlayCountChange={handleAudioPlayCountChange}
                    />
                  ))}
                </div>
              </div>
            )}
            <FocusQuestionRunner
              allFields={allFields}
              passages={assignment.worksheet.passages ?? []}
              answers={answers}
              onChange={handleAnswerChange}
              onOpenSubmit={() => setConfirmSubmitOpen(true)}
              disabled={!isInProgress || isLocked}
              revealResult={payload.revealResult}
              revealKey={payload.revealKey}
              disableSpellcheck={blockClipboardActive}
              audios={worksheetAudios}
              submissionId={submission.id}
              audioPlayCounts={audioPlayCounts}
              audioMaxPlays={assignment.audioMaxPlays}
              audioBlockPause={assignment.audioBlockPause}
              audioBlockSeek={assignment.audioBlockSeek}
              onAudioPlayCountChange={handleAudioPlayCountChange}
              gradeByFieldId={gradeByFieldId}
            />
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 space-y-5 overflow-x-auto">
              {assignment.worksheet.instructions && (
                <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-xs text-[#464555]">
                  <strong className="text-[#3525CD]">{tr("Hướng dẫn:", "Instructions:")} </strong>
                  {assignment.worksheet.instructions}
                </div>
              )}

              {topAudios.length > 0 && (
                <div
                  data-testid="worksheet-audio-strip"
                  className="stitch-card p-4 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0B1C30]">
                    <Headphones className="h-4 w-4 text-[#4F46E5]" />
                    {tr("File nghe bài tập", "Assignment audio tracks")}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {topAudios.map((audio) => (
                      <LimitedAudioPlayer
                        key={audio.id}
                        audio={audio}
                        submissionId={submission.id}
                        playsUsed={audioPlayCounts[audio.id] ?? 0}
                        maxPlays={assignment.audioMaxPlays}
                        blockPause={assignment.audioBlockPause}
                        blockSeek={assignment.audioBlockSeek}
                        disabled={!isInProgress || isLocked}
                        onPlayCountChange={handleAudioPlayCountChange}
                      />
                    ))}
                  </div>
                </div>
              )}

              {assignment.worksheet.pages.length > 0 ? (
                assignment.worksheet.pages.map((p) => (
                  <PdfCanvasPage
                    key={p.pageIndex}
                    pdfDoc={pdfDoc}
                    imageUrl={p.imageKey ? `/api/files/${p.imageKey}` : null}
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
                              disableSpellcheck={blockClipboardActive}
                            />
                          );
                        })
                    }
                  </PdfCanvasPage>
                ))
              ) : null}
            </div>

            <AnswerSheetPanel
              wide={assignment.worksheet.pages.length === 0}
              allFields={allFields}
              passages={assignment.worksheet.passages ?? []}
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
              disableSpellcheck={blockClipboardActive}
              audios={worksheetAudios}
              submissionId={submission.id}
              audioPlayCounts={audioPlayCounts}
              audioMaxPlays={assignment.audioMaxPlays}
              audioBlockPause={assignment.audioBlockPause}
              audioBlockSeek={assignment.audioBlockSeek}
              onAudioPlayCountChange={handleAudioPlayCountChange}
              gradeByFieldId={gradeByFieldId}
            />
          </>
        )}
      </div>

      {/* Floating Camera AI Preview Badge (Bottom-Left) */}
      {isLiveAttempt && assignment.requireCamera && (
        <div
          data-testid="camera-proctor-preview"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-40 w-32 overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-950 shadow-xl sm:w-44 lg:bottom-4 lg:left-4"
        >
          <div className="relative h-20 w-full bg-slate-900 sm:h-28">
            <video
              ref={cameraProctor.attachVideoRef}
              muted
              playsInline
              className="h-full w-full object-cover scale-x-[-1]"
            />
            <span
              className={cn(
                "absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow",
                cameraProctor.status === "ok" && "bg-emerald-600/90",
                cameraProctor.status === "warning" && "bg-amber-500/90",
                cameraProctor.status === "off" && "bg-red-600/90",
                cameraProctor.status === "initializing" && "bg-slate-700/90"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-white",
                  cameraProctor.status === "ok" && "animate-pulse"
                )}
              />
              {cameraProctor.status === "ok" && tr("Camera AI", "AI Cam OK")}
              {cameraProctor.status === "warning" && tr("Đang chú ý", "Attention")}
              {cameraProctor.status === "off" && tr("Camera tắt", "Cam off")}
              {cameraProctor.status === "initializing" && tr("Đang tải AI…", "Loading AI…")}
            </span>
          </div>
          <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300">
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3 w-3 text-indigo-400" />
              {tr("Khuôn mặt:", "Faces:")} {cameraProctor.faceCount}
            </span>
            <span>{cameraProctor.modelReady ? "AI ✓" : "…"}</span>
          </div>
          {cameraProctor.modelReady && cameraProctor.reading && !cameraProctor.reading.calibrated && (
            <div className="bg-indigo-600 px-2.5 py-1 text-[10px] font-medium text-white">
              {tr("Nhìn thẳng màn hình để hiệu chỉnh…", "Look at the screen to calibrate…")}
            </div>
          )}
          {cameraDebug && cameraProctor.reading && (
            <div className="space-y-0.5 bg-black px-2.5 py-1 font-mono text-[10px] text-lime-300">
              <div>yaw {cameraProctor.reading.yawDeg ?? "–"}° / pitch {cameraProctor.reading.pitchDeg ?? "–"}°</div>
              <div>
                gaze {cameraProctor.reading.gazeXOffset !== null ? cameraProctor.reading.gazeXOffset.toFixed(2) : "–"} • phone{" "}
                {cameraProctor.reading.phoneScore.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Mic AI Status Pill */}
      {isLiveAttempt && assignment.requireMicMonitor && (
        <div
          data-testid="mic-proctor-badge"
          className={cn(
            "fixed left-3 z-40 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg lg:left-4",
            assignment.requireCamera
              ? "bottom-[calc(12.25rem+env(safe-area-inset-bottom))] lg:bottom-48"
              : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4"
          )}
        >
          <Mic
            className={cn(
              "h-3.5 w-3.5",
              micProctor.speaking
                ? "animate-pulse text-amber-400"
                : micProctor.active
                  ? "text-emerald-400"
                  : "text-slate-400"
            )}
          />
          <span>
            {micProctor.error
              ? tr("Micro tắt", "Mic off")
              : micProctor.speaking
                ? tr("Đang nói", "Speaking")
                : tr("Mic AI", "AI Mic")}
          </span>
          <span className="font-mono text-[10px] text-slate-300 tabular-nums">
            {micProctor.dbLevel} dB
          </span>
        </div>
      )}

      {/* Camera Off / Denied Blocking Overlay */}
      {cameraBlocked && !isLocked && (
        <div
          data-testid="camera-off-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#BA1A1A] to-[#F97316]" />
            <div className="p-7 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-[#BA1A1A]">
                <CameraOff className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-[#0B1C30]">
                {tr("Camera đã bị tắt hoặc mất kết nối!", "Camera is turned off or disconnected!")}
              </h2>
              <p className="text-sm text-[#464555]">
                {cameraProctor.error ??
                  tr(
                    "Bài thi yêu cầu bật camera liên tục. Vui lòng bật lại camera để tiếp tục làm bài. Đồng hồ vẫn đang đếm ngược.",
                    "This exam requires an active webcam. Please re-enable your camera to continue. The timer is still running."
                  )}
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={cameraProctor.retryCamera}
              >
                <Camera className="h-4 w-4" />
                {tr("Bật lại camera để tiếp tục", "Re-enable camera to continue")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen required gate (no violation recorded: shown when not yet in fullscreen) */}
      {isLiveAttempt && !isLocked && needsFullscreen && !leftOverlay?.visible && (
        <div
          data-testid="fullscreen-gate"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-7 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-[#0B1C30]">{tr("Bài thi yêu cầu toàn màn hình", "This exam requires fullscreen")}</h2>
            <p className="text-sm text-[#464555]">
              {tr("Nhấn nút bên dưới để vào chế độ toàn màn hình và tiếp tục làm bài. Đồng hồ vẫn đang đếm ngược.", "Click the button below to enter fullscreen and continue. The timer is still running.")}
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen();
                } catch {
                  toast.error(tr("Trình duyệt từ chối toàn màn hình. Vui lòng thử lại.", "The browser refused fullscreen. Please try again."));
                }
              }}
            >
              <Maximize2 className="h-4 w-4" />
              {tr("Vào toàn màn hình", "Enter fullscreen")}
            </Button>
          </div>
        </div>
      )}

      {/* STITCH OVERLAY 1: Left Tab / Exited Fullscreen Shield */}
      {isLiveAttempt && !isLocked && leftOverlay?.visible && (
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
                {tr("Hệ thống phát hiện bạn rời tab hoặc thoát toàn màn hình lúc", "The system detected that you left the tab or exited fullscreen at")}{" "}
                <strong>{leftOverlay.at}</strong>{tr(". Giáo viên coi thi đã nhận được cảnh báo realtime.", ". The proctor has received a real-time alert.")}
              </p>

              <div className="rounded-2xl border border-red-200 bg-[#FEF2F2] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#BA1A1A]">
                  <span>{tr("CẢNH BÁO VI PHẠM", "VIOLATION WARNING")}</span>
                  <span>
                    {violationCount} / {assignment.maxViolations} {tr("lần", "times")}
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
                      {tr("Lần", "#")} {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {remainingSeconds !== null && (
                <div className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-2.5 text-xs font-semibold">
                  <span className="text-slate-500">{tr("Thời gian vẫn đang đếm ngược:", "Time is still running:")}</span>
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
                      toast.error(tr("Trình duyệt chưa vào chế độ toàn màn hình. Vui lòng thử lại.", "The browser is not in fullscreen yet. Please try again."));
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
      {isLiveAttempt && isLocked && (
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
                {tr("Số vi phạm:", "Violations:")} {violationCount} / {assignment.maxViolations}
              </Badge>
              <div className="pt-2 flex flex-col gap-2">
                <Button onClick={() => void fetchPayload()} className="w-full">
                  <RefreshCcw className="h-4 w-4" />
                  {tr("Kiểm tra giáo viên đã mở khoá chưa", "Check whether the teacher has unlocked it")}
                </Button>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/student">{tr("Quay về trang chủ", "Back to home")}</Link>
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
                {vi.assignments.do.unansweredWarning} {unansweredFields.length} {tr("câu", "questions")}
              </p>
              <p className="text-amber-800">
                {tr("Các câu còn trống:", "Unanswered questions:")}{" "}
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
              {tr("Kiểm tra lại", "Review")}
            </Button>
            <Button
              variant="accent"
              data-testid="confirm-submit-btn"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? tr("Đang nộp…", "Submitting…") : tr("Xác nhận nộp bài", "Confirm submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
