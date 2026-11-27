"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import type { SkillTag, WorksheetSubject } from "@prisma/client";
import { WORKSHEET_SUBJECTS, getSubjectMeta } from "@/lib/subjects";
import { AlertCircle, CheckCircle2, Eye, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PromptText } from "@/components/worksheet/PromptText";
import { SubjectBadge } from "@/components/worksheet/SubjectPicker";

interface MistakeItemDTO {
  answerId: string;
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  subject: WorksheetSubject;
  fieldType: string;
  skillTag: SkillTag | null;
  topicTag: string | null;
  prompt: string;
  options: Array<{ id: string; text: string }> | null;
  studentValue: unknown;
  answerKey: Record<string, unknown>;
  explanation: string | null;
  submittedAt: string | null;
}

const SKILLS: SkillTag[] = [
  "GRAMMAR",
  "VOCABULARY",
  "READING",
  "LISTENING",
  "WRITING",
  "SPEAKING",
];

function formatExpectedAnswer(ak: Record<string, unknown>, options: MistakeItemDTO["options"]): string {
  if (typeof ak?.correct === "string") {
    const opt = options?.find((o) => o.id === ak.correct);
    return opt ? `${ak.correct}. ${opt.text}` : ak.correct;
  }
  if (Array.isArray(ak?.accepted)) {
    return ak.accepted.map(String).join(" / ");
  }
  if (ak?.value !== undefined) return String(ak.value);
  if (typeof ak?.expected === "boolean") return ak.expected ? "True" : "False";
  return JSON.stringify(ak);
}

export default function StudentMistakesPage() {
  const { m: vi, tr, locale } = useI18n();
  const [subject, setSubject] = useState<string>("");
  const [skillTag, setSkillTag] = useState<string>("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [retryInputs, setRetryInputs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<{ mistakes: MistakeItemDTO[] }>({
    queryKey: ["student-mistakes", subject, skillTag],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (subject) qs.set("subject", subject);
      if (skillTag) qs.set("skillTag", skillTag);
      return apiFetchJson(
        `/api/student/mistakes?${qs.toString()}`,
        undefined,
        tr("Không tải được ngân hàng câu sai", "Could not load mistake review")
      );
    },
  });

  const mistakes = data?.mistakes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#0B1C30] dark:text-slate-100">
            {tr("Ngân hàng câu sai của tôi", "My Mistake Review Bank")}
          </h1>
          <p className="text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Tổng hợp các câu bạn đã làm sai từ những bài kiểm tra đã mở đáp án để luyện tập lại (không tính điểm chính thức).",
              "Practice incorrect questions from completed assignments whose answer keys are released."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label={tr("Môn học", "Subject")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium"
          >
            <option value="">{tr("Tất cả môn", "All subjects")}</option>
            {WORKSHEET_SUBJECTS.map((s) => {
              const meta = getSubjectMeta(s);
              return (
                <option key={s} value={s}>
                  {locale === "en" ? meta.labelEn : meta.labelVi}
                </option>
              );
            })}
          </select>

          <select
            value={skillTag}
            onChange={(e) => setSkillTag(e.target.value)}
            aria-label={tr("Kỹ năng", "Skill")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium"
          >
            <option value="">{tr("Mọi kỹ năng", "All skills")}</option>
            {SKILLS.map((sk) => (
              <option key={sk} value={sk}>
                {vi.skills[sk]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="stitch-card flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Đang tải câu sai…", "Loading mistakes…")}
        </div>
      ) : mistakes.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-2">
          <Sparkles className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
            {tr(
              "Chưa có câu sai nào đã mở đáp án để ôn tập.",
              "No released mistake items to review yet."
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="mistakes-list">
          {mistakes.map((m) => {
            const isShown = Boolean(revealed[m.answerId]);
            const expectedText = formatExpectedAnswer(m.answerKey, Array.isArray(m.options) ? m.options : null);

            return (
              <div
                key={m.answerId}
                data-testid={`mistake-card-${m.answerId}`}
                className="stitch-card p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SubjectBadge subject={m.subject} />
                    <Badge variant="neutral">{m.className}</Badge>
                    <Badge variant="indigo">{m.assignmentTitle}</Badge>
                    {m.skillTag && <Badge variant="orange">{vi.skills[m.skillTag]}</Badge>}
                    {m.topicTag && <Badge variant="sky">{m.topicTag}</Badge>}
                  </div>
                </div>

                <PromptText
                  text={m.prompt}
                  className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100"
                />

                {Array.isArray(m.options) && m.options.length > 0 && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {m.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setRetryInputs((prev) => ({ ...prev, [m.answerId]: opt.id }))
                        }
                        className={`min-h-9 rounded-xl border px-3 py-2 text-left text-xs transition ${
                          retryInputs[m.answerId] === opt.id
                            ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD] font-semibold"
                            : "border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <strong>{opt.id}.</strong> {opt.text}
                      </button>
                    ))}
                  </div>
                )}

                {(!Array.isArray(m.options) || m.options.length === 0) && (
                  <Input
                    value={retryInputs[m.answerId] ?? ""}
                    onChange={(e) =>
                      setRetryInputs((prev) => ({ ...prev, [m.answerId]: e.target.value }))
                    }
                    placeholder={tr("Nhập thử lại đáp án của bạn…", "Try typing the correct answer…")}
                    className="max-w-md h-9 text-xs"
                  />
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {tr("Lần trước bạn chọn:", "Previous answer:")}{" "}
                    <code>{JSON.stringify(m.studentValue)}</code>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    data-testid={`reveal-mistake-${m.answerId}`}
                    onClick={() =>
                      setRevealed((prev) => ({ ...prev, [m.answerId]: !prev[m.answerId] }))
                    }
                  >
                    <Eye className="h-3.5 w-3.5 text-[#4F46E5]" />
                    {isShown
                      ? tr("Ẩn đáp án", "Hide answer")
                      : tr("Xem đáp án & giải thích", "Show answer & explanation")}
                  </Button>
                </div>

                {isShown && (
                  <div
                    data-testid={`mistake-answer-${m.answerId}`}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30 p-3.5 text-xs space-y-1"
                  >
                    <p className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      {tr("Đáp án đúng:", "Correct answer:")} {expectedText}
                    </p>
                    {m.explanation && (
                      <p className="text-emerald-900 dark:text-emerald-200">{m.explanation}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
