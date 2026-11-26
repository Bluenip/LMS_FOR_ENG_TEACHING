"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeVoiceBandRms,
  MicVoiceMonitorEngine,
  rmsToApproxDb,
} from "@/lib/proctor/mic-monitor";

declare global {
  interface Window {
    __engclassMicMock?: {
      rmsVoiceBand?: number;
      nextRms?: () => number | null;
    };
  }
}

interface UseMicProctorOptions {
  enabled: boolean;
  dryRun?: boolean;
  onVoiceEvent: (ev: { durationMs: number; peakRms: number; clientAt: string }) => void | Promise<void>;
  onWarning?: () => void;
}

/**
 * Privacy-first browser microphone energy monitor:
 * computes FFT energy strictly over 300-3400Hz in RAM without ever creating MediaRecorder or audio blobs.
 */
export function useMicProctor({
  enabled,
  dryRun = false,
  onVoiceEvent,
  onWarning,
}: UseMicProctorOptions) {
  const [active, setActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [dbLevel, setDbLevel] = useState(-60);
  const [error, setError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  const onVoiceEventRef = useRef(onVoiceEvent);
  const onWarningRef = useRef(onWarning);
  useEffect(() => {
    onVoiceEventRef.current = onVoiceEvent;
  }, [onVoiceEvent]);
  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);

  const retryMic = useCallback(() => {
    setError(null);
    setRetrySeq((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      setSpeaking(false);
      setVoiceLevel(0);
      setDbLevel(-60);
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    const engine = new MicVoiceMonitorEngine();

    const start = async () => {
      const hasMock = typeof window !== "undefined" && Boolean(window.__engclassMicMock);
      let analyser: AnalyserNode | null = null;
      let freqBuf: Uint8Array<ArrayBuffer> | null = null;

      if (!hasMock) {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Trình duyệt không hỗ trợ micro.");
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtx = new AudioCtx();
          const source = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        } catch (err) {
          if (cancelled) return;
          setError(
            err instanceof Error
              ? err.message
              : "Không thể truy cập micro. Vui lòng cấp quyền micro."
          );
          setActive(false);
          return;
        }
      }

      if (cancelled) return;
      setActive(true);
      setError(null);

      const sample = () => {
        if (cancelled) return;
        let rms = 0;
        if (typeof window !== "undefined" && window.__engclassMicMock) {
          const m = window.__engclassMicMock;
          const val = m.nextRms ? m.nextRms() : (m.rmsVoiceBand ?? 0);
          rms = typeof val === "number" && Number.isFinite(val) ? val : 0;
        } else if (analyser && freqBuf && audioCtx) {
          analyser.getByteFrequencyData(freqBuf);
          rms = computeVoiceBandRms(freqBuf, audioCtx.sampleRate, analyser.fftSize);
        }

        const res = engine.update({ t: performance.now(), rmsVoiceBand: rms });
        setVoiceLevel(rms);
        setDbLevel(rmsToApproxDb(rms));
        setSpeaking(res.speaking);

        if (res.fired) {
          onWarningRef.current?.();
          void onVoiceEventRef.current({
            durationMs: res.durationMs,
            peakRms: res.peakRms,
            clientAt: new Date().toISOString(),
          });
        }

        if (!cancelled) {
          timerId = window.setTimeout(sample, 250);
        }
      };

      timerId = window.setTimeout(sample, 250);
    };

    void start();

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (audioCtx && audioCtx.state !== "closed") {
        void audioCtx.close().catch(() => undefined);
      }
    };
  }, [enabled, dryRun, retrySeq]);

  return {
    active,
    speaking,
    voiceLevel,
    dbLevel,
    error,
    retryMic,
  };
}
