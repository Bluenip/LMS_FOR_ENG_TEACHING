"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { BarChart3, CheckCircle2, Loader2, Radio, ShieldAlert, Users } from "lucide-react";
import { ScoreHistogramChart } from "@/components/grading/ScoreHistogramChart";
import type { ScoreHistogramResult } from "@/lib/analytics/score-histogram";
import { useI18n } from "@/lib/i18n/client";
import { BackLink } from "@/components/navigation/BackLink";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExamSessionReportDTO {
  session: {
    id: string;
    title: string;
    worksheetId: string;
    worksheetTitle: string;
    dueAt: string | null;
    timeLimitMin: number | null;
  };
  classComparisons: Array<{
    assignmentId: string;
    classId: string;
    className: string;
    totalStudents: number;
    submittedCount: number;
    pendingManualCount: number;
    avgScore10: number;
    highestScore10: number;
    lowestScore10: number;
    stdDev: number;
    variantCodes: string[];
  }>;
  overall: {
    totalStudents: number;
    submittedCount: number;
    avgScore10: number;
    highestScore10: number;
    lowestScore10: number;
    histogram: ScoreHistogramResult;
    variantBreakdown: Array<{ code: string; submissions: number; avgScore10: number | null }>;
  };
  questionAnalytics: Array<{
    fieldId: string;
    label: string;
    type: string;
    skillTag: string | null;
    topicTag: string | null;
    points: number;
    correctCount: number;
    totalGraded: number;
    correctRate: number;
  }>;
}

interface ExamLiveSnapshotDTO {
  sessionId: string;
  title: string;
  classes: Array<{
    assignmentId: string;
    classId: string;
    className: string;
    counts: {
      total: number;
      inProgress: number;
      submitted: number;
      leftTab: number;
      cameraOff: number;
      locked: number;
      notStarted: number;
    };
  }>;
  totals: {
    total: number;
    inProgress: number;
    submitted: number;
    leftTab: number;
    cameraOff: number;
    locked: number;
    notStarted: number;
  };
  students: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    classId: string;
    className: string;
    assignmentId: string;
    examVariantCode: string | null;
    liveStatus: string;
    answeredCount: number;
    totalQuestions: number;
    violationCount: number;
  }>;
}

