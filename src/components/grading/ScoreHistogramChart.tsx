"use client";

import type { ScoreHistogramResult } from "@/lib/analytics/score-histogram";
import { useI18n } from "@/lib/i18n/client";

export function ScoreHistogramChart({ histogram }: { histogram: ScoreHistogramResult }) {
  const { tr } = useI18n();
  const maxCount = Math.max(1, ...histogram.buckets.map((b) => b.count));

  return (
    <section className="stitch-card p-5 space-y-4" data-testid="score-histogram-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Phổ điểm (Thang 10)", "Score Distribution (Scale 10)")}
          </h2>
          <p className="text-xs text-[#464555] dark:text-slate-400">
            {tr("Phân bố theo 10 khoảng điểm và các phân vị", "Distribution across 10 score bands and percentiles")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-lg bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 font-semibold text-[#3525CD] dark:text-indigo-300 tabular-nums">
            {tr("Trung vị", "Median")}: {histogram.median}
          </span>
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-medium text-[#464555] dark:text-slate-300 tabular-nums">
            P25: {histogram.p25}
          </span>
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-medium text-[#464555] dark:text-slate-300 tabular-nums">
            P75: {histogram.p75}
          </span>
          <span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
            P90: {histogram.p90}
          </span>
        </div>
      </div>

      {histogram.count === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">
          {tr("Chưa có bài đã chấm xong để vẽ phổ điểm.", "No fully graded submissions yet.")}
        </p>
      ) : (
        <div className="grid grid-cols-10 items-end gap-1.5 sm:gap-2.5 pt-4 h-40">
          {histogram.buckets.map((bucket) => {
            const heightPct = bucket.count > 0 ? Math.max(12, Math.round((bucket.count / maxCount) * 100)) : 4;
            return (
              <div
                key={bucket.index}
                className="flex h-full flex-col items-center justify-end gap-1"
                title={`${bucket.label}: ${bucket.count} (${bucket.pct}%)`}
              >
                <span className="text-[11px] font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                  {bucket.count > 0 ? bucket.count : ""}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    bucket.count > 0
                      ? "bg-[#4F46E5] dark:bg-indigo-500"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
                <span className="text-[10px] font-medium text-[#464555] dark:text-slate-400 tabular-nums">
                  {bucket.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
