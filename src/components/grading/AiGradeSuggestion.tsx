"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { RubricCriterion, RubricScoreMap } from "@/lib/grading";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

interface SuggestionDTO {
  id: string;
  suggestedScore: number;
  suggestedRubricScores: RubricScoreMap | null;
  suggestedComment: string;
  appliedAt: string | null;
}

/**
 * "AI gợi ý chấm" for one manual answer. The suggestion is only a draft: it is saved as the grade
 * when the teacher presses Apply (server re-validates and clamps every number).
 */
export function AiGradeSuggestion({
  submissionId,
  fieldId,
  maxPoints,
  rubric,
  onApplied,
}: {
  submissionId: string;
  fieldId: string;
  maxPoints: number;
  rubric: RubricCriterion[];
  onApplied: () => void;
}) {
  const { tr } = useI18n();
  const [suggestion, setSuggestion] = useState<SuggestionDTO | null>(null);
  const [busy, setBusy] = useState<"ask" | "apply" | "dismiss" | null>(null);
  const url = `/api/submissions/${submissionId}/ai-suggest-grade`;

  const ask = async () => {
    setBusy("ask");
    try {
      const res = await apiFetchJson<{ suggestion: SuggestionDTO }>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId }),
      });
      setSuggestion(res.suggestion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Lỗi gọi AI", "AI request failed"));
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: "APPLY" | "DISMISS") => {
    setBusy(action === "APPLY" ? "apply" : "dismiss");
    try {
      await apiFetchJson(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId, action }),
      });
      setSuggestion(null);
      if (action === "APPLY") {
        toast.success(tr("Đã áp dụng gợi ý và lưu điểm câu này", "Suggestion applied and saved"));
        onApplied();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(null);
    }
  };

  if (!suggestion) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void ask()}
        disabled={busy !== null}
        data-testid={`ai-suggest-btn-${submissionId}`}
      >
        {busy === "ask" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-[#F97316]" />}
        {tr("AI gợi ý chấm", "AI grade suggestion")}
      </Button>
    );
  }

  return (
    <div
      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
      data-testid={`ai-suggestion-${submissionId}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
        <Sparkles className="h-3.5 w-3.5" />
        {tr("Gợi ý từ AI — giáo viên cần kiểm duyệt", "AI suggestion — teacher review required")}
      </p>
      <p className="font-bold text-[#0B1C30] dark:text-slate-100" data-testid={`ai-suggested-score-${submissionId}`}>
        {tr("Điểm gợi ý", "Suggested score")}: {suggestion.suggestedScore}/{maxPoints}
      </p>
      {rubric.length > 0 && suggestion.suggestedRubricScores && (
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {rubric.map((c) => (
            <li key={c.id} className="flex justify-between gap-2 rounded-lg bg-white/70 px-2 py-1 dark:bg-slate-900/60">
              <span className="truncate">{c.title}</span>
              <span className="font-mono">
                {suggestion.suggestedRubricScores?.[c.id] ?? 0}/{c.maxPoints}
              </span>
            </li>
          ))}
        </ul>
      )}
      {suggestion.suggestedComment && (
        <p className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{suggestion.suggestedComment}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void act("APPLY")} disabled={busy !== null} data-testid={`ai-apply-${submissionId}`}>
          {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {tr("Áp dụng & lưu điểm", "Apply & save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void act("DISMISS")} disabled={busy !== null}>
          <X className="h-3.5 w-3.5" /> {tr("Bỏ qua", "Dismiss")}
        </Button>
      </div>
    </div>
  );
}
