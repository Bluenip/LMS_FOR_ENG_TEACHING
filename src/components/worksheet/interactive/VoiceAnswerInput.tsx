"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  isVoiceAnswer,
  type AnswerValue,
  type VoiceAnswerOptions,
  type VoiceAnswerValue,
} from "@/lib/grading/types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

interface VoiceAnswerInputProps {
  fieldId: string;
  submissionId?: string | null;
  options: VoiceAnswerOptions;
  value: AnswerValue;
  onChange: (val: VoiceAnswerValue | null) => void;
  disabled?: boolean;
}

export function VoiceAnswerInput({
  fieldId,
  submissionId,
  options,
  value,
  onChange,
  disabled = false,
}: VoiceAnswerInputProps) {
  const { tr } = useI18n();
  const maxDurationSec =
    typeof options.maxDurationSec === "number" && options.maxDurationSec > 0
      ? options.maxDurationSec
      : 120;

  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [uploading, setUploading] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const current = isVoiceAnswer(value) ? value : null;

  const cleanupRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => cleanupRecording, []);

  const uploadAudioBlob = async (blob: Blob, filename: string, durationSec?: number) => {
    if (!submissionId) {
      toast.error(tr("Chưa có phiên làm bài để lưu file ghi âm.", "Start an attempt before saving audio."));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("fieldId", fieldId);
      formData.append("file", blob, filename);
      const res = await fetch(`/api/submissions/${submissionId}/files`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tải file ghi âm thất bại", "Audio upload failed"));
      onChange({
        fileKey: json.file.key,
        mimeType: json.file.mimeType,
        ...(durationSec !== undefined ? { durationSec } : {}),
      });
      toast.success(tr("Đã lưu bản ghi âm.", "Recording saved."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi tải ghi âm", "Audio upload error"));
    } finally {
      setUploading(false);
    }
  };

  const handleToggleRecord = async () => {
    if (disabled || uploading) return;
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error(tr("Trình duyệt không hỗ trợ ghi âm MediaRecorder.", "Browser lacks MediaRecorder."));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      const startedAt = Date.now();
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const mimeType = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const dur = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        cleanupRecording();
        setRecording(false);
        if (blob.size > 0) {
          void uploadAudioBlob(blob, "voice-answer.webm", dur);
        }
      };
      recorderRef.current = rec;
      setElapsedSec(0);
      setRecording(true);
      rec.start();

      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt) / 1000);
        setElapsedSec(secs);
        if (secs >= maxDurationSec) {
          rec.stop();
        }
      }, 500);
    } catch (err) {
      cleanupRecording();
      toast.error(err instanceof Error ? err.message : tr("Không thể mở micro.", "Cannot open mic."));
    }
  };

  const handleDelete = async () => {
    if (disabled || !current) return;
    if (submissionId) {
      await fetch(`/api/submissions/${submissionId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: current.fileKey }),
      }).catch(() => undefined);
    }
    onChange(null);
  };

  return (
    <div className="space-y-2.5" data-testid={`voice-answer-input-${fieldId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={recording ? "destructive" : "secondary"}
          disabled={disabled || uploading}
          onClick={() => void handleToggleRecord()}
          data-testid={`voice-record-btn-${fieldId}`}
          className="min-h-[40px]"
        >
          {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4 text-[#4F46E5]" />}
          {recording
            ? tr(`Dừng (${elapsedSec}s / ${maxDurationSec}s)`, `Stop (${elapsedSec}s / ${maxDurationSec}s)`)
            : uploading
              ? tr("Đang tải lên…", "Uploading…")
              : tr(`Ghi âm trả lời (tối đa ${maxDurationSec}s)`, `Record answer (max ${maxDurationSec}s)`)}
        </Button>

        {!disabled && submissionId && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/webm,audio/ogg,audio/mp4,audio/wav"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadAudioBlob(f, f.name);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px]"
            >
              <Upload className="h-3.5 w-3.5" />
              {tr("Tải file âm thanh", "Upload audio")}
            </Button>
          </>
        )}
      </div>

      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-[#F8F9FF] p-2.5">
          <audio controls src={`/api/files/${current.fileKey}`} className="h-9 max-w-full flex-1" />
          {!disabled && (
            <Button type="button" size="sm" variant="ghost" onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
