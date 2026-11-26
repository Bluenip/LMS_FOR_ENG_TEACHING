"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import {
  isSpeakingAnswer,
  type AnswerValue,
  type SpeakingAnswerValue,
  type SpeakingOptions,
} from "@/lib/grading/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeakingQuestionInputProps {
  fieldId: string;
  options: SpeakingOptions;
  value: AnswerValue;
  onChange: (val: SpeakingAnswerValue) => void;
  disabled?: boolean;
}

export function SpeakingQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: SpeakingQuestionInputProps) {
  const { tr } = useI18n();
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const current: SpeakingAnswerValue = isSpeakingAnswer(value)
    ? value
    : { text: typeof value === "string" ? value : "", tries: 0 };

  const lang = options.lang ?? "en-US";
  const maxTries = typeof options.maxTries === "number" && options.maxTries > 0 ? options.maxTries : null;
  const reachedLimit = maxTries !== null && current.tries >= maxTries;

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  const handleToggleSpeech = () => {
    if (disabled) return;
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }
    if (reachedLimit) return;

    setSpeechError(null);
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechError(
        tr(
          "Trình duyệt không hỗ trợ nhận diện giọng nói tự động; hãy nhập trực tiếp lời nói ở ô bên dưới.",
          "Automatic speech recognition is unavailable in this browser; please type your spoken phrase below."
        )
      );
      return;
    }

    try {
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript ?? "";
        onChange({
          text: transcript.trim(),
          tries: current.tries + 1,
          ...(current.audioKey ? { audioKey: current.audioKey } : {}),
        });
      };
      rec.onerror = (ev) => {
        setSpeechError(
          tr(`Lỗi nhận diện giọng nói (${ev.error ?? "unknown"}).`, `Speech error (${ev.error ?? "unknown"}).`)
        );
        setListening(false);
      };
      rec.onend = () => {
        setListening(false);
      };
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <div className="space-y-2.5" data-testid={`speaking-input-box-${fieldId}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          size="sm"
          variant={listening ? "destructive" : "secondary"}
          disabled={disabled || (reachedLimit && !listening)}
          onClick={handleToggleSpeech}
          data-testid={`speaking-mic-btn-${fieldId}`}
          className="min-h-[40px]"
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-[#4F46E5]" />}
          {listening
            ? tr("Dừng nghe", "Stop listening")
            : tr(`Nói tiếng Anh (${lang})`, `Speak (${lang})`)}
        </Button>

        {listening && (
          <div className="flex items-center gap-1" aria-label="Waveform">
            {[10, 18, 14, 20, 12].map((h, i) => (
              <span
                key={i}
                className={cn("w-1 rounded-full bg-[#4F46E5] animate-pulse")}
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        )}

        <span className="text-[11px] font-semibold text-[#464555] tabular-nums">
          {maxTries !== null
            ? tr(`Lượt: ${current.tries}/${maxTries}`, `Tries: ${current.tries}/${maxTries}`)
            : tr(`Số lượt đã thử: ${current.tries}`, `Tries: ${current.tries}`)}
        </span>
      </div>

      {speechError && <p className="text-[11px] text-amber-700">{speechError}</p>}

      <Input
        data-testid={`speaking-input-${fieldId}`}
        value={current.text}
        disabled={disabled}
        placeholder={tr("Nội dung câu nói đã nhận diện (hoặc nhập dự phòng)…", "Recognized spoken transcript (or type fallback)…")}
        onChange={(e) =>
          onChange({
            text: e.target.value,
            tries: current.tries > 0 ? current.tries : e.target.value.trim() ? 1 : 0,
            ...(current.audioKey ? { audioKey: current.audioKey } : {}),
          })
        }
        className="min-h-[40px] text-sm"
      />
    </div>
  );
}
