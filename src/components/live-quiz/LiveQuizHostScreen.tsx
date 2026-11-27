"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Flag,
  Loader2,
  Lock,
  Play,
  Table2,
  Trophy,
  Users,
} from "lucide-react";
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
import { PromptText } from "@/components/worksheet/PromptText";
import {
  OPTION_BAR_COLORS,
  formatCorrectAnswer,
  useCountdown,
  useLiveQuizStream,
  type LiveQuizLeaderRow,
  type LiveQuizQuestionDTO,
  type LiveQuizSessionHeaderDTO,
} from "./useLiveQuizStream";

interface HostView {
  role: "HOST";
  session: LiveQuizSessionHeaderDTO;
  participantCount: number;
  answerCount: number;
  participants: Array<{ id: string; displayName: string }>;
  question: LiveQuizQuestionDTO | null;
  reveal: {
    correctAnswer: unknown;
    distribution: {
      total: number;
      correctCount: number;
      buckets: Array<{ key: string; label: string; count: number }>;
    };
  } | null;
  leaderboard: LiveQuizLeaderRow[];
}

export function LiveQuizHostScreen({ sessionId }: { sessionId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const queryKey = ["live-quiz", sessionId, "host"];
  const { data, isLoading, error } = useQuery<HostView>({
    queryKey,
    queryFn: () => apiFetchJson<HostView>(`/api/live-quiz/${sessionId}`),
  });
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState("");
  const [exportMax, setExportMax] = useState("10");
  const [exporting, setExporting] = useState(false);
  const [liveAnswerCount, setLiveAnswerCount] = useState<number | null>(null);

  useLiveQuizStream(sessionId, (ev) => {
    if (ev.kind === "ANSWER_COUNT" && typeof ev.answerCount === "number") {
      setLiveAnswerCount(ev.answerCount);
      return;
    }
    setLiveAnswerCount(null);
    void qc.invalidateQueries({ queryKey });
  });

  const session = data?.session;
  const joinUrl =
    typeof window !== "undefined" && session ? `${window.location.origin}/live/${session.pinCode}` : "";

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 320 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl]);

  const isOpen = session?.status === "QUESTION_OPEN";
  const remaining = useCountdown(
    session?.questionStartedAt ?? null,
    data?.question?.timeLimitSec ?? session?.questionLimitSec ?? 30,
    session?.serverNow ?? null,
    Boolean(isOpen && session?.mode === "HOST_PACED")
  );
  const answerCount = liveAnswerCount ?? data?.answerCount ?? 0;

  const control = async (action: "OPEN" | "CLOSE" | "NEXT" | "FINISH", silent = false) => {
    setBusy(true);
    try {
      await apiFetchJson(`/api/live-quiz/${sessionId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setLiveAnswerCount(null);
      await qc.invalidateQueries({ queryKey });
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
      await qc.invalidateQueries({ queryKey });
    } finally {
      setBusy(false);
    }
  };

  // Auto-close the question when the countdown hits 0 or everybody has answered (once per question).
  const autoClosedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.status !== "QUESTION_OPEN" || session.mode !== "HOST_PACED") return;
    const key = `${session.currentIndex}:${session.questionStartedAt}`;
    if (autoClosedFor.current === key) return;
    const everyone = data && data.participantCount > 0 && answerCount >= data.participantCount;
    if (remaining <= 0 || everyone) {
      autoClosedFor.current = key;
      void control("CLOSE", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- control is stable enough for this guard
  }, [remaining, answerCount, session?.status, session?.currentIndex]);

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetchJson<{ exportedCount: number }>(`/api/live-quiz/${sessionId}/export-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnTitle: exportTitle || null, maxScore: Number(exportMax) || 10 }),
      });
      toast.success(
        tr(`Đã chuyển điểm của ${res.exportedCount} học sinh sang Sổ điểm`, `Exported ${res.exportedCount} students to the gradebook`)
      );
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !data || !session) {
    return (
      <div className="stitch-card p-8 text-center text-slate-600 dark:text-slate-300">
        {error instanceof Error ? error.message : tr("Không tải được phiên Live Quiz.", "Could not load the Live Quiz.")}
      </div>
    );
  }

  const q = data.question;
  const maxBucket = Math.max(1, ...(data.reveal?.distribution.buckets.map((b) => b.count) ?? [1]));
  const correctText = q && data.reveal ? formatCorrectAnswer(q, data.reveal.correctAnswer, tr) : null;
  const correctKey = (data.reveal?.correctAnswer as { correct?: unknown } | null)?.correct;
  const isCorrectBucket = (key: string) =>
    Array.isArray(correctKey) ? correctKey.includes(key) : String(correctKey) === key;

  return (
    <div className="space-y-5" data-testid="live-quiz-host">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={session.classId ? `/teacher/classes/${session.classId}` : "/teacher/worksheets"}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" /> {tr("Quay lại", "Back")}
          </Link>
          <h1 className="truncate text-2xl font-bold text-[#0B1C30] dark:text-slate-100">{session.title}</h1>
          <p className="text-sm text-slate-500">
            {session.isExitTicket ? tr("Hỏi nhanh (Exit Ticket)", "Exit Ticket") : "Live Quiz"} ·{" "}
            {session.mode === "SELF_PACED" ? tr("HS tự làm theo tốc độ riêng", "Self-paced") : tr("GV điều khiển", "Host-paced")}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
          <Users className="h-5 w-5 text-slate-500" />
          <span className="text-xl font-bold" data-testid="live-participant-count">{data.participantCount}</span>
        </div>
      </div>

      {session.status === "LOBBY" && (
        <div className="stitch-card grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-3 text-center md:text-left">
            <p className="text-lg text-slate-600 dark:text-slate-300">
              {tr("Vào", "Go to")} <span className="font-semibold">{joinUrl.replace(/\/live\/.*/, "/live")}</span>{" "}
              {tr("và nhập mã PIN", "and enter the PIN")}
            </p>
            <p className="font-mono text-6xl font-black tracking-[0.2em] text-[#3525CD] dark:text-indigo-300 sm:text-7xl" data-testid="live-pin">
              {session.pinCode}
            </p>
            <div className="flex flex-wrap justify-center gap-2 md:justify-start">
              {data.participants.map((p) => (
                <span key={p.id} className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                  {p.displayName}
                </span>
              ))}
              {data.participants.length === 0 && (
                <span className="text-sm text-slate-500">{tr("Đang chờ học sinh tham gia…", "Waiting for players…")}</span>
              )}
            </div>
            <Button size="lg" onClick={() => void control("OPEN")} disabled={busy} data-testid="live-start">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {tr("Bắt đầu", "Start")}
            </Button>
          </div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL QR code
            <img src={qr} alt={tr("Mã QR tham gia", "Join QR code")} className="mx-auto h-56 w-56 rounded-xl bg-white p-2 sm:h-64 sm:w-64" />
          )}
        </div>
      )}

      {session.status !== "LOBBY" && session.status !== "FINISHED" && session.mode === "SELF_PACED" && (
        <div className="stitch-card space-y-4 p-6 text-center">
          <p className="text-lg text-slate-600 dark:text-slate-300">
            {tr("Học sinh đang tự làm", "Players are working at their own pace")} · PIN{" "}
            <span className="font-mono font-bold">{session.pinCode}</span>
          </p>
          <Button variant="destructive" onClick={() => void control("FINISH")} disabled={busy}>
            <Flag className="h-4 w-4" /> {tr("Kết thúc & xem bảng xếp hạng", "Finish & show leaderboard")}
          </Button>
        </div>
      )}

      {q && session.mode === "HOST_PACED" && session.status !== "FINISHED" && (
        <div className="stitch-card space-y-5 p-5 sm:p-8">
          <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
            <span>
              {tr("Câu", "Question")} {session.currentIndex + 1}/{session.questionCount}
            </span>
            {isOpen ? (
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black text-white",
                  remaining <= 5 ? "bg-rose-500" : "bg-[#4F46E5]"
                )}
                data-testid="live-countdown"
              >
                {remaining}
              </span>
            ) : (
              <Lock className="h-5 w-5" />
            )}
            <span data-testid="live-answer-count">
              {answerCount}/{data.participantCount} {tr("đã trả lời", "answered")}
            </span>
          </div>
          <p className="text-center text-2xl font-bold leading-snug text-[#0B1C30] dark:text-slate-100 sm:text-4xl">
            <PromptText text={q.prompt} />
          </p>

          {data.reveal ? (
            <div className="space-y-3" data-testid="live-distribution">
              {correctText && (
                <p className="flex items-center justify-center gap-2 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" /> {tr("Đáp án", "Answer")}: {correctText}
                </p>
              )}
              <div className="flex h-56 items-end justify-center gap-3 sm:gap-6">
                {data.reveal.distribution.buckets.map((b, i) => (
                  <div key={b.key} className="flex w-16 flex-col items-center gap-1 sm:w-24">
                    <span className="text-lg font-bold">{b.count}</span>
                    <div
                      className={cn(
                        "w-full rounded-t-lg transition-all",
                        OPTION_BAR_COLORS[i % OPTION_BAR_COLORS.length],
                        isCorrectBucket(b.key) ? "ring-4 ring-emerald-400" : "opacity-80"
                      )}
                      style={{ height: `${Math.max(6, (b.count / maxBucket) * 170)}px` }}
                    />
                    <span className="line-clamp-2 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                      {q.options ? b.key : b.label === "true" ? tr("Đúng", "True") : b.label === "false" ? tr("Sai", "False") : b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            q.options && (
              <div className="grid gap-3 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <div
                    key={o.id}
                    className={cn("rounded-xl px-4 py-4 text-lg font-semibold text-white", OPTION_BAR_COLORS[i % OPTION_BAR_COLORS.length])}
                  >
                    {o.id}. <PromptText text={o.text} />
                  </div>
                ))}
              </div>
            )
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {isOpen && (
              <Button onClick={() => void control("CLOSE")} disabled={busy} data-testid="live-close">
                <Lock className="h-4 w-4" /> {tr("Đóng câu & xem kết quả", "Close & reveal")}
              </Button>
            )}
            {session.status === "QUESTION_CLOSED" && (
              <Button onClick={() => void control("NEXT")} disabled={busy} data-testid="live-next">
                <ArrowRight className="h-4 w-4" />
                {session.currentIndex + 1 >= session.questionCount ? tr("Xem kết quả cuối", "Final results") : tr("Câu tiếp theo", "Next question")}
              </Button>
            )}
            <Button variant="outline" onClick={() => void control("FINISH")} disabled={busy}>
              <Flag className="h-4 w-4" /> {tr("Kết thúc", "End")}
            </Button>
          </div>
        </div>
      )}

      {data.leaderboard.length > 0 && (
        <div className="stitch-card space-y-3 p-5" data-testid="live-leaderboard">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="h-5 w-5 text-amber-500" /> {tr("Bảng xếp hạng", "Leaderboard")}
          </h2>
          <ol className="space-y-2">
            {data.leaderboard.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-lg dark:bg-slate-800">
                <span className="flex items-center gap-3">
                  <span className="w-6 font-black text-slate-400">{r.rank}</span>
                  <span className="font-semibold">{r.displayName}</span>
                </span>
                <span className="font-mono font-bold text-[#3525CD] dark:text-indigo-300">{r.totalScore}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {session.status === "FINISHED" && session.classId && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setExportOpen(true)} data-testid="live-export-open">
            <Table2 className="h-4 w-4" /> {tr("Chuyển điểm sang Sổ điểm", "Send scores to gradebook")}
          </Button>
        </div>
      )}

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Chuyển điểm sang Sổ điểm", "Send scores to gradebook")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Tạo một cột điểm giấy mới: điểm = tỉ lệ câu đúng × thang điểm. Khách không đăng nhập sẽ bị bỏ qua.",
                "Creates a new offline grade column: score = correct ratio × max score. Guests are skipped."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lq-export-title">{tr("Tên cột", "Column title")}</Label>
              <Input id="lq-export-title" value={exportTitle} placeholder={`Live Quiz: ${session.title}`} onChange={(e) => setExportTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lq-export-max">{tr("Thang điểm", "Max score")}</Label>
              <Input id="lq-export-max" type="number" min={1} max={1000} value={exportMax} onChange={(e) => setExportMax(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>{tr("Huỷ", "Cancel")}</Button>
            <Button onClick={() => void doExport()} disabled={exporting} data-testid="live-export-confirm">
              {exporting && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Chuyển điểm", "Export")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
