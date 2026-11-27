"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Trash2, XCircle } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MathText } from "@/components/worksheet/MathText";

interface StudentCheckpoint {
  id: string;
  timestampSec: number;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "TEXT";
  prompt: string;
  options: Array<{ id: string; text: string }> | null;
  answered: boolean;
  isCorrect: boolean | null;
}

interface StudentVideoState {
  checkpoints: StudentCheckpoint[];
  progress: { maxWatchedSec: number; durationSec: number; completed: boolean };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Student video player: pauses at each checkpoint for a question, prevents skipping past the
 * furthest point already watched (first viewing), and reports progress every 5 s.
 */
export function InteractiveVideoPlayer({ itemId, src }: { itemId: string; src: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["video-progress", itemId];
  const { data } = useQuery<StudentVideoState>({ queryKey: key, queryFn: () => apiFetchJson(`/api/lessons/items/${itemId}/video-progress`) });
  const ref = useRef<HTMLVideoElement | null>(null);
  const maxRef = useRef(0);
  const [active, setActive] = useState<StudentCheckpoint | null>(null);
  const [answer, setAnswer] = useState<string>("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (data) maxRef.current = Math.max(maxRef.current, data.progress.maxWatchedSec);
  }, [data]);

  const heartbeat = useCallback(async () => {
    const v = ref.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const res = await apiFetchJson<{ maxWatchedSec: number; completed: boolean }>(`/api/lessons/items/${itemId}/video-progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "HEARTBEAT", currentSec: v.currentTime, durationSec: v.duration }),
    }).catch(() => null);
    if (res) maxRef.current = Math.max(maxRef.current, res.maxWatchedSec);
  }, [itemId]);

  useEffect(() => {
    const t = setInterval(() => {
      if (ref.current && !ref.current.paused) void heartbeat();
    }, 5000);
    return () => clearInterval(t);
  }, [heartbeat]);

  const onTimeUpdate = () => {
    const v = ref.current;
    if (!v || !data) return;
    if (!data.progress.completed && v.currentTime > maxRef.current + 6) {
      v.currentTime = maxRef.current; // no skipping ahead on the first viewing
      toast.info(tr("Hãy xem hết đoạn trước khi tua tiếp.", "Watch this part before skipping ahead."));
      return;
    }
    maxRef.current = Math.max(maxRef.current, Math.min(v.currentTime, maxRef.current + 6));
    const due = data.checkpoints.find((c) => !c.answered && v.currentTime >= c.timestampSec);
    if (due && !active) {
      v.pause();
      void heartbeat();
      setActive(due);
      setAnswer("");
      setFeedback(null);
    }
  };

  const submit = async () => {
    if (!active) return;
    setSending(true);
    try {
      const value = active.type === "TRUE_FALSE" ? answer === "true" : answer;
      const res = await apiFetchJson<{ isCorrect: boolean }>(`/api/lessons/items/${itemId}/video-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "ANSWER", checkpointId: active.id, answer: value }),
      });
      setFeedback(res.isCorrect);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Gửi thất bại", "Could not send"));
    } finally {
      setSending(false);
    }
  };

  const watchedPct = data && data.progress.durationSec > 0 ? Math.min(100, Math.round((data.progress.maxWatchedSec / data.progress.durationSec) * 100)) : 0;

  return (
    <div className="space-y-2" data-testid={`interactive-video-${itemId}`}>
      <video ref={ref} controls src={src} onTimeUpdate={onTimeUpdate} onPause={() => void heartbeat()} className="max-h-80 w-full max-w-2xl rounded-xl bg-black" />
      {data && data.checkpoints.length > 0 && (
        <p className="text-xs text-slate-500">
          {tr("Câu hỏi trong video", "In-video questions")}: {data.checkpoints.filter((c) => c.answered).length}/{data.checkpoints.length} ·{" "}
          {tr("Đã xem", "Watched")} {watchedPct}%{data.progress.completed && ` · ${tr("Hoàn thành", "Completed")} ✓`}
        </p>
      )}
      <Dialog open={Boolean(active)} onOpenChange={() => undefined}>
        <DialogContent className="max-w-md" data-testid="video-checkpoint-dialog">
          <DialogHeader>
            <DialogTitle>
              {tr("Câu hỏi tại", "Question at")} {active ? fmt(active.timestampSec) : ""}
            </DialogTitle>
            <DialogDescription>{tr("Trả lời để xem tiếp.", "Answer to keep watching.")}</DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <p className="font-semibold">
                <MathText text={active.prompt} />
              </p>
              {active.type === "MULTIPLE_CHOICE" && active.options ? (
                <div className="grid gap-2">
                  {active.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={feedback !== null}
                      onClick={() => setAnswer(o.id)}
                      className={cn("min-h-11 rounded-xl border px-3 text-left text-sm", answer === o.id ? "border-[#4F46E5] bg-[#EEF2FF] dark:bg-indigo-950" : "border-slate-200 dark:border-slate-700")}
                      data-testid={`checkpoint-option-${o.id}`}
                    >
                      <b>{o.id}.</b> <MathText text={o.text} />
                    </button>
                  ))}
                </div>
              ) : active.type === "TRUE_FALSE" ? (
                <div className="grid grid-cols-2 gap-2">
                  {["true", "false"].map((v) => (
                    <button key={v} type="button" disabled={feedback !== null} onClick={() => setAnswer(v)} className={cn("min-h-11 rounded-xl border font-semibold", answer === v ? "border-[#4F46E5] bg-[#EEF2FF] dark:bg-indigo-950" : "border-slate-200 dark:border-slate-700")}>
                      {v === "true" ? tr("Đúng", "True") : tr("Sai", "False")}
                    </button>
                  ))}
                </div>
              ) : (
                <Input value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={feedback !== null} />
              )}
              {feedback !== null && (
                <p className={cn("flex items-center gap-1.5 font-semibold", feedback ? "text-emerald-600" : "text-rose-600")} data-testid="checkpoint-feedback">
                  {feedback ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {feedback ? tr("Chính xác!", "Correct!") : tr("Chưa đúng", "Not quite")}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            {feedback === null ? (
              <Button onClick={() => void submit()} disabled={sending || !answer} data-testid="checkpoint-submit">
                {sending && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Trả lời", "Answer")}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setActive(null);
                  void ref.current?.play().catch(() => undefined);
                }}
                data-testid="checkpoint-continue"
              >
                {tr("Xem tiếp", "Continue")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface OwnerCheckpoint {
  id: string;
  timestampSec: number;
  type: string;
  prompt: string;
  answerKey: unknown;
}

/** Teacher dialog: add / remove in-video questions and see each student's watch progress. */
export function VideoCheckpointEditor({ itemId, open, onOpenChange }: { itemId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["video-checkpoints", itemId];
  const { data } = useQuery<{ checkpoints: OwnerCheckpoint[]; progress: Array<{ student: { id: string; name: string }; watchedPct: number; completed: boolean }> }>({
    queryKey: key,
    enabled: open,
    queryFn: () => apiFetchJson(`/api/lessons/items/${itemId}/checkpoints`),
  });
  const [time, setTime] = useState("0:30");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const [m, s] = time.split(":").map((x) => Number(x));
    const sec = time.includes(":") ? (m ?? 0) * 60 + (s ?? 0) : Number(time);
    const opts = options.map((t, i) => ({ id: String.fromCharCode(65 + i), text: t.trim() })).filter((o) => o.text);
    setSaving(true);
    try {
      await apiFetchJson(`/api/lessons/items/${itemId}/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestampSec: sec, type: "MULTIPLE_CHOICE", prompt, options: opts, answerKey: { correct: String.fromCharCode(65 + correct) } }),
      });
      setPrompt("");
      setOptions(["", "", "", ""]);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await apiFetchJson(`/api/lessons/items/${itemId}/checkpoints?checkpointId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: key });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="video-checkpoint-editor">
        <DialogHeader>
          <DialogTitle>{tr("Câu hỏi trong video", "In-video questions")}</DialogTitle>
          <DialogDescription>{tr("Video tự dừng ở mốc thời gian và hỏi học sinh.", "The video pauses at each time and asks students.")}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {data?.checkpoints.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="min-w-0 truncate">
                <b className="font-mono">{fmt(c.timestampSec)}</b> {c.prompt}
              </span>
              <button type="button" onClick={() => void remove(c.id)} className="rounded p-1.5 text-slate-400 hover:text-red-600" aria-label={tr("Xoá", "Delete")}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex gap-2">
            <div className="w-24 space-y-1">
              <Label htmlFor="cp-time" className="text-xs">{tr("Mốc (m:ss)", "Time (m:ss)")}</Label>
              <Input id="cp-time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="cp-prompt" className="text-xs">{tr("Câu hỏi", "Question")}</Label>
              <Input id="cp-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
          </div>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="cp-correct" checked={correct === i} onChange={() => setCorrect(i)} className="h-4 w-4" aria-label={`${String.fromCharCode(65 + i)}`} />
              <span className="w-4 text-xs font-bold">{String.fromCharCode(65 + i)}</span>
              <Input value={o} onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))} className="h-9" />
            </div>
          ))}
          <Button size="sm" onClick={() => void add()} disabled={saving || !prompt.trim() || options.filter((x) => x.trim()).length < 2}>
            <Plus className="h-4 w-4" /> {tr("Thêm câu hỏi", "Add question")}
          </Button>
        </div>
        {data && data.progress.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr("Tiến độ xem của học sinh", "Student watch progress")}</p>
            {data.progress.map((p) => (
              <div key={p.student.id} className="flex items-center justify-between text-xs">
                <span>{p.student.name}</span>
                <span className="font-mono">
                  {p.watchedPct}% {p.completed && "✓"}
                </span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("Đóng", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
