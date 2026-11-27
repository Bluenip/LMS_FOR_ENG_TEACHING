"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, ChevronDown, ChevronUp, Loader2, Microscope } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { ItemAnalysisRow, ItemFlag } from "@/lib/analytics/item-analysis";

const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(2));

/** Item Analysis table for the grading page: difficulty, discrimination and distractors. */
export function ItemAnalysisCard({ assignmentId }: { assignmentId: string }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ examineeCount: number; items: ItemAnalysisRow[] }>({
    queryKey: ["item-analysis", assignmentId],
    queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/item-analysis`),
  });

  const flagLabel = (f: ItemFlag) =>
    ({
      GOOD: [tr("Tốt", "Good"), "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"],
      TOO_EASY: [tr("Quá dễ", "Too easy"), "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"],
      TOO_HARD: [tr("Quá khó", "Too hard"), "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"],
      CHECK_KEY: [tr("Kiểm tra lại đáp án", "Check the key"), "bg-rose-600 text-white"],
      LOW_DISCRIMINATION: [tr("Phân biệt kém", "Low discrimination"), "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"],
      NOT_ENOUGH_DATA: [tr("Ít dữ liệu", "Too few"), "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"],
    })[f] as [string, string];

  return (
    <div className="stitch-card overflow-hidden" data-testid="item-analysis-card">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
          <Microscope className="h-4 w-4 text-[#4F46E5]" />
          {tr("Phân tích câu hỏi (Item Analysis)", "Item analysis")}
        </h3>
        {data && <span className="text-xs text-slate-500">{data.examineeCount} {tr("bài", "papers")}</span>}
      </div>
      {isLoading || !data ? (
        <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-[#F8F9FF] text-left text-[#464555] dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">{tr("Câu", "Q")}</th>
                <th className="px-3 py-2 text-right" title={tr("Tỉ lệ làm đúng (0–1)", "Share correct (0–1)")}>{tr("Độ khó p", "Difficulty p")}</th>
                <th className="px-3 py-2 text-right" title={tr("Nhóm 27% cao − nhóm 27% thấp", "Upper 27% − lower 27%")}>{tr("Phân biệt D", "Discrim. D")}</th>
                <th className="px-3 py-2 text-right">r<sub>pb</sub></th>
                <th className="px-3 py-2">{tr("Đánh giá", "Verdict")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((it) => {
                const [label, cls] = flagLabel(it.flag);
                const expanded = open === it.fieldId;
                return (
                  <Fragment key={it.fieldId}>
                    <tr className={cn(it.flag === "CHECK_KEY" && "bg-rose-50/60 dark:bg-rose-950/30")} data-testid={`item-row-${it.fieldId}`}>
                      <td className="px-3 py-2 font-semibold">{it.label}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(it.pValue)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono", (it.discriminationIndex ?? 0) < 0 && "font-bold text-rose-600")}>{fmt(it.discriminationIndex)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(it.pointBiserial)}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", cls)} data-testid={`item-flag-${it.fieldId}`}>
                          {it.flag === "CHECK_KEY" && <AlertOctagon className="h-3 w-3" />}
                          {label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        {it.distractors.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOpen(expanded ? null : it.fieldId)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label={tr("Phương án nhiễu", "Distractors")}
                          >
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 px-3 py-3 dark:bg-slate-900/60">
                          <p className="mb-2 font-semibold">{tr("Tỉ lệ chọn: nhóm cao (xanh) / nhóm thấp (cam)", "Picked by upper (blue) / lower (orange) group")}</p>
                          <div className="space-y-1.5">
                            {it.distractors.map((d) => (
                              <div key={d.optionId} className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
                                <span className={cn("font-bold", d.isKey && "text-emerald-600")}>
                                  {d.optionId}
                                  {d.isKey && " ✓"}
                                </span>
                                <div className="space-y-0.5">
                                  <div className="h-2 rounded bg-sky-500" style={{ width: `${Math.max(2, d.upper * 100)}%` }} />
                                  <div className="h-2 rounded bg-orange-400" style={{ width: `${Math.max(2, d.lower * 100)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
