"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HelpCircle, Loader2, MessageSquareReply, Send, UsersRound } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface DoubtDTO {
  id: string;
  fieldId: string;
  fieldLabel: string;
  question: string;
  teacherReply: string | null;
  mine: boolean;
  createdAt: string;
}

/** Q&A about graded questions (wrong ones first) + anonymous peer review, shown after results are revealed. */
export function StudentAssignmentExtras({
  assignmentId,
  fields,
  grades,
  peerReviewEnabled,
}: {
  assignmentId: string;
  fields: Array<{ id: string; label: string }>;
  grades: Record<string, { isCorrect: boolean | null }>;
  peerReviewEnabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <DoubtPanel assignmentId={assignmentId} fields={fields} grades={grades} />
      {peerReviewEnabled && <PeerReviewPanel assignmentId={assignmentId} />}
    </div>
  );
}

function DoubtPanel({
  assignmentId,
  fields,
  grades,
}: {
  assignmentId: string;
  fields: Array<{ id: string; label: string }>;
  grades: Record<string, { isCorrect: boolean | null }>;
}) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["doubts", assignmentId];
  const { data } = useQuery<{ doubts: DoubtDTO[] }>({ queryKey: key, queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/doubts`) });
  const ordered = useMemo(
    () => [...fields].sort((a, b) => Number(grades[a.id]?.isCorrect !== false) - Number(grades[b.id]?.isCorrect !== false)),
    [fields, grades]
  );
  const [fieldId, setFieldId] = useState("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const selected = fieldId || ordered[0]?.id || "";

  const send = async () => {
    setSending(true);
    try {
      await apiFetchJson(`/api/assignments/${assignmentId}/doubts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId: selected, question }),
      });
      setQuestion("");
      toast.success(tr("Đã gửi câu hỏi cho giáo viên", "Question sent to your teacher"));
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Gửi thất bại", "Could not send"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="stitch-card space-y-3 p-4" data-testid="doubt-panel">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
        <HelpCircle className="h-4 w-4 text-[#4F46E5]" /> {tr("Hỏi giáo viên về câu hỏi", "Ask about a question")}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {ordered.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFieldId(f.id)}
            className={cn(
              "min-h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold",
              selected === f.id ? "border-[#4F46E5] bg-[#4F46E5] text-white" : grades[f.id]?.isCorrect === false ? "border-rose-300 text-rose-600 dark:border-rose-800" : "border-slate-200 dark:border-slate-700"
            )}
            data-testid={`doubt-field-${f.label}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea rows={2} value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} placeholder={tr("Em chưa hiểu vì sao…", "I don't understand why…")} data-testid="doubt-input" />
        <Button onClick={() => void send()} disabled={sending || question.trim().length < 3 || !selected} data-testid="doubt-send" className="self-end">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {data && data.doubts.length > 0 && (
        <ul className="space-y-2">
          {data.doubts.map((d) => (
            <li key={d.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800" data-testid={`doubt-${d.id}`}>
              <p className="text-xs text-slate-500">
                {tr("Câu", "Q")} {d.fieldLabel} {d.mine ? `· ${tr("của bạn", "yours")}` : `· ${tr("bạn cùng lớp", "a classmate")}`}
              </p>
              <p className="font-medium">{d.question}</p>
              {d.teacherReply ? (
                <p className="mt-1 flex gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0" /> {d.teacherReply}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">{tr("Chờ giáo viên trả lời…", "Waiting for the teacher…")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PeerData {
  rubric: Array<{ id: string; title: string; maxPoints: number }>;
  reviews: Array<{
    id: string;
    label: string;
    submittedAt: string | null;
    comment: string | null;
    answers: Array<{ fieldId: string; label: string; prompt: string | null; value: string | null }>;
  }>;
  received: Array<{ label: string; comment: string | null; rubricScores: Record<string, number> | null }>;
}

function PeerReviewPanel({ assignmentId }: { assignmentId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["peer-reviews", assignmentId];
  const { data } = useQuery<PeerData>({ queryKey: key, queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/peer-reviews`) });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const submit = async (id: string) => {
    setBusy(id);
    try {
      await apiFetchJson(`/api/peer-reviews/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comments[id] ?? "", rubricScores: scores[id] ?? null }),
      });
      toast.success(tr("Đã gửi nhận xét", "Feedback sent"));
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Gửi thất bại", "Could not send"));
    } finally {
      setBusy(null);
    }
  };

  if (!data || (data.reviews.length === 0 && data.received.length === 0)) return null;
  return (
    <div className="stitch-card space-y-3 p-4" data-testid="peer-review-panel">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
        <UsersRound className="h-4 w-4 text-[#4F46E5]" /> {tr("Chấm chéo ẩn danh", "Anonymous peer review")}
      </h3>
      {data.reviews.map((r) => (
        <div key={r.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700" data-testid={`peer-task-${r.id}`}>
          <p className="text-sm font-semibold">{r.label}</p>
          {r.answers.map((a) => (
            <div key={a.fieldId} className="text-sm">
              <p className="text-xs text-slate-500">
                {tr("Câu", "Q")} {a.label}
              </p>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 dark:bg-slate-800">{a.value ?? tr("(bỏ trống)", "(blank)")}</p>
            </div>
          ))}
          {r.submittedAt ? (
            <p className="text-xs text-emerald-600">✓ {tr("Đã gửi", "Sent")}: {r.comment}</p>
          ) : (
            <>
              {data.rubric.map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  {c.title}
                  <Input
                    type="number"
                    min={0}
                    max={c.maxPoints}
                    step="0.5"
                    className="h-8 w-20"
                    onChange={(e) => setScores((prev) => ({ ...prev, [r.id]: { ...(prev[r.id] ?? {}), [c.id]: Number(e.target.value) || 0 } }))}
                  />
                </label>
              ))}
              <Textarea rows={2} placeholder={tr("Nhận xét mang tính xây dựng…", "Constructive feedback…")} value={comments[r.id] ?? ""} onChange={(e) => setComments((prev) => ({ ...prev, [r.id]: e.target.value }))} />
              <Button size="sm" onClick={() => void submit(r.id)} disabled={busy === r.id || !(comments[r.id]?.trim() || scores[r.id])} data-testid={`peer-send-${r.id}`}>
                {tr("Gửi nhận xét", "Send feedback")}
              </Button>
            </>
          )}
        </div>
      ))}
      {data.received.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">{tr("Nhận xét bạn nhận được", "Feedback you received")}</p>
          {data.received.map((f) => (
            <p key={f.label} className="rounded-lg bg-indigo-50 p-2 text-sm dark:bg-indigo-950">
              <b>{f.label}:</b> {f.comment}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
