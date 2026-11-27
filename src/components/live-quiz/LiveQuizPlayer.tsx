"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Flame, Loader2, Send, Trophy, XCircle } from "lucide-react";
import { ApiError, apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PromptText } from "@/components/worksheet/PromptText";
import {
  OPTION_COLORS,
  formatCorrectAnswer,
  useCountdown,
  useLiveQuizStream,
  type LiveQuizLeaderRow,
  type LiveQuizQuestionDTO,
  type LiveQuizSessionHeaderDTO,
} from "./useLiveQuizStream";

interface PlayerView {
  role: "PLAYER";
  session: LiveQuizSessionHeaderDTO;
  me: {
    participantId: string;
    displayName: string;
    totalScore: number;
    correctCount: number;
    streak: number;
    rank: number;
  };
  question: LiveQuizQuestionDTO | null;
  selfPacedQuestions: LiveQuizQuestionDTO[] | null;
  answeredIndexes: number[];
  myAnswer: { answered: true; isCorrect?: boolean; points?: number } | null;
  reveal: { correctAnswer: unknown } | null;
  leaderboard: LiveQuizLeaderRow[];
}

const storageKey = (pin: string) => `pivora:livequiz:${pin}`;

export function LiveQuizPlayer({ pin, signedInName }: { pin: string; signedInName: string | null }) {
  const { tr } = useI18n();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey(pin));
    if (saved) setSessionId(saved);
    setRestoring(false);
  }, [pin]);

  const join = async () => {
    setJoining(true);
    try {
      const res = await apiFetchJson<{ sessionId: string }>("/api/live-quiz/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, displayName: signedInName ? null : name }),
      });
      window.sessionStorage.setItem(storageKey(pin), res.sessionId);
      setSessionId(res.sessionId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Không tham gia được", "Could not join"));
    } finally {
      setJoining(false);
    }
  };

  const leave = () => {
    window.sessionStorage.removeItem(storageKey(pin));
    setSessionId(null);
  };

  if (restoring) return null;

  if (!sessionId) {
    return (
      <div className="stitch-card mx-auto w-full max-w-sm space-y-4 p-6" data-testid="live-join-form">
        <div className="text-center">
          <p className="text-sm text-slate-500">PIN</p>
          <p className="font-mono text-4xl font-black tracking-[0.2em] text-[#3525CD] dark:text-indigo-300">{pin}</p>
        </div>
        {signedInName ? (
          <p className="text-center text-slate-600 dark:text-slate-300">
            {tr("Tham gia với tên", "Joining as")} <span className="font-semibold">{signedInName}</span>
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="live-name">{tr("Tên hiển thị", "Display name")}</Label>
            <Input
              id="live-name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-lg"
              data-testid="live-name-input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) void join();
              }}
            />
          </div>
        )}
        <Button
          size="lg"
          className="h-14 w-full text-lg"
          onClick={() => void join()}
          disabled={joining || (!signedInName && !name.trim())}
          data-testid="live-join-button"
        >
          {joining && <Loader2 className="h-5 w-5 animate-spin" />}
          {tr("Vào chơi", "Join")}
        </Button>
      </div>
    );
  }

  return <PlayerGame sessionId={sessionId} onLost={leave} />;
}

