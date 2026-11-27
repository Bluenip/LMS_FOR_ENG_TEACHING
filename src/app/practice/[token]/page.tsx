"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { FieldType, WorksheetSubject } from "@prisma/client";
import type { AnswerValue, FieldOptionsValue, GradeResult } from "@/lib/grading/types";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PromptText } from "@/components/worksheet/PromptText";
import { SubjectBadge } from "@/components/worksheet/SubjectPicker";
import {
  InteractiveQuestionInput,
  isInteractiveFieldType,
} from "@/components/worksheet/interactive/InteractiveQuestionInput";

interface PublicPracticePayload {
  practice: {
    id: string;
    title: string;
    timeLimitMin: number | null;
    class: { name: string };
    worksheet: {
      id: string;
      title: string;
      subject: WorksheetSubject;
      instructions: string | null;
      passages: Array<{ id: string; title: string; content: string }> | null;
      pageCount: number;
      pages: Array<{ pageIndex: number; imageKey: string | null }>;
      fields: Array<{
        id: string;
        type: FieldType;
        label: string;
        prompt: string | null;
        points: number;
        options: FieldOptionsValue | null;
        imageKey: string | null;
      }>;
    };
  };
}

interface SubmitResult {
  result: {
    attemptId: string;
    guestName: string;
    autoScore: number;
    maxScore: number;
    submittedAt: string;
    hasManualFields: boolean;
    fieldResults: Record<string, GradeResult>;
  };
}

function asOptions(options: unknown): Array<{ id: string; text: string }> {
  if (!Array.isArray(options)) return [];
  return options
    .filter((o): o is { id: string; text: string } => Boolean(o && typeof o === "object" && "id" in o))
    .map((o) => ({ id: String(o.id), text: String((o as { text?: unknown }).text ?? "") }));
}

