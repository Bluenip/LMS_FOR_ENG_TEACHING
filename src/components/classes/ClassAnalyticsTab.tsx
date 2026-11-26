"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Grid3X3, TrendingUp, Users } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";

interface ClassAnalyticsPayload {
  analytics: {
    summary: {
      totalStudents: number;
      totalAssignments: number;
      submissionRatePct: number;
      avgScore10: number;
    };
    weeklyTrend: Array<{
      weekStart: string;
      label: string;
      submissionCount: number;
      avgScore10: number | null;
    }>;
    mostUnsubmittedStudents: Array<{
      studentId: string;
      studentName: string;
      studentEmail: string;
      missingCount: number;
    }>;
  };
}

export function ClassAnalyticsTab({
  classId,
  workbooks,
}: {
  classId: string;
  workbooks: Array<{ id: string; title: string; assignmentCount: number }>;
}) {
  const { tr } = useI18n();
  const { data, isLoading } = useQuery<ClassAnalyticsPayload>({
    queryKey: ["class-analytics", classId],
    queryFn: () => apiFetchJson(`/api/classes/${classId}/analytics`),
  });

  if (isLoading || !data) {
    return (
      <div className="stitch-card p-8 text-center text-sm text-slate-400">
        {tr("Đang tính thống kê lớp…", "Calculating class analytics…")}
      </div>
    );
  }

  const { summary, weeklyTrend, mostUnsubmittedStudents } = data.analytics;

  return (
    <div className="space-y-5" data-testid="class-analytics-tab">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="stitch-card p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555] dark:text-slate-400">
            <span>{tr("Sĩ số", "Students")}</span>
            <Users className="h-4 w-4 text-[#4F46E5]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#0B1C30] dark:text-slate-100 tabular-nums">
            {summary.totalStudents}
          </p>
        </div>
        <div className="stitch-card p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555] dark:text-slate-400">
            <span>{tr("Số bài tập", "Assignments")}</span>
            <BarChart3 className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#0B1C30] dark:text-slate-100 tabular-nums">
            {summary.totalAssignments}
          </p>
        </div>
        <div className="stitch-card p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555] dark:text-slate-400">
            <span>{tr("Tỉ lệ nộp bài", "Completion rate")}</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 tabular-nums">
            {summary.submissionRatePct}%
          </p>
        </div>
        <div className="stitch-card p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[#464555] dark:text-slate-400">
            <span>{tr("Điểm TB cả lớp", "Class avg (/10)")}</span>
            <BarChart3 className="h-4 w-4 text-[#4F46E5]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
            {summary.avgScore10} / 10
          </p>
        </div>
      </div>

      {/* 12-week Trend */}
      <section className="stitch-card p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
          {tr("Điểm trung bình 12 tuần gần nhất", "12-Week Average Score Trend")}
        </h3>
        <div className="grid grid-cols-6 sm:grid-cols-12 items-end gap-2 pt-3 h-40">
          {weeklyTrend.map((w) => {
            const hPct = w.avgScore10 !== null ? Math.max(10, Math.round((w.avgScore10 / 10) * 100)) : 5;
            return (
              <div
                key={w.weekStart}
                className="flex h-full flex-col items-center justify-end gap-1"
                title={`${w.label}: ${w.avgScore10 ?? "—"} (${w.submissionCount} bài)`}
              >
                <span className="text-[10px] font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                  {w.avgScore10 !== null ? w.avgScore10 : ""}
                </span>
                <div
                  className={`w-full rounded-t-md ${
                    w.avgScore10 !== null
                      ? "bg-[#4F46E5] dark:bg-indigo-500"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                  style={{ height: `${hPct}%` }}
                />
                <span className="text-[10px] text-slate-400 tabular-nums">{w.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {workbooks.length > 0 && (
          <section className="stitch-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
              {tr("Ma trận Workbook trong lớp", "Workbook Matrices in this Class")}
            </h3>
            <div className="space-y-2">
              {workbooks.map((wb) => (
                <Link
                  key={wb.id}
                  href={`/teacher/classes/${classId}/workbooks/${wb.id}`}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-semibold hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Grid3X3 className="h-4 w-4 text-[#4F46E5] shrink-0" />
                    <span className="truncate">{wb.title}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {wb.assignmentCount} {tr("bài", "items")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="stitch-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Học sinh cần nhắc nộp bài", "Students Missing Assignments")}
          </h3>
          {mostUnsubmittedStudents.length === 0 ? (
            <p className="text-xs text-emerald-600">
              {tr("Tất cả học sinh đều đã hoàn thành đầy đủ bài tập!", "All students have completed their assignments!")}
            </p>
          ) : (
            <div className="space-y-2">
              {mostUnsubmittedStudents.map((st) => (
                <div
                  key={st.studentId}
                  className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#0B1C30] dark:text-slate-100">
                      {st.studentName}
                    </p>
                    <p className="truncate text-slate-400">{st.studentEmail}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-amber-100 dark:bg-amber-950/50 px-2.5 py-1 font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {tr("Thiếu", "Missing")} {st.missingCount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
