"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Headphones, Lock, Pause, Play, Volume2 } from "lucide-react";
import { cn, formatSecondsMMSS } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";

export interface WorksheetAudioTrack {
  id: string;
  title: string;
  durationSec: number | null;
  order: number;
}

interface LimitedAudioPlayerProps {
  audio: WorksheetAudioTrack;
  /** Student exam mode: uses server-enforced play token API. */
  submissionId?: string | null;
  /** Teacher/preview direct URL (no play limit enforced). */
  previewUrl?: string | null;
  playsUsed?: number;
  maxPlays?: number | null;
  blockPause?: boolean;
  blockSeek?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPlayCountChange?: (audioId: string, nextPlaysUsed: number) => void;
}

export function LimitedAudioPlayer({
  audio,
  submissionId,
  previewUrl,
  playsUsed: initialPlaysUsed = 0,
  maxPlays = null,
  blockPause = false,
  blockSeek = false,
  disabled = false,
  compact = false,
  onPlayCountChange,
}: LimitedAudioPlayerProps) {
  const { tr } = useI18n();
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const [playsUsed, setPlaysUsed] = useState(initialPlaysUsed);
  const [activeSrc, setActiveSrc] = useState<string | null>(previewUrl ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(audio.durationSec ?? 0);
  const [confirmLastPlay, setConfirmLastPlay] = useState(false);
  const lastAllowedTimeRef = useRef(0);

  useEffect(() => {
    setPlaysUsed(initialPlaysUsed);
  }, [initialPlaysUsed]);

  useEffect(() => {
    if (previewUrl) {
      setActiveSrc(previewUrl);
    }
  }, [previewUrl]);

  const playsLeft = maxPlays !== null ? Math.max(0, maxPlays - playsUsed) : null;
  const isExhausted = !previewUrl && maxPlays !== null && playsLeft === 0 && !activeSrc;

  const startFreshPlay = async () => {
    const el = audioElRef.current;
    if (!el || disabled) return;

    // Preview mode: direct playback
    if (previewUrl) {
      try {
        await el.play();
      } catch {
        toast.error(tr("Không thể phát file âm thanh.", "Could not play audio."));
      }
      return;
    }

    if (!submissionId) return;

    // Resuming an already granted play (only when pause is allowed and stream is still loaded)
    if (activeSrc && !el.ended && el.src) {
      try {
        await el.play();
      } catch {
        toast.error(tr("Không thể tiếp tục phát âm thanh.", "Could not resume audio."));
      }
      return;
    }

    // Last-play confirmation step when play limit is set and 1 play remains
    if (maxPlays !== null && playsLeft === 1 && !confirmLastPlay) {
      setConfirmLastPlay(true);
      return;
    }
    setConfirmLastPlay(false);

    setLoading(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/audio/${audio.id}/play`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? tr("Không thể phát file nghe.", "Could not play audio."));
      }

      setPlaysUsed(json.playsUsed);
      onPlayCountChange?.(audio.id, json.playsUsed);
      lastAllowedTimeRef.current = 0;
      setCurrentTime(0);
      setActiveSrc(json.streamUrl);

      el.src = json.streamUrl;
      el.load();
      await el.play();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tr("Không thể phát file nghe.", "Could not play audio.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlay = async () => {
    const el = audioElRef.current;
    if (!el || disabled || loading) return;

    if (isPlaying) {
      if (blockPause && !previewUrl) {
        toast.info(tr("Bài này không cho phép dừng file nghe.", "Pausing is disabled for this audio."));
        return;
      }
      el.pause();
      return;
    }

    await startFreshPlay();
  };

  const handleSeek = (nextSec: number) => {
    if (blockSeek && !previewUrl) return;
    const el = audioElRef.current;
    if (!el || !Number.isFinite(nextSec)) return;
    el.currentTime = nextSec;
    lastAllowedTimeRef.current = nextSec;
    setCurrentTime(nextSec);
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      data-testid={`limited-audio-player-${audio.id}`}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "rounded-xl border border-indigo-200/80 bg-[#F8F9FF] select-none",
        compact ? "p-2.5 space-y-2" : "p-3.5 space-y-2.5"
      )}
    >
      <audio
        ref={audioElRef}
        src={previewUrl ?? undefined}
        preload={previewUrl ? "metadata" : "none"}
        controlsList="nodownload noplaybackrate"
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          // If pause is blocked and the browser/user tried to pause before end, immediately resume
          const el = audioElRef.current;
          if (blockPause && !previewUrl && el && !el.ended && activeSrc) {
            void el.play().catch(() => setIsPlaying(false));
            return;
          }
          setIsPlaying(false);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (blockSeek && !previewUrl) {
            // Guard against programmatic or keyboard seek jumps > 1.5s
            if (Math.abs(el.currentTime - lastAllowedTimeRef.current) > 1.5) {
              el.currentTime = lastAllowedTimeRef.current;
              return;
            }
          }
          lastAllowedTimeRef.current = el.currentTime;
          setCurrentTime(el.currentTime);
        }}
        onSeeking={(e) => {
          const el = e.currentTarget;
          if (blockSeek && !previewUrl && Math.abs(el.currentTime - lastAllowedTimeRef.current) > 1.2) {
            el.currentTime = lastAllowedTimeRef.current;
          }
        }}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          lastAllowedTimeRef.current = 0;
          // Clear stream URL on completion so next play requires a fresh server play grant
          if (!previewUrl) {
            setActiveSrc(null);
            if (audioElRef.current) {
              audioElRef.current.removeAttribute("src");
              audioElRef.current.load();
            }
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
            <Headphones className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-xs font-bold text-[#0B1C30]">{audio.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!previewUrl && maxPlays !== null ? (
            <Badge
              variant={isExhausted ? "danger" : playsLeft === 1 ? "orange" : "default"}
              data-testid={`audio-plays-badge-${audio.id}`}
            >
              {isExhausted
                ? tr("Đã hết lượt nghe", "No plays left")
                : tr(`Còn ${playsLeft}/${maxPlays} lượt nghe`, `${playsLeft}/${maxPlays} play(s) left`)}
            </Badge>
          ) : !previewUrl ? (
            <Badge variant="neutral">
              {tr(`Đã nghe ${playsUsed} lần (∞)`, `Played ${playsUsed}× (∞)`)}
            </Badge>
          ) : null}

          {!previewUrl && blockPause && (
            <Badge variant="outline" className="text-[10px]">
              <Lock className="h-2.5 w-2.5" /> {tr("Không dừng", "No pause")}
            </Badge>
          )}
          {!previewUrl && blockSeek && (
            <Badge variant="outline" className="text-[10px]">
              <Lock className="h-2.5 w-2.5" /> {tr("Không tua", "No seek")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleTogglePlay()}
          disabled={disabled || loading || isExhausted || (isPlaying && blockPause && !previewUrl)}
          data-testid={`audio-play-btn-${audio.id}`}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition",
            isExhausted || disabled
              ? "bg-slate-300 cursor-not-allowed"
              : isPlaying && blockPause && !previewUrl
                ? "bg-indigo-400 cursor-not-allowed"
                : "bg-[#4F46E5] hover:bg-[#3525CD]"
          )}
          title={
            isExhausted
              ? tr("Đã hết lượt nghe", "No plays left")
              : isPlaying
                ? blockPause
                  ? tr("Không thể dừng", "Cannot pause")
                  : tr("Tạm dừng", "Pause")
                : tr("Phát file nghe", "Play audio")
          }
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="flex-1 space-y-1">
          {blockSeek && !previewUrl ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#4F46E5] transition-all duration-150"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : (
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={Math.min(currentTime, duration || 100)}
              disabled={!activeSrc || disabled}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-[#4F46E5]"
              aria-label={tr("Thanh tiến trình âm thanh", "Audio progress")}
            />
          )}
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 tabular-nums">
            <span>{formatSecondsMMSS(currentTime)}</span>
            <span className="inline-flex items-center gap-1">
              <Volume2 className="h-3 w-3" />
              {duration > 0 ? formatSecondsMMSS(duration) : "--:--"}
            </span>
          </div>
        </div>
      </div>

      {confirmLastPlay && (
        <div
          data-testid={`audio-last-play-confirm-${audio.id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {tr("Đây là lần nghe cuối cùng cho file này!", "This is your final play for this track!")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmLastPlay(false)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              {tr("Huỷ", "Cancel")}
            </button>
            <button
              type="button"
              data-testid={`audio-confirm-last-btn-${audio.id}`}
              onClick={() => void startFreshPlay()}
              className="rounded-md bg-[#F97316] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#EA580C]"
            >
              {tr("Phát ngay", "Play now")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