export default function PublicPracticePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { tr } = useI18n();

  const [guestName, setGuestName] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitResult["result"] | null>(null);

  const { data, isLoading, error } = useQuery<PublicPracticePayload>({
    queryKey: ["public-practice", token],
    queryFn: () =>
      apiFetchJson<PublicPracticePayload>(
        `/api/public/practice/${encodeURIComponent(token)}`,
        undefined,
        tr("Liên kết luyện tập không tồn tại hoặc đã bị tắt", "Practice link not found or disabled")
      ),
  });

  const setAnswer = (fieldId: string, val: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      toast.error(tr("Vui lòng nhập họ tên của bạn", "Please enter your name"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = await apiFetchJson<SubmitResult>(
        `/api/public/practice/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestName: guestName.trim(),
            answers: Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value })),
          }),
        }
      );
      setSubmitted(payload.result);
      toast.success(tr("Đã nộp bài luyện tập!", "Practice submitted!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Nộp bài thất bại", "Submission failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl stitch-card p-12 text-center text-sm text-slate-400">
          {tr("Đang tải bài luyện tập…", "Loading practice worksheet…")}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-xl stitch-card p-10 text-center space-y-4">
          <XCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="text-lg font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Liên kết không khả dụng", "Practice link unavailable")}
          </h1>
          <p className="text-sm text-slate-500">
            {tr(
              "Liên kết luyện tập không tồn tại hoặc đã bị giáo viên tắt.",
              "This practice link does not exist or has been disabled by the teacher."
            )}
          </p>
          <Button asChild variant="outline">
            <Link href="/login">{tr("Về trang đăng nhập Pivora", "Go to Pivora Login")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { practice } = data;
  const ws = practice.worksheet;

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-6 px-4 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="stitch-card p-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
              <Sparkles className="h-4 w-4" /> Pivora Guest Practice
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SubjectBadge subject={ws.subject} />
              {practice.timeLimitMin && (
                <Badge variant="neutral">
                  <Clock className="h-3 w-3" /> {practice.timeLimitMin} {tr("phút", "min")}
                </Badge>
              )}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[#0B1C30] dark:text-slate-100">{practice.title}</h1>
          <p className="text-xs text-slate-500">
            {ws.title} • {ws.fields.length} {tr("câu hỏi", "questions")}
          </p>
          {ws.instructions && (
            <div className="rounded-xl bg-[#EEF2FF]/70 p-3 text-xs text-[#0B1C30] dark:bg-slate-800 dark:text-slate-200">
              {ws.instructions}
            </div>
          )}
        </header>

        {submitted && (
          <div
            data-testid="public-practice-score-card"
            className="stitch-card border-2 border-emerald-200 bg-emerald-50/70 p-5 space-y-3 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                <div>
                  <h2 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
                    {tr("Kết quả luyện tập:", "Practice result:")} {submitted.guestName}
                  </h2>
                  {submitted.hasManualFields && (
                    <p className="text-xs text-amber-700">
                      {tr(
                        "Điểm hiển thị tính phần tự động; câu tự luận không chấm tự động.",
                        "Score covers auto-graded items; open essay prompts are not auto-scored."
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 tabular-nums">
                {submitted.autoScore} / {submitted.maxScore}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[40px]"
              onClick={() => {
                setSubmitted(null);
                setAnswers({});
              }}
            >
              <RotateCcw className="h-4 w-4" />
              {tr("Làm lại", "Try again")}
            </Button>
          </div>
        )}

        {Array.isArray(ws.passages) && ws.passages.length > 0 && (
          <div className="space-y-3">
            {ws.passages.map((p) => (
              <div key={p.id} className="stitch-card p-5 space-y-2">
                <h2 className="text-sm font-bold text-[#3525CD]">{p.title}</h2>
                <PromptText text={p.content} className="text-sm leading-relaxed text-[#0B1C30] dark:text-slate-200" />
              </div>
            ))}
          </div>
        )}

        {ws.pages.some((p) => p.imageKey) && (
          <div className="space-y-3">
            {ws.pages.map((p) =>
              p.imageKey ? (
                <div key={p.pageIndex} className="stitch-card overflow-hidden p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/public/practice/${encodeURIComponent(token)}/file?key=${encodeURIComponent(p.imageKey)}`}
                    alt={`Page ${p.pageIndex + 1}`}
                    className="w-full rounded-xl"
                  />
                </div>
              ) : null
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="stitch-card p-5 space-y-2">
            <Label htmlFor="guest-name" className="text-sm font-semibold">
              {tr("Họ và tên của bạn", "Your full name")} <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="guest-name"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              disabled={Boolean(submitted)}
              placeholder={tr("VD: Nguyễn Văn An", "e.g., Alex Nguyen")}
              data-testid="public-practice-guest-name"
            />
          </div>

          {ws.fields.map((field, idx) => {
            const val = answers[field.id];
            const res = submitted?.fieldResults?.[field.id];
            const opts = asOptions(field.options);

            return (
              <div
                key={field.id}
                data-testid={`public-question-${field.id}`}
                className={cn(
                  "stitch-card p-5 space-y-3",
                  res?.isCorrect === true && "border-emerald-300 bg-emerald-50/40",
                  res?.isCorrect === false && "border-rose-300 bg-rose-50/40"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#3525CD]">
                    {tr("Câu", "Question")} {field.label || idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{field.points} {tr("điểm", "pts")}</Badge>
                    {res && res.score !== null && (
                      <Badge variant={res.isCorrect ? "mint" : "danger"}>
                        {res.score}/{field.points}
                      </Badge>
                    )}
                  </div>
                </div>

                {field.prompt && (
                  <PromptText text={field.prompt} className="text-sm text-[#0B1C30] dark:text-slate-100" />
                )}

                {field.imageKey && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/public/practice/${encodeURIComponent(token)}/file?key=${encodeURIComponent(field.imageKey)}`}
                    alt={field.label}
                    className="max-h-72 rounded-xl border border-slate-200"
                  />
                )}

                {isInteractiveFieldType(field.type) ? (
                  <InteractiveQuestionInput
                    fieldId={field.id}
                    type={field.type}
                    options={field.options}
                    value={val}
                    onChange={(next) => setAnswer(field.id, next)}
                    disabled={Boolean(submitted)}
                  />
                ) : field.type === "MULTIPLE_CHOICE" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {opts.map((opt) => {
                      const selected = val === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={Boolean(submitted)}
                          onClick={() => setAnswer(field.id, opt.id)}
                          data-testid={`public-mc-${field.id}-${opt.id}`}
                          className={cn(
                            "flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                            selected
                              ? "border-[#4F46E5] bg-[#EEF2FF] font-semibold text-[#3525CD]"
                              : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                          )}
                        >
                          <span className="font-bold">{opt.id}.</span>
                          <span>{opt.text}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : field.type === "MULTI_SELECT" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {opts.map((opt) => {
                      const arr = Array.isArray(val) ? (val as string[]) : [];
                      const checked = arr.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={Boolean(submitted)}
                          onClick={() =>
                            setAnswer(
                              field.id,
                              checked ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]
                            )
                          }
                          className={cn(
                            "flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                            checked
                              ? "border-[#4F46E5] bg-[#EEF2FF] font-semibold text-[#3525CD]"
                              : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                          )}
                        >
                          <span className="font-bold">{opt.id}.</span>
                          <span>{opt.text}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : field.type === "TRUE_FALSE" ? (
                  <div className="flex gap-2">
                    {[
                      { v: true, label: tr("Đúng (True)", "True") },
                      { v: false, label: tr("Sai (False)", "False") },
                    ].map((choice) => (
                      <button
                        key={String(choice.v)}
                        type="button"
                        disabled={Boolean(submitted)}
                        onClick={() => setAnswer(field.id, choice.v)}
                        className={cn(
                          "min-h-[44px] flex-1 rounded-xl border px-4 py-2 text-sm font-semibold transition",
                          val === choice.v
                            ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
                        )}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                ) : field.type === "TRUE_FALSE_GROUP" ? (
                  <div className="space-y-2">
                    {opts.map((sub) => {
                      const map = (val && typeof val === "object" && !Array.isArray(val)
                        ? val
                        : {}) as Record<string, boolean>;
                      return (
                        <div
                          key={sub.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5 text-sm"
                        >
                          <span>
                            <strong className="mr-1">{sub.id})</strong>
                            {sub.text}
                          </span>
                          <div className="flex gap-1.5">
                            {[true, false].map((flag) => (
                              <button
                                key={String(flag)}
                                type="button"
                                disabled={Boolean(submitted)}
                                onClick={() => setAnswer(field.id, { ...map, [sub.id]: flag })}
                                className={cn(
                                  "min-h-[36px] rounded-lg border px-3 text-xs font-bold",
                                  map[sub.id] === flag
                                    ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                                    : "border-slate-200 bg-white text-slate-600"
                                )}
                              >
                                {flag ? tr("Đúng", "T") : tr("Sai", "F")}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : field.type === "DROPDOWN" ? (
                  <select
                    value={typeof val === "string" ? val : ""}
                    disabled={Boolean(submitted)}
                    onChange={(e) => setAnswer(field.id, e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">{tr("-- Chọn đáp án --", "-- Select answer --")}</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.text || o.id}
                      </option>
                    ))}
                  </select>
                ) : field.type === "CHECKBOX" ? (
                  <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={Boolean(submitted)}
                      checked={Boolean(val)}
                      onChange={(e) => setAnswer(field.id, e.target.checked)}
                      className="h-5 w-5 rounded accent-[#4F46E5]"
                    />
                    {tr("Đánh dấu chọn", "Checked")}
                  </label>
                ) : field.type === "NUMBER" ? (
                  <Input
                    type="number"
                    step="any"
                    disabled={Boolean(submitted)}
                    value={typeof val === "number" || typeof val === "string" ? String(val) : ""}
                    onChange={(e) =>
                      setAnswer(field.id, e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder={tr("Nhập số…", "Enter number…")}
                  />
                ) : field.type === "ESSAY" ? (
                  <Textarea
                    rows={4}
                    disabled={Boolean(submitted)}
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setAnswer(field.id, e.target.value)}
                    placeholder={tr("Nhập câu trả lời tự luận…", "Write your response…")}
                  />
                ) : (
                  <Input
                    disabled={Boolean(submitted)}
                    value={typeof val === "string" ? val : ""}
                    onChange={(e) => setAnswer(field.id, e.target.value)}
                    placeholder={tr("Nhập câu trả lời…", "Type your answer…")}
                    data-testid={`public-text-${field.id}`}
                  />
                )}
              </div>
            );
          })}

          {!submitted && (
            <div className="flex justify-end">
              <Button
                type="submit"
                size="lg"
                className="min-h-[44px] w-full sm:w-auto"
                disabled={submitting}
                data-testid="public-practice-submit-btn"
              >
                <ClipboardCheck className="h-4 w-4" />
                {submitting
                  ? tr("Đang chấm điểm…", "Submitting…")
                  : tr("Nộp bài & Xem điểm ngay", "Submit & See Score")}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
