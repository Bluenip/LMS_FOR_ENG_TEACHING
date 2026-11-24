"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProctorEventType } from "@prisma/client";
import { BrowserCameraDetector } from "@/lib/proctor/camera-detector";
import { CameraRulesEngine } from "@/lib/proctor/camera-rules";

export type CameraHealthStatus = "initializing" | "ok" | "warning" | "off";

/** Live numbers for the optional debug readout (?camdebug=1). */
export interface CameraLiveReading {
  yawDeg: number | null;
  pitchDeg: number | null;
  phoneScore: number;
  calibrated: boolean;
}

export type CameraWarningType = "CAMERA_NO_FACE" | "CAMERA_MULTI_FACE" | "CAMERA_LOOK_AWAY" | "CAMERA_PHONE";

interface UseCameraProctorOptions {
  enabled: boolean;
  submissionId: string | null;
  captureSnapshots: boolean;
  onProctorEvent: (ev: {
    type: ProctorEventType;
    durationMs?: number;
    clientAt: string;
    meta?: Record<string, unknown>;
  }) => void | Promise<void>;
  /** Called when the AI records something, so the page can warn the student right away. */
  onWarning?: (type: CameraWarningType) => void;
}

export function useCameraProctor({
  enabled,
  submissionId,
  captureSnapshots,
  onProctorEvent,
  onWarning,
}: UseCameraProctorOptions) {
  const [reading, setReading] = useState<CameraLiveReading | null>(null);
  const onWarningRef = useRef(onWarning);
  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);
  const [status, setStatus] = useState<CameraHealthStatus>("initializing");
  const [cameraOff, setCameraOff] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [faceCount, setFaceCount] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onProctorEventRef = useRef(onProctorEvent);
  useEffect(() => {
    onProctorEventRef.current = onProctorEvent;
  }, [onProctorEvent]);

  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  const retryCamera = useCallback(() => {
    setError(null);
    setCameraOff(false);
    setStatus("initializing");
    setRetrySeq((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !submissionId) {
      setStatus("initializing");
      setCameraOff(false);
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;
    const detector = new BrowserCameraDetector();
    const engine = new CameraRulesEngine();
    let lastCameraOffReportedAt = 0;

    const reportCameraOff = (reason: string) => {
      if (cancelled) return;
      setCameraOff(true);
      setStatus("off");
      const now = Date.now();
      if (now - lastCameraOffReportedAt > 10_000) {
        lastCameraOffReportedAt = now;
        void onProctorEventRef.current({
          type: "CAMERA_OFF",
          clientAt: new Date().toISOString(),
          meta: { reason },
        });
      }
    };

    const captureAndUploadSnapshot = async (): Promise<string | undefined> => {
      if (!captureSnapshots || !submissionId) return undefined;
      const video = videoElRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return undefined;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.72)
        );
        if (!blob) return undefined;

        const formData = new FormData();
        formData.append("file", blob, "snapshot.jpg");
        const res = await fetch(`/api/submissions/${submissionId}/proctor-snapshots`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) return undefined;
        const json = (await res.json()) as { key?: string };
        return json.key;
      } catch {
        return undefined;
      }
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt không hỗ trợ camera hoặc không chạy trên HTTPS.");
        reportCameraOff("UNSUPPORTED_BROWSER");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoElRef.current) {
          videoElRef.current.srcObject = stream;
          await videoElRef.current.play().catch(() => undefined);
        }

        const track = stream.getVideoTracks()[0];
        if (track) {
          track.onended = () => reportCameraOff("TRACK_ENDED");
          track.onmute = () => reportCameraOff("TRACK_MUTED");
          track.onunmute = () => {
            if (!cancelled) {
              setCameraOff(false);
              setStatus("ok");
            }
          };
        }

        setCameraOff(false);
        setStatus("ok");

        await detector.init();
        if (cancelled) return;
        setModelReady(true);

        const tick = async () => {
          if (cancelled) return;
          // Pause AI detection when tab is hidden (Layer 1 already logs TAB_HIDDEN)
          if (!document.hidden && videoElRef.current) {
            const activeTrack = streamRef.current?.getVideoTracks()[0];
            if (!activeTrack || activeTrack.readyState !== "live" || !activeTrack.enabled) {
              reportCameraOff("TRACK_INACTIVE");
            } else {
              const nowMs = performance.now();
              const obs = detector.detect(videoElRef.current, nowMs);
              if (obs) {
                setFaceCount(obs.faces);
                const fired = engine.update(obs);
                setStatus(engine.isSuspicious(obs) ? "warning" : "ok");
                const dev = engine.deviation(obs.yawDeg, obs.pitchDeg);
                setReading((prev) => ({
                  yawDeg: dev.yawDeg,
                  pitchDeg: dev.pitchDeg,
                  // keep the last phone score between object-detector frames
                  phoneScore: obs.objectChecked ? obs.phoneScore ?? 0 : prev?.phoneScore ?? 0,
                  calibrated: engine.calibrated,
                }));

                for (const ev of fired) {
                  onWarningRef.current?.(ev.type);
                  const snapshotKey = await captureAndUploadSnapshot();
                  void onProctorEventRef.current({
                    type: ev.type,
                    durationMs: ev.durationMs,
                    clientAt: new Date().toISOString(),
                    meta: {
                      ...ev.meta,
                      ...(snapshotKey ? { snapshotKey } : {}),
                    },
                  });
                }
              }
            }
          }
          if (!cancelled) {
            timerId = window.setTimeout(() => void tick(), 400);
          }
        };

        timerId = window.setTimeout(() => void tick(), 400);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Không thể truy cập camera. Vui lòng cấp quyền camera cho trình duyệt."
        );
        reportCameraOff("PERMISSION_DENIED");
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      detector.dispose();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          t.onended = null;
          t.onmute = null;
          t.onunmute = null;
          t.stop();
        });
        streamRef.current = null;
      }
      if (videoElRef.current) {
        videoElRef.current.srcObject = null;
      }
    };
  }, [enabled, submissionId, captureSnapshots, retrySeq]);

  return {
    attachVideoRef,
    status,
    cameraOff,
    modelReady,
    faceCount,
    reading,
    error,
    retryCamera,
  };
}
