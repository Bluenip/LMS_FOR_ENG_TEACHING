"use client";

import { useQuery } from "@tanstack/react-query";
import { Target, TrendingUp } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { masteryTagLabel, type MasteryCell } from "@/lib/analytics/mastery";

interface Profile {
  strengths: MasteryCell[];
  toReview: MasteryCell[];
  developing: MasteryCell[];
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** "Điểm mạnh & Chủ đề cần ôn" for the student dashboard (no studentId) or the parent portal. */
export function MasteryProfileCard({ studentId }: { studentId?: string }) {
  const { tr, locale } = useI18n();
  const url = studentId ? `/api/parent/children/${studentId}/mastery` : "/api/student/mastery";
  const { data } = useQuery<Profile>({
    queryKey: ["mastery-profile", studentId ?? "me"],
    queryFn: () => apiFetchJson(url),
  });
  if (!data || data.strengths.length + data.toReview.length + data.developing.length === 0) return null;

  const chip = (c: MasteryCell, tone: "good" | "bad") => (
    <li
      key={c.tag}
      className={
        tone === "good"
          ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
      }
    >
      {masteryTagLabel(c.tag, locale).label} · {pct(c.accuracy)}
    </li>
  );

  return (
    <div className="stitch-card space-y-3 p-4" data-testid="mastery-profile-card">
      <h3 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">{tr("Điểm mạnh & Chủ đề cần ôn", "Strengths & topics to review")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" /> {tr("Điểm mạnh", "Strengths")}
          </p>
          {data.strengths.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">{data.strengths.slice(0, 8).map((c) => chip(c, "good"))}</ul>
          ) : (
            <p className="text-xs text-slate-500">{tr("Chưa có chủ đề nào đạt ≥ 80%.", "No topic at 80% yet.")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
            <Target className="h-3.5 w-3.5" /> {tr("Cần ôn", "To review")}
          </p>
          {data.toReview.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">{data.toReview.slice(0, 8).map((c) => chip(c, "bad"))}</ul>
          ) : (
            <p className="text-xs text-slate-500">{tr("Không có chủ đề dưới 50%.", "No topic under 50%.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
