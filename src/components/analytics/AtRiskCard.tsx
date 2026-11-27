"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { AtRiskStudent } from "@/lib/analytics/at-risk";

type Row = AtRiskStudent & { classId?: string; className?: string };

/** "Học sinh cần quan tâm" for one class (classId) or across the teacher's classes (dashboard). */
export function AtRiskCard({ classId, limit = 8 }: { classId?: string; limit?: number }) {
  const { tr, locale } = useI18n();
  const url = classId ? `/api/classes/${classId}/at-risk` : "/api/teacher/at-risk";
  const { data, isLoading } = useQuery<{ students: Row[]; total?: number }>({
    queryKey: ["at-risk", classId ?? "teacher"],
    queryFn: () => apiFetchJson(url),
  });

  if (!classId && !isLoading && data && data.students.length === 0) return null;

  return (
    <div className="stitch-card overflow-hidden" data-testid={classId ? "class-at-risk-card" : "teacher-at-risk-card"}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          {tr("Học sinh cần quan tâm", "Students at risk")}
        </h3>
        {data && <span className="text-xs text-slate-500">{data.total ?? data.students.length}</span>}
      </div>
      {isLoading ? (
        <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-slate-400" />
      ) : !data || data.students.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-500">{tr("Chưa có học sinh nào đáng lo.", "No students at risk.")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.students.slice(0, limit).map((s) => (
            <li key={`${s.classId ?? ""}${s.student.id}`} className="flex items-start justify-between gap-3 px-4 py-2.5" data-testid={`at-risk-${s.student.id}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {s.student.name}
                  {s.className && s.classId && (
                    <Link href={`/teacher/classes/${s.classId}?tab=analytics`} className="ml-2 text-xs font-normal text-[#4F46E5] hover:underline">
                      {s.className}
                    </Link>
                  )}
                </p>
                <ul className="text-xs text-slate-500">
                  {s.reasons.map((r) => (
                    <li key={r.signal}>• {locale === "en" ? r.en : r.vi}</li>
                  ))}
                </ul>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                  s.level === "HIGH" ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                )}
              >
                {s.level === "HIGH" ? tr("Cao", "High") : tr("Vừa", "Medium")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
