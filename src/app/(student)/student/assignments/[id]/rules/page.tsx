"use client";

import { BackLink } from "@/components/navigation/BackLink";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardX,
  Clock,
  FileQuestion,
  Headphones,
  Maximize2,
  Mic,
  MonitorOff,
  Radio,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { computeVoiceBandRms, rmsToApproxDb } from "@/lib/proctor/mic-monitor";
import { isMobileProctorEnvironment } from "@/lib/proctor/mobile-detect";
import { formatAttemptsLimit } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RulesPayload {
  assignment: {
    id: string;
    title: string;
    timeLimitMin: number | null;
    maxAttempts: number | null;
    proctorMode: "OFF" | "MONITOR" | "LOCKDOWN" | "SEB";
    violationAction: "WARN" | "LOCK" | "RESTART" | "AUTO_SUBMIT";
    maxViolations: number;
    requireFullscreen: boolean;
    blockCopyPaste: boolean;
    requireCamera: boolean;
    cameraEnforce: boolean;
    cameraSnapshots: boolean;
    cameraSensitivity?: "LOW" | "MEDIUM" | "HIGH";
    cameraCountLookAway?: boolean;
    requireMicMonitor?: boolean;
    audioMaxPlays: number | null;
    audioBlockPause: boolean;
    audioBlockSeek: boolean;
    class: { id: string; name: string };
    worksheet: { fields: Array<{ id: string }>; questionCount?: number; audioCount?: number };
  };
  submission: {
    id: string;
    status: string;
    rulesAcceptedAt: string | null;
    cameraConsentAt: string | null;
  } | null;
}

