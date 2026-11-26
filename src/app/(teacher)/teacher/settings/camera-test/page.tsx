"use client";

import { useCallback, useState } from "react";
import type { CameraSensitivity, ProctorEventType } from "@prisma/client";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Eye,
  Mic,
  MicOff,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Sliders,
} from "lucide-react";
import { BackLink } from "@/components/navigation/BackLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCameraProctor } from "@/hooks/useCameraProctor";
import { useMicProctor } from "@/hooks/useMicProctor";
import { getCameraConfigForSensitivity } from "@/lib/proctor/camera-rules";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDateTime } from "@/lib/utils";

interface SandboxEventItem {
  id: string;
  type: ProctorEventType;
  at: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

const SENSITIVITY_OPTIONS: Array<{
  value: CameraSensitivity;
  labelVi: string;
  labelEn: string;
  descVi: string;
  descEn: string;
}> = [
  {
    value: "LOW",
    labelVi: "Nhẹ (Low)",
    labelEn: "Low",
    descVi: "Ít báo nhầm khi học sinh cúi nháp; góc đầu rộng 35°",
    descEn: "Tolerant for note-taking; 35° head pose window",
  },
  {
    value: "MEDIUM",
    labelVi: "Vừa (Medium)",
    labelEn: "Medium",
    descVi: "Khuyên dùng mặc định; cân bằng giữa chính xác và thoải mái",
    descEn: "Recommended default; balanced accuracy and comfort",
  },
  {
    value: "HIGH",
    labelVi: "Chặt (High)",
    labelEn: "High",
    descVi: "Kiểm tra gắt gao thi thật; nhạy góc nhìn 18° và liếc mắt",
    descEn: "Strict exam mode; 18° pose window and tighter iris gaze",
  },
];

export default function TeacherCameraTestPage() {
  const { m: vi, tr, locale } = useI18n();
  const [sensitivity, setSensitivity] = useState<CameraSensitivity>("MEDIUM");
  const [camEnabled, setCamEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [events, setEvents] = useState<SandboxEventItem[]>([]);

  const pushEvent = useCallback(
    (item: Omit<SandboxEventItem, "id">) => {
      setEvents((prev) =>
        [
          {
            ...item,
            id: `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          },
          ...prev,
        ].slice(0, 40)
      );
    },
    []
  );

  const cameraProctor = useCameraProctor({
    enabled: camEnabled,
    submissionId: null,
    captureSnapshots: false,
    sensitivity,
    dryRun: true,
    onProctorEvent: async (ev) => {
      pushEvent({
        type: ev.type,
        at: ev.clientAt,
        durationMs: ev.durationMs,
        meta: ev.meta,
      });
    },
  });

  const micProctor = useMicProctor({
    enabled: micEnabled,
    dryRun: true,
    onVoiceEvent: async (ev) => {
      pushEvent({
        type: "MIC_VOICE",
        at: ev.clientAt,
        durationMs: ev.durationMs,
        meta: { peakRms: Number(ev.peakRms.toFixed(3)) },
      });
    },
  });

  const activeConfig = getCameraConfigForSensitivity(sensitivity);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink fallbackHref="/teacher/settings" label={tr("Quay lại cài đặt", "Back to settings")} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0B1C30]">
              {tr("Thử Camera & Micro AI", "AI Camera & Mic Test Sandbox")}
            </h1>
            <p className="mt-1 text-sm text-[#464555]">
              {tr(
                "Chạy thử bộ phát hiện khuôn mặt, hướng nhìn mắt, điện thoại và năng lượng giọng nói ngay trên máy. Không tạo bài thi và không tải lên bất kỳ video/âm thanh nào.",
                "Preview face tracking, iris gaze, phone detection, and 300–3400Hz voice energy locally. No submission is created and zero video or audio leaves your device."
              )}
            </p>
          </div>
          <Badge variant="indigo">
            <Sliders className="h-3.5 w-3.5" />
            {tr("Chế độ thử nghiệm cục bộ", "Local Dry-Run Sandbox")}
          </Badge>
        </div>
      </div>

      {/* Sensitivity + Toggle Controls */}
      <div className="stitch-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#0B1C30]">
              {tr("1. Chọn độ nhạy Camera AI", "1. Choose AI Camera Sensitivity")}
            </p>
            <p className="text-xs text-[#464555]">
              {tr(
                "Thay đổi độ nhạy để kiểm chứng tốc độ phát hiện và ngưỡng góc đầu / mắt.",
                "Switch sensitivity presets to test head-pose tolerances and iris-gaze triggers."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={camEnabled ? "destructive" : "default"}
              onClick={() => setCamEnabled((v) => !v)}
              className="min-h-[44px]"
              data-testid="toggle-camera-test-btn"
            >
              {camEnabled ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {camEnabled
                ? tr("Tắt Camera AI", "Stop AI Camera")
                : tr("Bật Camera AI", "Start AI Camera")}
            </Button>
            <Button
              type="button"
              variant={micEnabled ? "destructive" : "secondary"}
              onClick={() => setMicEnabled((v) => !v)}
              className="min-h-[44px]"
              data-testid="toggle-mic-test-btn"
            >
              {micEnabled ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {micEnabled
                ? tr("Tắt Micro AI", "Stop AI Mic")
                : tr("Bật Micro AI (RAM)", "Start AI Mic (RAM)")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SENSITIVITY_OPTIONS.map((opt) => {
            const active = sensitivity === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSensitivity(opt.value)}
                data-testid={`sensitivity-btn-${opt.value}`}
                aria-pressed={active}
                className={cn(
                  "min-h-[44px] rounded-xl border p-3.5 text-left transition",
                  active
                    ? "border-[#4F46E5] bg-indigo-50/70 shadow-sm ring-1 ring-[#4F46E5]/30"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#0B1C30]">
                    {tr(opt.labelVi, opt.labelEn)}
                  </span>
                  {active && <CheckCircle2 className="h-4 w-4 text-[#4F46E5]" />}
                </div>
                <p className="mt-1 text-xs text-[#464555]">{tr(opt.descVi, opt.descEn)}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-[#464555]">
          <span className="rounded-lg bg-[#F8F9FF] px-2.5 py-1 border border-slate-200">
            {tr("Ngưỡng quay đầu:", "Head threshold:")}{" "}
            <strong className="text-[#0B1C30]">
              ±{activeConfig.maxYawDeg}° / ±{activeConfig.maxPitchDeg}°
            </strong>
          </span>
          <span className="rounded-lg bg-[#F8F9FF] px-2.5 py-1 border border-slate-200">
            {tr("Ngưỡng liếc mắt:", "Iris gaze:")}{" "}
            <strong className="text-[#0B1C30]">
              ±{activeConfig.gazeDeviationThreshold} ({Math.round(activeConfig.gazeDurationMs / 1000)}s)
            </strong>
          </span>
          <span className="rounded-lg bg-[#F8F9FF] px-2.5 py-1 border border-slate-200">
            {tr("Mất mặt:", "No face:")}{" "}
            <strong className="text-[#0B1C30]">{Math.round(activeConfig.noFaceDurationMs / 1000)}s</strong>
          </span>
          <span className="rounded-lg bg-[#F8F9FF] px-2.5 py-1 border border-slate-200">
            {tr("Ngưỡng điện thoại:", "Phone score:")}{" "}
            <strong className="text-[#0B1C30]">{activeConfig.phoneScoreThreshold}</strong>
          </span>
        </div>
      </div>

      {/* Live Preview + Telemetry & Event Log */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          <div className="stitch-card overflow-hidden p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-[#4F46E5]" />
                <h2 className="text-sm font-bold text-[#0B1C30]">
                  {tr("Khung hình Camera trực tiếp", "Live Camera Feed")}
                </h2>
              </div>
              <Badge
                variant={
                  !camEnabled
                    ? "neutral"
                    : cameraProctor.status === "ok"
                      ? "mint"
                      : cameraProctor.status === "warning"
                        ? "orange"
                        : "danger"
                }
              >
                {!camEnabled
                  ? tr("Đang tắt", "Stopped")
                  : cameraProctor.cameraOff
                    ? tr("Mất camera", "Camera off")
                    : cameraProctor.modelReady
                      ? tr("AI sẵn sàng", "AI ready")
                      : tr("Đang tải AI…", "Loading AI…")}
              </Badge>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
              <video
                ref={cameraProctor.attachVideoRef}
                muted
                autoPlay
                playsInline
                className={cn("h-full w-full -scale-x-100 object-cover", !camEnabled && "hidden")}
              />
              {!camEnabled && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-300">
                  <Camera className="h-9 w-9 text-slate-400" />
                  <p className="text-sm font-semibold">
                    {tr("Bấm «Bật Camera AI» để bắt đầu kiểm thử", "Click «Start AI Camera» to begin testing")}
                  </p>
                </div>
              )}
              {camEnabled && (
                <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">
                    {tr("Số mặt:", "Faces:")} {cameraProctor.faceCount}
                  </span>
                  {cameraProctor.reading && (
                    <span className="rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">
                      {cameraProctor.reading.calibrated
                        ? tr("Đã hiệu chuẩn", "Calibrated")
                        : tr("Đang hiệu chuẩn…", "Calibrating…")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {cameraProctor.error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {cameraProctor.error}
              </p>
            )}

            {/* Telemetry tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="camera-telemetry-grid">
              <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">Yaw (L/R)</p>
                <p className="mt-1 text-base font-bold tabular-nums text-[#0B1C30]">
                  {cameraProctor.reading?.yawDeg !== null && cameraProctor.reading?.yawDeg !== undefined
                    ? `${cameraProctor.reading.yawDeg.toFixed(1)}°`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-400">Pitch (U/D)</p>
                <p className="mt-1 text-base font-bold tabular-nums text-[#0B1C30]">
                  {cameraProctor.reading?.pitchDeg !== null &&
                  cameraProctor.reading?.pitchDeg !== undefined
                    ? `${cameraProctor.reading.pitchDeg.toFixed(1)}°`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-400">
                  <Eye className="h-3 w-3" />
                  Gaze X
                </p>
                <p className="mt-1 text-base font-bold tabular-nums text-[#0B1C30]">
                  {cameraProctor.reading?.gazeXOffset !== null &&
                  cameraProctor.reading?.gazeXOffset !== undefined
                    ? cameraProctor.reading.gazeXOffset.toFixed(2)
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-400">
                  <Smartphone className="h-3 w-3" />
                  Phone
                </p>
                <p className="mt-1 text-base font-bold tabular-nums text-[#0B1C30]">
                  {cameraProctor.reading
                    ? cameraProctor.reading.phoneScore.toFixed(2)
                    : "0.00"}
                </p>
              </div>
            </div>
          </div>

          {/* Live Mic FFT Energy Card */}
          <div className="stitch-card p-4 space-y-3" data-testid="mic-telemetry-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-[#4F46E5]" />
                <h2 className="text-sm font-bold text-[#0B1C30]">
                  {tr("Mức âm lượng dải tiếng nói (300–3400Hz)", "Voice-band Energy (300–3400Hz)")}
                </h2>
              </div>
              <Badge variant={micEnabled ? (micProctor.speaking ? "orange" : "mint") : "neutral"}>
                {!micEnabled
                  ? tr("Micro đang tắt", "Mic stopped")
                  : micProctor.speaking
                    ? tr("Đang phát hiện tiếng nói", "Speech detected")
                    : tr("Yên tĩnh", "Quiet")}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#464555]">
                <span>
                  {tr("Âm lượng:", "Level:")}{" "}
                  <strong className="tabular-nums text-[#0B1C30]">{micProctor.dbLevel} dB</strong>
                </span>
                <span className="tabular-nums">
                  RMS {(micProctor.voiceLevel * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full transition-all duration-150",
                    micProctor.speaking ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, Math.round(micProctor.voiceLevel * 250))}%` }}
                />
              </div>
            </div>

            {micProctor.error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {micProctor.error}
              </p>
            )}
          </div>
        </div>

        {/* Right: Simulated Event Log */}
        <div className="lg:col-span-5">
          <div className="stitch-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#F97316]" />
                <h2 className="text-sm font-bold text-[#0B1C30]">
                  {tr("Nhật ký sự kiện giả lập", "Simulated Event Log")} ({events.length})
                </h2>
              </div>
              {events.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEvents([])}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {tr("Xoá log", "Clear")}
                </Button>
              )}
            </div>

            <div
              data-testid="camera-test-event-log"
              className="max-h-[420px] space-y-2 overflow-y-auto pr-1"
            >
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                  {tr(
                    "Chưa có sự kiện nào. Thử quay đầu, nhìn lệch màn hình, đưa điện thoại vào khung hình hoặc nói vào micro liên tục 2.5 giây.",
                    "No events yet. Try looking away, shifting iris gaze, showing a phone, or speaking into the mic for 2.5s."
                  )}
                </div>
              ) : (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#0B1C30]">
                        {vi.proctor.events[ev.type] ?? ev.type}
                      </span>
                      <span className="tabular-nums text-[11px] text-[#464555]">
                        {formatDateTime(ev.at, locale)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#464555]">
                      <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono">{ev.type}</span>
                      {typeof ev.durationMs === "number" && ev.durationMs > 0 && (
                        <span>{(ev.durationMs / 1000).toFixed(1)}s</span>
                      )}
                      {ev.meta && Object.keys(ev.meta).length > 0 && (
                        <span className="truncate font-mono">{JSON.stringify(ev.meta)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