export default function ExamSessionDetailPage() {
  const { tr } = useI18n();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const examId = params.id;

  const initialTab = searchParams.get("tab") === "live" ? "live" : "report";
  const [tab, setTab] = useState<"report" | "live">(initialTab);
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [sseConnected, setSseConnected] = useState(false);

  const { data: report, isLoading: loadingReport } = useQuery<ExamSessionReportDTO>({
    queryKey: ["exam-report", examId],
    queryFn: () =>
      apiFetchJson<ExamSessionReportDTO>(
        `/api/exams/${examId}`,
        undefined,
        tr("Không tải được báo cáo kỳ thi", "Could not load exam report")
      ),
  });

  const { data: liveSnapshot, isLoading: loadingLive } = useQuery<ExamLiveSnapshotDTO>({
    queryKey: ["exam-live", examId],
    enabled: tab === "live",
    refetchInterval: 10_000,
    queryFn: () =>
      apiFetchJson<ExamLiveSnapshotDTO>(
        `/api/exams/${examId}/live`,
        undefined,
        tr("Không tải được dữ liệu giám sát", "Could not load live monitor")
      ),
  });

  // Subscribe to multi-class SSE stream when Live tab is open
  useEffect(() => {
    if (tab !== "live") return;
    const es = new EventSource(`/api/exams/${examId}/live?stream=1`);
    es.addEventListener("connected", () => setSseConnected(true));
    es.addEventListener("proctor", () => {
      void queryClient.invalidateQueries({ queryKey: ["exam-live", examId] });
      void queryClient.invalidateQueries({ queryKey: ["exam-report", examId] });
    });
    es.onerror = () => setSseConnected(false);
    return () => {
      setSseConnected(false);
      es.close();
    };
  }, [tab, examId, queryClient]);

  if (loadingReport || !report) {
    return (
      <div className="stitch-card flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tr("Đang tải dữ liệu kỳ thi…", "Loading exam data…")}
      </div>
    );
  }

  const visibleLiveStudents = (liveSnapshot?.students ?? []).filter(
    (s) => classFilter === "ALL" || s.classId === classFilter
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink fallbackHref="/teacher/exams" label={tr("Kỳ thi liên lớp", "Multi-class exams")} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1C30] dark:text-slate-100">
              {report.session.title}
            </h1>
            <p className="text-sm text-[#464555] dark:text-slate-400">
              {tr("Phiếu đề gốc:", "Source worksheet:")} <strong>{report.session.worksheetTitle}</strong>
            </p>
          </div>
          {sseConnected && tab === "live" && (
            <Badge variant="mint" className="gap-1.5">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {tr("Đang kết nối Live nhiều lớp", "Multi-class Live connected")}
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "report" | "live")}>
        <TabsList>
          <TabsTrigger value="report" className="gap-1.5" data-testid="exam-tab-report">
            <BarChart3 className="h-4 w-4" />
            {tr("Báo cáo liên lớp", "Cross-class Report")}
          </TabsTrigger>
          <TabsTrigger value="live" className="gap-1.5" data-testid="exam-tab-live">
            <Radio className="h-4 w-4 text-red-500" />
            {tr("Giám sát Live liên lớp", "Live Multi-class Monitor")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-6" data-testid="exam-report-tab">
          {/* Overall KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="stitch-card p-4">
              <p className="text-xs text-slate-500">{tr("Sĩ số toàn kỳ thi", "Total students")}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#0B1C30] dark:text-slate-100 tabular-nums">
                {report.overall.submittedCount} / {report.overall.totalStudents}
              </p>
            </div>
            <div className="stitch-card p-4">
              <p className="text-xs text-slate-500">{tr("Điểm TB chung (/10)", "Overall Avg")}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                {report.overall.avgScore10}
              </p>
            </div>
            <div className="stitch-card p-4">
              <p className="text-xs text-slate-500">{tr("Cao nhất", "Highest")}</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {report.overall.highestScore10}
              </p>
            </div>
            <div className="stitch-card p-4">
              <p className="text-xs text-slate-500">{tr("Thấp nhất", "Lowest")}</p>
              <p className="mt-1 text-2xl font-extrabold text-[#EA580C] tabular-nums">
                {report.overall.lowestScore10}
              </p>
            </div>
          </div>

          {/* Class Comparison Table */}
          <div className="stitch-card overflow-hidden">
            <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#4F46E5]" />
              <h2 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
                {tr("So sánh kết quả giữa các lớp", "Class-by-class Comparison")}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="exam-class-comparison-table">
                <thead className="bg-[#F8F9FF] dark:bg-slate-800/70 font-bold uppercase text-[#464555] dark:text-slate-300">
                  <tr>
                    <th className="px-5 py-3">{tr("Lớp học", "Class")}</th>
                    <th className="px-4 py-3 text-center">{tr("Đã nộp", "Submitted")}</th>
                    <th className="px-4 py-3 text-right">{tr("Điểm TB (/10)", "Avg (/10)")}</th>
                    <th className="px-4 py-3 text-right">{tr("Cao / Thấp", "Max / Min")}</th>
                    <th className="px-4 py-3 text-right">{tr("Độ lệch chuẩn", "Std Dev")}</th>
                    <th className="px-4 py-3">{tr("Mã đề", "Variants")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.classComparisons.map((c) => (
                    <tr key={c.assignmentId}>
                      <td className="px-5 py-3 font-semibold text-[#0B1C30] dark:text-slate-100">
                        {c.className}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {c.submittedCount}/{c.totalStudents}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                        {c.avgScore10}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.highestScore10} / {c.lowestScore10}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.stdDev}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.variantCodes.length > 0 ? (
                            c.variantCodes.map((code) => (
                              <Badge key={code} variant="neutral" className="text-[10px]">
                                {code}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ScoreHistogramChart histogram={report.overall.histogram} />
            </div>
            <div className="stitch-card p-5 lg:col-span-5 space-y-3">
              <h3 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
                {tr("Phân bố theo Mã đề", "Variant Breakdown")}
              </h3>
              {report.overall.variantBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400">
                  {tr("Chưa có bài nộp theo mã đề.", "No submissions tagged with variants yet.")}
                </p>
              ) : (
                <div className="space-y-2">
                  {report.overall.variantBreakdown.map((v) => (
                    <div
                      key={v.code}
                      className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 px-3.5 py-2.5 text-xs"
                    >
                      <Badge variant="indigo">{tr("Mã đề", "Code")} {v.code}</Badge>
                      <span className="text-slate-500 tabular-nums">
                        {v.submissions} {tr("bài", "subs")}
                      </span>
                      <span className="font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                        TB: {v.avgScore10 ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Question Analytics Merged by Original Question */}
          <div className="stitch-card overflow-hidden" data-testid="exam-question-analytics">
            <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
                {tr("Thống kê từng câu gộp chung mọi mã đề", "Question Analytics Merged Across Variants")}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FF] dark:bg-slate-800/70 font-bold uppercase text-[#464555] dark:text-slate-300">
                  <tr>
                    <th className="px-5 py-3">{tr("Câu hỏi gốc", "Question")}</th>
                    <th className="px-4 py-3">{tr("Loại", "Type")}</th>
                    <th className="px-4 py-3">{tr("Chủ đề", "Topic")}</th>
                    <th className="px-4 py-3 text-right">{tr("Đúng / Tổng", "Correct")}</th>
                    <th className="px-4 py-3 text-right">{tr("Tỉ lệ đúng", "Accuracy")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.questionAnalytics.map((q) => (
                    <tr key={q.fieldId}>
                      <td className="px-5 py-2.5 font-semibold text-[#0B1C30] dark:text-slate-100">
                        {tr("Câu", "Q")} {q.label}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{q.type}</td>
                      <td className="px-4 py-2.5">
                        {q.topicTag ? <Badge variant="neutral">{q.topicTag}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {q.correctCount}/{q.totalGraded}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {q.correctRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="live" className="space-y-4" data-testid="exam-live-tab">
          {loadingLive || !liveSnapshot ? (
            <div className="stitch-card flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Đang tải trạng thái phòng thi…", "Loading exam rooms…")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setClassFilter("ALL")}
                  className={`min-h-10 rounded-full border px-3.5 text-xs font-semibold ${
                    classFilter === "ALL"
                      ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {tr("Tất cả lớp", "All classes")} ({liveSnapshot.totals.total})
                </button>
                {liveSnapshot.classes.map((c) => (
                  <button
                    key={c.classId}
                    type="button"
                    onClick={() => setClassFilter(c.classId)}
                    className={`min-h-10 rounded-full border px-3.5 text-xs font-semibold ${
                      classFilter === c.classId
                        ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {c.className} ({c.counts.inProgress} {tr("đang làm", "active")} / {c.counts.total})
                  </button>
                ))}
              </div>

              <div className="stitch-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F9FF] dark:bg-slate-800/70 font-bold uppercase text-[#464555] dark:text-slate-300">
                      <tr>
                        <th className="px-5 py-3">{tr("Học sinh", "Student")}</th>
                        <th className="px-4 py-3">{tr("Lớp", "Class")}</th>
                        <th className="px-4 py-3">{tr("Mã đề", "Variant")}</th>
                        <th className="px-4 py-3">{tr("Trạng thái", "Status")}</th>
                        <th className="px-4 py-3 text-center">{tr("Tiến độ", "Progress")}</th>
                        <th className="px-4 py-3 text-center">{tr("Vi phạm", "Violations")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {visibleLiveStudents.map((st) => (
                        <tr key={`${st.assignmentId}-${st.studentId}`}>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-[#0B1C30] dark:text-slate-100">{st.studentName}</p>
                            <p className="text-[11px] text-slate-400">{st.studentEmail}</p>
                          </td>
                          <td className="px-4 py-3">{st.className}</td>
                          <td className="px-4 py-3">
                            {st.examVariantCode ? (
                              <Badge variant="indigo">{st.examVariantCode}</Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                st.liveStatus === "LOCKED" || st.liveStatus === "LEFT_TAB"
                                  ? "danger"
                                  : st.liveStatus === "SUBMITTED"
                                    ? "mint"
                                    : st.liveStatus === "IN_PROGRESS"
                                      ? "indigo"
                                      : "neutral"
                              }
                            >
                              {st.liveStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {st.answeredCount}/{st.totalQuestions}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {st.violationCount > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-red-600">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                {st.violationCount}
                              </span>
                            ) : (
                              "0"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