export default function StudentAssignmentRulesPage() {
  const { m: vi, tr } = useI18n();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const router = useRouter();

  const [agreed, setAgreed] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micConsent, setMicConsent] = useState(false);
  const [micChecked, setMicChecked] = useState(false);
  const [checkingMic, setCheckingMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [micPreviewDb, setMicPreviewDb] = useState<number>(-60);
  const [mobileMode, setMobileMode] = useState(false);
  const [starting, setStarting] = useState(false);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micTimerRef = useRef<number | null>(null);

  const stopPreviewCamera = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  };

  const stopPreviewMic = () => {
    if (micTimerRef.current !== null) {
      window.clearTimeout(micTimerRef.current);
      micTimerRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current && micCtxRef.current.state !== "closed") {
      void micCtxRef.current.close().catch(() => undefined);
    }
    micCtxRef.current = null;
  };

  useEffect(() => {
    const syncMobile = () => setMobileMode(isMobileProctorEnvironment());
    syncMobile();
    window.addEventListener("resize", syncMobile);
    return () => {
      window.removeEventListener("resize", syncMobile);
      stopPreviewCamera();
      stopPreviewMic();
    };
  }, []);

  const handleCheckCamera = async () => {
    setCameraError(null);
    setCheckingCamera(true);
    stopPreviewCamera();
    try {
      const win = window as unknown as { __engclassCameraMock?: unknown };
      if (win.__engclassCameraMock) {
        setCameraChecked(true);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          tr(
            "Trình duyệt không hỗ trợ camera hoặc trang chưa chạy trên HTTPS.",
            "Camera is not supported in this browser or requires HTTPS."
          )
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play().catch(() => undefined);
      }
      setCameraChecked(true);
    } catch (err) {
      setCameraChecked(false);
      setCameraError(
        err instanceof Error
          ? err.message
          : tr("Không thể mở camera. Vui lòng cấp quyền camera.", "Could not open camera. Please allow camera permission.")
      );
    } finally {
      setCheckingCamera(false);
    }
  };

  const handleCheckMic = async () => {
    setMicError(null);
    setCheckingMic(true);
    stopPreviewMic();
    try {
      const win = window as unknown as { __engclassMicMock?: { rmsVoiceBand?: number } };
      if (win.__engclassMicMock) {
        setMicPreviewDb(rmsToApproxDb(win.__engclassMicMock.rmsVoiceBand ?? 0.12));
        setMicChecked(true);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          tr(
            "Trình duyệt không hỗ trợ micro hoặc trang chưa chạy trên HTTPS.",
            "Microphone is not supported in this browser or requires HTTPS."
          )
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      const sample = () => {
        if (!micCtxRef.current) return;
        analyser.getByteFrequencyData(buf);
        const rms = computeVoiceBandRms(buf, ctx.sampleRate, analyser.fftSize);
        setMicPreviewDb(rmsToApproxDb(rms));
        micTimerRef.current = window.setTimeout(sample, 200);
      };
      sample();
      setMicChecked(true);
    } catch (err) {
      setMicChecked(false);
      setMicError(
        err instanceof Error
          ? err.message
          : tr("Không thể mở micro. Vui lòng cấp quyền micro.", "Could not access microphone. Please allow mic permission.")
      );
    } finally {
      setCheckingMic(false);
    }
  };

  const { data, isLoading, error } = useQuery<RulesPayload>({
    queryKey: ["assignment-rules", assignmentId],
    queryFn: () =>
      apiFetchJson<RulesPayload>(
        `/api/assignments/${assignmentId}`,
        undefined,
        tr("Không tải được thông tin bài thi", "Could not load the exam")
      ),
  });

  if (isLoading) {
    return (
      <div className="stitch-card mx-auto max-w-2xl p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="stitch-card mx-auto max-w-2xl p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-red-600">
          {error instanceof Error ? error.message : tr("Không tìm thấy bài thi.", "Exam not found.")}
        </p>
        <Button variant="outline" asChild>
          <Link href="/student">{tr("Quay lại", "Back")}</Link>
        </Button>
      </div>
    );
  }

  const { assignment } = data;
  const isStrict =
    assignment.violationAction === "LOCK" ||
    assignment.violationAction === "RESTART" ||
    assignment.violationAction === "AUTO_SUBMIT";

  const canStart =
    agreed &&
    (!assignment.requireCamera || (cameraChecked && cameraConsent)) &&
    (!assignment.requireMicMonitor || (micChecked && micConsent));

  const handleStartExam = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      stopPreviewCamera();
      stopPreviewMic();
      const attemptToken =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tok-${Date.now()}`;

      if (typeof window !== "undefined") {
        sessionStorage.setItem(`engclass_token_${assignmentId}`, attemptToken);
      }

      // Request fullscreen on user gesture if required on desktop (skipped on mobile)
      if (
        !mobileMode &&
        (assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN") &&
        document.documentElement.requestFullscreen
      ) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Browsers in headless/automated test environments may deny fullscreen; handled by UI banner/guard
        }
      }

      const res = await fetch(`/api/assignments/${assignmentId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rulesAccepted: true,
          cameraConsent: assignment.requireCamera ? cameraConsent : undefined,
          attemptToken,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không thể bắt đầu bài thi", "Could not start the exam"));

      router.push(`/student/assignments/${assignmentId}/do`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3 py-4">
      <Link
        href={`/student/precheck?assignmentId=${assignmentId}`}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white text-sm font-semibold text-[#4F46E5] hover:bg-indigo-50 dark:border-indigo-900 dark:bg-slate-900"
        data-testid="precheck-link"
      >
        {tr("Kiểm tra thiết bị trước khi thi (mạng, camera, micro, pin)", "Check your device first (network, camera, mic, battery)")}
      </Link>
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-indigo-950/5">
        {/* Top gradient bar matching Stitch */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#3525CD] via-[#4F46E5] to-[#F97316]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2.5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4F46E5]">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
              {assignment.class.name}
            </p>
            <h1 className="text-2xl font-bold text-[#0B1C30]">{assignment.title}</h1>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {assignment.timeLimitMin && (
                <Badge variant="orange">
                  <Clock className="h-3 w-3" /> {assignment.timeLimitMin} {tr("phút", "min")}
                </Badge>
              )}
              <Badge variant="default">
                <FileQuestion className="h-3 w-3" /> {assignment.worksheet.questionCount ?? assignment.worksheet.fields.length} {tr("câu hỏi", "questions")}
              </Badge>
              <Badge variant="danger">
                • {vi.proctor.badge} (
                {assignment.proctorMode !== "OFF"
                  ? vi.proctor.modes[assignment.proctorMode]
                  : assignment.requireCamera
                    ? tr("Camera AI", "AI Camera")
                    : tr("Micro AI", "AI Mic")}
                )
              </Badge>
              {assignment.requireCamera && (
                <Badge variant="orange">
                  <Camera className="h-3 w-3" /> {tr("Bắt buộc Camera AI", "AI Camera required")}
                </Badge>
              )}
              {assignment.requireMicMonitor && (
                <Badge variant="indigo">
                  <Mic className="h-3 w-3" /> {tr("Giám sát Micro (RAM)", "AI Mic Monitor (RAM)")}
                </Badge>
              )}
              <Badge variant="neutral">{formatAttemptsLimit(assignment.maxAttempts, tr)}</Badge>
            </div>
          </div>

          {mobileMode && (assignment.proctorMode !== "OFF" || assignment.requireFullscreen) && (
            <div
              data-testid="mobile-proctor-rules-banner"
              className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3.5 text-xs text-[#0B1C30]"
            >
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5]" />
              <div className="space-y-0.5">
                <p className="font-bold">
                  {tr("Chế độ giám sát Mobile đang bật", "Mobile proctoring mode enabled")}
                </p>
                <p className="text-[#464555]">
                  {tr(
                    "Thiết bị di động không yêu cầu khoá toàn màn hình. Khi bạn chuyển sang ứng dụng khác hoặc ẩn trình duyệt, hệ thống sẽ ghi nhận sự kiện chuyển app (MOBILE_APP_SWITCH).",
                    "Mobile browsers skip fullscreen lock. Switching to another app or hiding this tab logs a MOBILE_APP_SWITCH event."
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Rules List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#0B1C30]">
              <span>{vi.proctor.rulesTitle}</span>
              <span className="text-slate-400">{tr("Học sinh cần tuân thủ", "Students must follow")}</span>
            </div>

            {(assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN") && (
              <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                  <Maximize2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0B1C30]">
                    {tr("Chế độ toàn màn hình (Full Screen)", "Fullscreen mode")}
                  </p>
                  <p className="text-xs text-[#464555]">
                    {tr("Bắt buộc duy trì chế độ toàn màn hình trong suốt quá trình làm bài.", "You must stay in fullscreen for the whole exam.")}
                  </p>
                </div>
              </div>
            )}

            {(assignment.blockCopyPaste || assignment.proctorMode === "LOCKDOWN") && (
              <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                  <ClipboardX className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0B1C30]">
                    {tr("Vô hiệu hoá sao chép & dán", "Copy & paste disabled")}
                  </p>
                  <p className="text-xs text-[#464555]">
                    {tr("Không được sao chép (Copy), dán (Paste), kéo thả, cắt hoặc mở menu chuột phải.", "No copying, pasting, drag-and-drop, cutting or right-click menu.")}
                  </p>
                </div>
              </div>
            )}

            {(assignment.audioMaxPlays !== null || assignment.audioBlockPause || assignment.audioBlockSeek) && (
              <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                  <Headphones className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0B1C30]">
                    {tr("Quy định phát file nghe", "Audio playback rules")}
                  </p>
                  <p className="text-xs text-[#464555]">
                    {[
                      assignment.audioMaxPlays !== null
                        ? tr(`Tối đa ${assignment.audioMaxPlays} lượt nghe cho mỗi file`, `Up to ${assignment.audioMaxPlays} play(s) per track`)
                        : tr("Nghe không giới hạn", "Unlimited plays"),
                      assignment.audioBlockPause ? tr("không cho dừng", "pausing disabled") : null,
                      assignment.audioBlockSeek ? tr("không cho tua", "seeking disabled") : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                <MonitorOff className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0B1C30]">
                  {tr("Không chuyển tab hoặc đổi ứng dụng", "No switching tabs or apps")}
                </p>
                <p className="text-xs text-[#464555]">
                  {tr("Không mở tab trình duyệt khác, không thu nhỏ cửa sổ hay đăng nhập nhiều thiết bị.", "Do not open other browser tabs, minimise the window or sign in on several devices.")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                <Radio className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0B1C30]">{tr("Giám sát & cảnh báo tức thì", "Live monitoring & alerts")}</p>
                <p className="text-xs text-[#464555]">
                  {tr("Mọi hành vi rời màn hình được ghi theo giờ máy chủ và báo ngay cho giáo viên.", "Every time you leave the screen it is logged with server time and reported to the teacher.")}
                </p>
              </div>
            </div>
          </div>

          {/* Strict Violation Rules Red Box (Stitch & PLAN 6C mandatory!) */}
          <div
            data-testid="strict-rules-box"
            className={
              isStrict
                ? "rounded-2xl border-2 border-red-200 bg-[#FEF2F2] p-4 text-xs text-[#93000A] space-y-2"
                : "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2"
            }
          >
            <p className="flex items-center gap-1.5 text-sm font-bold text-[#BA1A1A]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {tr("LUẬT XỬ LÝ VI PHẠM (ÁP DỤNG CHO BÀI THI NÀY)", "VIOLATION RULES (FOR THIS EXAM)")}
            </p>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed">
              <li>
                {tr("Số lần vi phạm tối đa trước khi xử lý:", "Maximum violations before action:")}{" "}
                <strong>{assignment.maxViolations} {tr("lần", "times")}</strong>.
              </li>
              {assignment.violationAction === "LOCK" && (
                <li>
                  {tr("Chạm ngưỡng", "Reaching")} {assignment.maxViolations} {tr("lần →", "violation(s) →")}{" "}
                  <strong>{tr("BÀI THI BỊ KHOÁ NGAY LẬP TỨC", "THE EXAM IS LOCKED IMMEDIATELY")}</strong>{tr(". Đáp án đã làm được giữ lại, chỉ giáo viên mới có quyền mở khoá để tiếp tục.", ". Your answers are kept; only the teacher can unlock it so you can continue.")}
                </li>
              )}
              {assignment.violationAction === "RESTART" && (
                <li>
                  {tr("Chạm ngưỡng", "Reaching")} {assignment.maxViolations} {tr("lần →", "violation(s) →")}{" "}
                  <strong>{tr("HUỶ TOÀN BỘ ĐÁP ÁN & BẮT BUỘC LÀM LẠI TỪ ĐẦU", "ALL ANSWERS CLEARED & YOU MUST START OVER")}</strong>{tr(". Đồng hồ đếm ngược KHÔNG được đặt lại.", ". The countdown is NOT reset.")}
                </li>
              )}
              {assignment.violationAction === "AUTO_SUBMIT" && (
                <li>
                  {tr("Chạm ngưỡng", "Reaching")} {assignment.maxViolations} {tr("lần →", "violation(s) →")}{" "}
                  <strong>{tr("HỆ THỐNG TỰ ĐỘNG NỘP BÀI NGAY", "THE SYSTEM SUBMITS IMMEDIATELY")}</strong> {tr("với các đáp án hiện có.", "with your current answers.")}
                </li>
              )}
              {assignment.violationAction === "WARN" && (
                <li>
                  {tr("Mọi hành vi rời màn hình sẽ được ghi nhận vào nhật ký giám sát và báo giáo viên.", "Every time you leave the screen it is logged and reported to the teacher.")}
                </li>
              )}
              <li>
                {tr("Lưu ý: Đồng hồ làm bài tính theo máy chủ và vẫn tiếp tục đếm ngược trong thời gian bạn rời màn hình hoặc bị khoá bài.", "Note: the timer runs on the server and keeps counting down while you are away or locked.")}
              </li>
            </ul>
          </div>

          {/* Camera Check & Privacy Consent Step (when requireCamera = true) */}
          {assignment.requireCamera && (
            <div
              data-testid="camera-check-box"
              className="rounded-2xl border-2 border-indigo-200 bg-[#F8F9FF] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-[#4F46E5]" />
                  <p className="text-sm font-bold text-[#0B1C30]">
                    {tr("Kiểm tra Camera trước khi vào thi", "Camera check before starting")}
                  </p>
                </div>
                {cameraChecked && (
                  <Badge variant="mint" data-testid="camera-ready-badge">
                    <CheckCircle2 className="h-3 w-3" /> {tr("Camera sẵn sàng", "Camera ready")}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="relative h-32 w-44 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                  <video
                    ref={previewVideoRef}
                    muted
                    playsInline
                    className="h-full w-full object-cover scale-x-[-1]"
                  />
                  {!cameraChecked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-[11px] text-slate-300 px-2">
                      <Camera className="h-5 w-5 mb-1 opacity-70" />
                      {tr("Chưa bật camera", "Camera off")}
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2 text-xs text-[#464555]">
                  <p>
                    {tr(
                      "Hình ảnh từ webcam được xử lý AI trực tiếp trên trình duyệt của bạn (không phát trực tiếp video lên máy chủ). ",
                      "Webcam frames are processed locally in your browser (no live video is streamed to the server). "
                    )}
                    {assignment.cameraSnapshots
                      ? tr(
                          "Chỉ chụp ảnh bằng chứng nhỏ (320×240) khi phát hiện sự kiện bất thường; chỉ giáo viên lớp được xem và ảnh tự động xoá sau 30 ngày.",
                          "Only small 320×240 snapshots are saved on alert events; only your teacher can view them and they are auto-deleted after 30 days."
                        )
                      : tr("Bài thi này không lưu ảnh chụp.", "Snapshots are disabled for this exam.")}
                  </p>
                  {cameraError && (
                    <p className="font-semibold text-[#BA1A1A]">{cameraError}</p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={cameraChecked ? "secondary" : "default"}
                    disabled={checkingCamera}
                    data-testid="check-camera-btn"
                    onClick={() => void handleCheckCamera()}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {checkingCamera
                      ? tr("Đang mở camera…", "Opening camera…")
                      : cameraChecked
                        ? tr("Kiểm tra lại camera", "Recheck camera")
                        : tr("Bật & kiểm tra camera", "Enable & test camera")}
                  </Button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  data-testid="camera-consent-checkbox"
                  checked={cameraConsent}
                  onChange={(e) => setCameraConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#4F46E5]"
                />
                <span className="text-xs font-semibold text-[#0B1C30]">
                  {tr(
                    "Tôi đồng ý bật camera giám sát AI và hiểu rõ mục đích, phạm vi lưu trữ dữ liệu hình ảnh theo quy định bảo vệ dữ liệu cá nhân.",
                    "I consent to AI webcam monitoring and understand how snapshot data is stored and purged."
                  )}
                </span>
              </label>
            </div>
          )}

          {/* Mic Check & RAM-only Privacy Consent Step (when requireMicMonitor = true) */}
          {assignment.requireMicMonitor && (
            <div
              data-testid="mic-check-box"
              className="rounded-2xl border-2 border-indigo-200 bg-[#F8F9FF] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-[#4F46E5]" />
                  <p className="text-sm font-bold text-[#0B1C30]">
                    {tr("Kiểm tra Micro trước khi vào thi", "Microphone check before starting")}
                  </p>
                </div>
                {micChecked && (
                  <Badge variant="mint" data-testid="mic-ready-badge">
                    <CheckCircle2 className="h-3 w-3" /> {tr("Micro sẵn sàng", "Mic ready")} ({micPreviewDb} dB)
                  </Badge>
                )}
              </div>

              <p className="text-xs text-[#464555]">
                {tr(
                  "Trình duyệt chỉ đo mức năng lượng âm lượng dải tiếng nói (300–3400Hz) trong RAM để phát hiện trao đổi liên tục. Tuyệt đối KHÔNG ghi âm, KHÔNG lưu file và KHÔNG gửi âm thanh lên máy chủ.",
                  "Your browser analyzes 300–3400Hz energy strictly in RAM to flag sustained talking. Zero audio is ever recorded, saved, or uploaded."
                )}
              </p>

              {micError && (
                <p className="text-xs font-semibold text-[#BA1A1A]">{micError}</p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant={micChecked ? "secondary" : "default"}
                  disabled={checkingMic}
                  data-testid="check-mic-btn"
                  onClick={() => void handleCheckMic()}
                >
                  <Mic className="h-3.5 w-3.5" />
                  {checkingMic
                    ? tr("Đang mở micro…", "Opening mic…")
                    : micChecked
                      ? tr("Kiểm tra lại micro", "Recheck mic")
                      : tr("Bật & kiểm tra micro", "Enable & test mic")}
                </Button>
                {micChecked && (
                  <div className="h-2.5 flex-1 min-w-[120px] overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-150"
                      style={{
                        width: `${Math.max(8, Math.min(100, Math.round(((micPreviewDb + 60) / 60) * 100)))}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  data-testid="mic-consent-checkbox"
                  checked={micConsent}
                  onChange={(e) => setMicConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#4F46E5]"
                />
                <span className="text-xs font-semibold text-[#0B1C30]">
                  {tr(
                    "Tôi đồng ý cho phép trình duyệt phân tích mức âm lượng giọng nói trong RAM (không ghi âm, không lưu trữ âm thanh).",
                    "I consent to in-RAM speech-level detection (zero audio recording or server upload)."
                  )}
                </span>
              </label>
            </div>
          )}

          {/* Agreement Checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300">
            <input
              type="checkbox"
              data-testid="rules-agree-checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#4F46E5]"
            />
            <span className="text-sm font-semibold text-[#0B1C30]">
              {vi.proctor.rulesAgree}
            </span>
          </label>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!canStart || starting}
              data-testid="start-proctored-btn"
              onClick={handleStartExam}
            >
              <Maximize2 className="h-4 w-4" />
              {starting
                ? tr("Đang khởi tạo ca thi…", "Starting the exam session…")
                : !mobileMode &&
                    (assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN")
                  ? vi.proctor.startFullscreen
                  : vi.proctor.startExam}
            </Button>

            <BackLink
              fallbackHref="/student"
              label={tr("Quay lại", "Back")}
              className="w-full justify-center rounded-xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