function PlayerGame({ sessionId, onLost }: { sessionId: string; onLost: () => void }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["live-quiz", sessionId, "player"], [sessionId]);
  const { data, error } = useQuery<PlayerView>({
    queryKey,
    queryFn: () => apiFetchJson<PlayerView>(`/api/live-quiz/${sessionId}`),
    // Safety net when the SSE connection drops (mobile networks)
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) onLost();
  }, [error, onLost]);

  useLiveQuizStream(sessionId, (ev) => {
    if (ev.kind === "ANSWER_COUNT") return;
    void qc.invalidateQueries({ queryKey });
  });

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const { session, me } = data;
  return (
    <div className="mx-auto w-full max-w-md space-y-4" data-testid="live-player">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900">
        <span className="truncate font-semibold">{me.displayName}</span>
        <span className="flex items-center gap-3 text-sm">
          {me.streak >= 2 && (
            <span className="flex items-center gap-1 font-bold text-orange-500" data-testid="live-streak">
              <Flame className="h-4 w-4" /> {me.streak}
            </span>
          )}
          <span className="font-mono font-bold text-[#3525CD] dark:text-indigo-300" data-testid="live-my-score">{me.totalScore}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800" data-testid="live-my-rank">
            #{me.rank}
          </span>
        </span>
      </div>

      {session.status === "LOBBY" && (
        <div className="stitch-card space-y-2 p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-lg font-semibold">{tr("Bạn đã vào! Chờ giáo viên bắt đầu…", "You're in! Waiting for the host…")}</p>
          <p className="text-sm text-slate-500">{session.title}</p>
        </div>
      )}

      {session.mode === "SELF_PACED" && session.status === "QUESTION_OPEN" && data.selfPacedQuestions && (
        <SelfPacedPlay sessionId={sessionId} view={data} onAnswered={() => void qc.invalidateQueries({ queryKey })} />
      )}

      {session.mode === "HOST_PACED" && data.question && (
        <HostPacedQuestion sessionId={sessionId} view={data} onAnswered={() => void qc.invalidateQueries({ queryKey })} />
      )}

      {session.status === "FINISHED" && (
        <div className="stitch-card space-y-3 p-6 text-center" data-testid="live-final">
          <Trophy className="mx-auto h-10 w-10 text-amber-500" />
          <p className="text-2xl font-black">
            {tr("Hạng", "Rank")} #{me.rank}
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            {me.correctCount}/{session.questionCount} {tr("câu đúng", "correct")} · {me.totalScore} {tr("điểm", "pts")}
          </p>
        </div>
      )}

      {data.leaderboard.length > 0 && (session.status === "FINISHED" || session.status === "QUESTION_CLOSED") && (
        <ol className="stitch-card space-y-1 p-4">
          {data.leaderboard.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex justify-between rounded-lg px-3 py-2",
                r.id === me.participantId && "bg-indigo-50 font-semibold dark:bg-indigo-950"
              )}
            >
              <span>
                {r.rank}. {r.displayName}
              </span>
              <span className="font-mono">{r.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function useSubmit(sessionId: string, onAnswered: () => void) {
  const { tr } = useI18n();
  const [sending, setSending] = useState(false);
  const submit = async (questionIndex: number, answer: unknown) => {
    setSending(true);
    try {
      const res = await apiFetchJson<{ accepted: boolean; isCorrect?: boolean; points?: number }>(
        `/api/live-quiz/${sessionId}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIndex, answer }),
        }
      );
      onAnswered();
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Gửi câu trả lời thất bại", "Could not send the answer"));
      onAnswered();
      return null;
    } finally {
      setSending(false);
    }
  };
  return { submit, sending };
}

function AnswerInput({
  question,
  disabled,
  onSubmit,
}: {
  question: LiveQuizQuestionDTO;
  disabled: boolean;
  onSubmit: (answer: unknown) => void;
}) {
  const { tr } = useI18n();
  const [text, setText] = useState("");
  const [multi, setMulti] = useState<string[]>([]);

  useEffect(() => {
    setText("");
    setMulti([]);
  }, [question.id]);

  if (question.type === "MULTIPLE_CHOICE" && question.options) {
    return (
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {question.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => onSubmit(o.id)}
            data-testid={`live-option-${o.id}`}
            className={cn(
              "min-h-[64px] rounded-2xl px-4 py-3 text-left text-lg font-bold shadow-sm transition disabled:opacity-60",
              OPTION_COLORS[i % OPTION_COLORS.length]
            )}
          >
            {o.id}. <PromptText text={o.text} />
          </button>
        ))}
      </div>
    );
  }
  if (question.type === "TRUE_FALSE") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={disabled} onClick={() => onSubmit(true)} data-testid="live-option-true"
          className={cn("min-h-[72px] rounded-2xl text-xl font-bold disabled:opacity-60", OPTION_COLORS[3])}>
          {tr("Đúng", "True")}
        </button>
        <button type="button" disabled={disabled} onClick={() => onSubmit(false)} data-testid="live-option-false"
          className={cn("min-h-[72px] rounded-2xl text-xl font-bold disabled:opacity-60", OPTION_COLORS[0])}>
          {tr("Sai", "False")}
        </button>
      </div>
    );
  }
  if (question.type === "MULTI_SELECT" && question.options) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {question.options.map((o, i) => {
            const on = multi.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => setMulti((prev) => (on ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
                className={cn(
                  "min-h-[64px] rounded-2xl px-4 py-3 text-left text-lg font-bold transition",
                  OPTION_COLORS[i % OPTION_COLORS.length],
                  on ? "ring-4 ring-offset-2 ring-indigo-400 dark:ring-offset-slate-900" : "opacity-75"
                )}
              >
                {o.id}. <PromptText text={o.text} />
              </button>
            );
          })}
        </div>
        <Button size="lg" className="h-14 w-full" disabled={disabled || multi.length === 0} onClick={() => onSubmit(multi)}>
          <Send className="h-4 w-4" /> {tr("Gửi", "Submit")}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(question.type === "NUMBER" ? text.trim() : text);
      }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        inputMode={question.type === "NUMBER" ? "decimal" : "text"}
        maxLength={500}
        className="h-14 text-lg"
        data-testid="live-text-input"
        disabled={disabled}
      />
      <Button type="submit" size="lg" className="h-14 w-full" disabled={disabled || !text.trim()} data-testid="live-text-submit">
        <Send className="h-4 w-4" /> {tr("Gửi", "Submit")}
      </Button>
    </form>
  );
}

function HostPacedQuestion({ sessionId, view, onAnswered }: { sessionId: string; view: PlayerView; onAnswered: () => void }) {
  const { tr } = useI18n();
  const { session } = view;
  const q = view.question!;
  const isOpen = session.status === "QUESTION_OPEN";
  const remaining = useCountdown(session.questionStartedAt, q.timeLimitSec, session.serverNow, isOpen);
  const { submit, sending } = useSubmit(sessionId, onAnswered);
  const answered = Boolean(view.myAnswer);
  const correctText = view.reveal ? formatCorrectAnswer(q, view.reveal.correctAnswer, tr) : null;

  return (
    <div className="space-y-4">
      <div className="stitch-card space-y-3 p-5">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {tr("Câu", "Question")} {session.currentIndex + 1}/{session.questionCount}
          </span>
          {isOpen && <span className="font-mono text-lg font-bold text-[#3525CD] dark:text-indigo-300">{remaining}s</span>}
        </div>
        <p className="text-xl font-bold leading-snug">
          <PromptText text={q.prompt} />
        </p>
      </div>

      {isOpen && !answered && <AnswerInput question={q} disabled={sending || remaining <= 0} onSubmit={(a) => void submit(session.currentIndex, a)} />}

      {isOpen && answered && (
        <div className="stitch-card p-6 text-center" data-testid="live-answer-sent">
          <CheckCircle2 className="mx-auto h-8 w-8 text-indigo-500" />
          <p className="mt-2 font-semibold">{tr("Đã gửi! Chờ giáo viên công bố đáp án…", "Answer sent! Waiting for the reveal…")}</p>
        </div>
      )}

      {session.status === "QUESTION_CLOSED" && (
        <div
          className={cn(
            "rounded-2xl p-6 text-center text-white",
            view.myAnswer?.isCorrect ? "bg-emerald-500" : "bg-rose-500"
          )}
          data-testid="live-feedback"
        >
          {view.myAnswer?.isCorrect ? <CheckCircle2 className="mx-auto h-10 w-10" /> : <XCircle className="mx-auto h-10 w-10" />}
          <p className="mt-2 text-2xl font-black">
            {view.myAnswer ? (view.myAnswer.isCorrect ? tr("Chính xác!", "Correct!") : tr("Chưa đúng", "Incorrect")) : tr("Hết giờ", "Time's up")}
          </p>
          {view.myAnswer?.isCorrect && <p className="text-lg">+{view.myAnswer.points}</p>}
          {correctText && !view.myAnswer?.isCorrect && (
            <p className="mt-1 text-sm opacity-90">
              {tr("Đáp án", "Answer")}: {correctText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SelfPacedPlay({ sessionId, view, onAnswered }: { sessionId: string; view: PlayerView; onAnswered: () => void }) {
  const { tr } = useI18n();
  const questions = view.selfPacedQuestions ?? [];
  const answered = new Set(view.answeredIndexes);
  const nextIndex = questions.findIndex((_, i) => !answered.has(i));
  const [last, setLast] = useState<{ isCorrect?: boolean; points?: number } | null>(null);
  const { submit, sending } = useSubmit(sessionId, onAnswered);

  if (nextIndex === -1) {
    return (
      <div className="stitch-card p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
        <p className="mt-2 font-semibold">{tr("Bạn đã làm xong! Chờ giáo viên kết thúc…", "All done! Waiting for the host to finish…")}</p>
      </div>
    );
  }
  const q = questions[nextIndex]!;
  return (
    <div className="space-y-4">
      {last && (
        <div className={cn("rounded-xl px-4 py-2 text-center font-semibold text-white", last.isCorrect ? "bg-emerald-500" : "bg-rose-500")} data-testid="live-feedback">
          {last.isCorrect ? `${tr("Chính xác!", "Correct!")} +${last.points ?? 0}` : tr("Chưa đúng", "Incorrect")}
        </div>
      )}
      <div className="stitch-card space-y-2 p-5">
        <p className="text-sm text-slate-500">
          {tr("Câu", "Question")} {nextIndex + 1}/{questions.length}
        </p>
        <p className="text-xl font-bold leading-snug">
          <PromptText text={q.prompt} />
        </p>
      </div>
      <AnswerInput
        question={q}
        disabled={sending}
        onSubmit={async (a) => {
          const res = await submit(nextIndex, a);
          if (res) setLast({ isCorrect: res.isCorrect, points: res.points });
        }}
      />
    </div>
  );
}
