"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Award,
  BarChart2,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  KeyRound,
  MessageSquareQuote,
  Plus,
  ShieldAlert,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import type { SkillTag } from "@prisma/client";
import { cn, formatDateTime, getInitials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChildLinkSummary {
  linkId: string;
  relation: string;
  studentId: string;
  studentName: string;
  classes: Array<{ id: string; name: string; teacherName: string }>;
}

interface ParentOverviewDTO {
  student: { id: string; name: string };
  classes: Array<{ id: string; name: string; teacherName: string; studentCount: number }>;
  kpis: {
    childAvg10: number;
    classAvg10: number;
    rank: number | null;
    totalStudents: number;
    onTimeRate: number;
    onTimeCount: number;
    totalSubmitted: number;
    pendingCount: number;
  };
  trend: Array<{
    assignmentId: string;
    label: string;
    childScore10: number | null;
    classAvg10: number | null;
  }>;
  classPerformance: Array<{
    classId: string;
    className: string;
    teacherName: string;
    studentCount: number;
    totalAssignments: number;
    submittedCount: number;
    onTimeCount: number;
    childAvg10: number | null;
    classAvg10: number | null;
  }>;
  skills: Array<{
    skill: SkillTag;
    childPct: number | null;
    classPct: number | null;
  }>;
  recentAssignments: Array<{
    assignmentId: string;
    title: string;
    className: string;
    questionCount: number;
    dueAt: string | null;
    status: "NOT_STARTED" | "ON_TIME" | "LATE";
    childScore: number | null;
    maxScore: number | null;
    childScore10: number | null;
    classAvg10: number | null;
    rank: number | null;
    totalParticipants: number;
  }>;
  offlineGrades?: Array<{
    columnId: string;
    classId: string;
    className: string;
    title: string;
    date: string;
    score: number | null;
    maxScore: number;
    score10: number | null;
    weight: number;
    note: string | null;
    classAvg10: number | null;
  }>;
  attendance?: {
    presentCount: number;
    lateCount: number;
    excusedCount: number;
    absentCount: number;
    totalMarked: number;
    attendanceRatePct: number | null;
    recentRecords: Array<{
      sessionId: string;
      sessionTitle: string;
      className: string;
      startsAt: string;
      status: "PRESENT" | "EXCUSED" | "ABSENT" | "LATE";
      note: string | null;
    }>;
  };
  teacherFeedback: Array<{
    assignmentTitle: string;
    className: string;
    teacherName: string;
    submittedAt: string | null;
    comment: string;
  }>;
  proctorAlerts: Array<{
    assignmentTitle: string;
    violationCount: number;
    events: Array<{ type: string; at: string; durationMs: number | null }>;
  }>;
}

function ScoreTrendSvgChart({
  trend,
}: {
  trend: ParentOverviewDTO["trend"];
}) {
  const { tr } = useI18n();
  if (trend.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-400">
        {tr("Chưa đủ dữ liệu bài kiểm tra để vẽ biểu đồ tiến bộ.", "Not enough test data to draw the progress chart yet.")}
      </div>
    );
  }

  const width = 520;
  const height = 200;
  const padL = 34;
  const padR = 20;
  const padT = 16;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const getX = (i: number) =>
    trend.length === 1 ? padL + plotW / 2 : padL + (i / (trend.length - 1)) * plotW;
  const getY = (score: number) => padT + plotH - (Math.max(0, Math.min(10, score)) / 10) * plotH;

  const childPts = trend
    .map((t, i) => (t.childScore10 !== null ? { x: getX(i), y: getY(t.childScore10), val: t.childScore10 } : null))
    .filter((p): p is { x: number; y: number; val: number } => Boolean(p));

  const classPts = trend
    .map((t, i) => (t.classAvg10 !== null ? { x: getX(i), y: getY(t.classAvg10), val: t.classAvg10 } : null))
    .filter((p): p is { x: number; y: number; val: number } => Boolean(p));

  const childPath = childPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const classPath = classPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    childPts.length >= 2
      ? `${childPath} L ${childPts[childPts.length - 1]!.x} ${padT + plotH} L ${childPts[0]!.x} ${padT + plotH} Z`
      : "";

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full min-w-[320px]">
        <defs>
          <linearGradient id="childArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 2, 4, 6, 8, 10].map((v) => {
          const y = getY(v);
          return (
            <g key={v}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-700"
                strokeDasharray="3 3"
              />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94A3B8">
                {v}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#childArea)" />}
        {classPath && (
          <path
            d={classPath}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        )}
        {childPath && (
          <path d={childPath} fill="none" stroke="#4F46E5" strokeWidth="2.8" strokeLinecap="round" />
        )}

        {childPts.map((p, idx) => (
          <g key={idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4.5"
              className="fill-white dark:fill-[#111a2e]"
              stroke="#4F46E5"
              strokeWidth="2.5"
            />
            <text
              x={p.x}
              y={p.y - 9}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              className="fill-[#3525CD] dark:fill-[#a5b4fc]"
            >
              {p.val}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {trend.map((t, i) => (
          <text
            key={t.assignmentId}
            x={getX(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize="9.5"
            fill="#64748B"
          >
            {t.label.slice(0, 12)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function ParentPortalContent() {
  const { m: vi, tr } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialChildId = searchParams.get("childId") ?? "";

  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [relation, setRelation] = useState(tr("Phụ huynh", "Parent"));
  const [linking, setLinking] = useState(false);

  const { data: childrenData, isLoading: loadingChildren } = useQuery<{
    children: ChildLinkSummary[];
  }>({
    queryKey: ["parent-children"],
    queryFn: () =>
      apiFetchJson<{ children: ChildLinkSummary[] }>(
        "/api/parent/children",
        undefined,
        tr("Không tải được danh sách con", "Could not load your children")
      ),
  });

  const children = useMemo(() => childrenData?.children ?? [], [childrenData]);

  useEffect(() => {
    if (!selectedChildId && children.length > 0) {
      setSelectedChildId(children[0]!.studentId);
    }
  }, [children, selectedChildId]);

  const { data: overview, isLoading: loadingOverview } = useQuery<ParentOverviewDTO>({
    queryKey: ["parent-overview", selectedChildId],
    enabled: Boolean(selectedChildId),
    queryFn: () =>
      apiFetchJson<ParentOverviewDTO>(
        `/api/parent/children/${selectedChildId}/overview`,
        undefined,
        tr("Không tải được báo cáo của con", "Could not load your child's report")
      ),
  });

  const handleLinkChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setLinking(true);
    try {
      const res = await fetch("/api/parent/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim().toUpperCase(), relation }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Mã liên kết không hợp lệ", "Invalid link code"));
      toast.success(tr(`Đã liên kết với học sinh ${json.link.student.name}!`, `Linked with student ${json.link.student.name}!`));
      setInviteCode("");
      setLinkDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["parent-children"] });
      setSelectedChildId(json.link.student.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setLinking(false);
    }
  };

  const diffAvg =
    overview && overview.kpis.classAvg10 > 0
      ? Math.round((overview.kpis.childAvg10 - overview.kpis.classAvg10) * 100) / 100
      : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header + Child Switcher (Stitch) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1C30]">
              {vi.parent.title}
            </h1>
            <Badge variant="default">{tr("Chỉ xem", "Read-only")}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-[#464555]">
            {tr("Dữ liệu kết quả học tập được đồng bộ tự động từ lớp học trực tuyến của giáo viên.", "Learning results are synced automatically from the teacher's online class.")}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto">
          {children.length > 0 && (
            <select
              aria-label={vi.parent.selectChild}
              data-testid="parent-child-selector"
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="h-10 w-full min-w-0 max-w-full rounded-full border border-indigo-200 bg-[#EEF2FF] px-4 text-sm font-bold text-[#3525CD] outline-none focus:ring-2 focus:ring-indigo-400 sm:w-auto sm:max-w-md"
            >
              {children.map((ch) => (
                <option key={ch.studentId} value={ch.studentId}>
                  {tr("Con:", "Child:")} {ch.studentName}
                </option>
              ))}
            </select>
          )}

          <Button variant="outline" onClick={() => setLinkDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            {tr("Liên kết thêm con", "Link another child")}
          </Button>
        </div>
      </div>

      {/* Empty state if no linked children */}
      {!loadingChildren && children.length === 0 ? (
        <div className="stitch-card mx-auto max-w-lg p-10 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4F46E5]">
            <KeyRound className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-[#0B1C30]">{vi.parent.linkChildTitle}</h2>
          <p className="text-sm text-[#464555]">{vi.parent.noLinkedChildren}</p>
          <Button onClick={() => setLinkDialogOpen(true)}>
            <KeyRound className="h-4 w-4" />
            {tr("Nhập mã liên kết 8 ký tự", "Enter the 8-character link code")}
          </Button>
        </div>
      ) : loadingOverview || !overview ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      ) : (
        <>
          {/* Student Profile Banner */}
          <div className="stitch-card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-base font-bold text-white">
                {getInitials(overview.student.name)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-[#0B1C30]">{overview.student.name}</h2>
                  {overview.classes[0] && (
                    <Badge variant="default">{overview.classes[0].name}</Badge>
                  )}
                </div>
                {overview.classes[0] && (
                  <p className="text-xs text-[#464555]">
                    {tr("Giáo viên phụ trách:", "Teacher in charge:")} <strong>{overview.classes[0].teacherName}</strong>
                  </p>
                )}
              </div>
            </div>
            <Badge variant="mint" className="gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> {tr("Đã xác nhận liên kết phụ huynh", "Parent link verified")}
            </Badge>
          </div>

          {/* 4 Stitch KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="stitch-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
                <span>{vi.parent.kpiAvg}</span>
                <TrendingUp className="h-4 w-4 text-[#4F46E5]" />
              </div>
              <p className="mt-2.5 text-3xl font-extrabold text-[#3525CD] tabular-nums">
                {overview.kpis.childAvg10}
                <span className="text-sm font-medium text-slate-400"> / 10</span>
              </p>
              <p
                className={cn(
                  "mt-1.5 text-xs font-semibold",
                  diffAvg >= 0 ? "text-emerald-700" : "text-orange-700"
                )}
              >
                {diffAvg >= 0 ? `+${diffAvg}` : diffAvg} {tr("so với TB lớp (", "vs class avg (")}{overview.kpis.classAvg10})
              </p>
            </div>

            <div className="stitch-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
                <span>{vi.parent.kpiRank}</span>
                <Award className="h-4 w-4 text-[#F97316]" />
              </div>
              <p className="mt-2.5 text-3xl font-extrabold text-[#0B1C30] tabular-nums">
                {overview.kpis.rank ?? "—"}
                <span className="text-base font-medium text-slate-400">
                  {" "}
                  / {overview.kpis.totalStudents}
                </span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500">{tr("Xếp hạng tổng hợp trong lớp", "Overall rank in class")}</p>
            </div>

            <div className="stitch-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
                <span>{vi.parent.kpiOnTime}</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2.5 text-3xl font-extrabold text-emerald-700 tabular-nums">
                {overview.kpis.onTimeRate}%
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                {overview.kpis.onTimeCount}/{overview.kpis.totalSubmitted} {tr("bài nộp đúng hạn", "submissions on time")}
              </p>
            </div>

            <div className="stitch-card p-5">
              <div className="flex items-center justify-between text-xs font-semibold text-[#464555]">
                <span>{vi.parent.kpiPending}</span>
                <Clock className="h-4 w-4 text-[#F97316]" />
              </div>
              <p className="mt-2.5 text-3xl font-extrabold text-[#EA580C] tabular-nums">
                {overview.kpis.pendingCount}
              </p>
              <p className="mt-1.5 text-xs text-[#C2410C]">
                {overview.kpis.pendingCount > 0
                  ? tr("Cần nhắc con hoàn thành sớm", "Remind your child to finish soon")
                  : tr("Con đã hoàn thành hết bài tập", "Your child has finished all assignments")}
              </p>
            </div>
          </div>

          {/* 2 Stitch Charts Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Line Chart: Progress Over Time */}
            <div className="stitch-card p-6 lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#0B1C30]">
                    {vi.parent.trendChartTitle}
                  </h3>
                  <p className="text-xs text-[#464555]">
                    {tr("So sánh điểm của con với trung bình lớp qua các bài gần nhất", "Your child's scores compared with the class average on recent assignments")}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-[#3525CD]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#4F46E5]" /> {tr("Con", "Child")} (
                    {overview.kpis.childAvg10})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" /> {tr("TB lớp (", "Class avg (")}{overview.kpis.classAvg10})
                  </span>
                </div>
              </div>
              <ScoreTrendSvgChart trend={overview.trend} />
            </div>

            {/* Bar Chart: Results by Class / Subject (multi-subject) */}
            <div className="stitch-card p-6 lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#0B1C30]">
                    {vi.parent.classChartTitle}
                  </h3>
                  <p className="text-xs text-[#464555]">
                    {tr(
                      "Điểm trung bình của con so với trung bình lớp ở từng lớp đang học",
                      "Your child's average vs the class average in each enrolled class"
                    )}
                  </p>
                </div>
                <BookOpen className="h-5 w-5 shrink-0 text-[#4F46E5]" />
              </div>

              {overview.classPerformance.length === 0 ? (
                <div className="flex h-44 items-center justify-center text-xs text-slate-400">
                  {tr("Con chưa tham gia lớp học nào.", "Your child is not enrolled in any class yet.")}
                </div>
              ) : (
                <div className="space-y-4">
                  {overview.classPerformance.map((c) => {
                    const childWidth = c.childAvg10 === null ? 0 : Math.min(100, Math.max(0, (c.childAvg10 / 10) * 100));
                    const classWidth = c.classAvg10 === null ? 0 : Math.min(100, Math.max(0, (c.classAvg10 / 10) * 100));
                    const aboveOrEqual =
                      c.childAvg10 !== null && (c.classAvg10 === null || c.childAvg10 >= c.classAvg10);
                    return (
                      <div key={c.classId} className="space-y-1.5">
                        <div className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-[#0B1C30]">{c.className}</p>
                            <p className="truncate text-[11px] text-slate-500">
                              {tr("GV:", "Teacher:")} {c.teacherName} • {c.submittedCount}/{c.totalAssignments}{" "}
                              {tr("bài đã nộp", "submitted")}
                            </p>
                          </div>
                          <span className="shrink-0 tabular-nums">
                            <strong className="text-[#3525CD]">
                              {tr("Con:", "Child:")} {c.childAvg10 === null ? "—" : `${c.childAvg10}/10`}
                            </strong>
                            <span className="mx-1.5 text-slate-300">|</span>
                            <span className="text-slate-500">
                              {tr("Lớp:", "Class:")} {c.classAvg10 === null ? "—" : `${c.classAvg10}/10`}
                            </span>
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                aboveOrEqual ? "bg-[#4F46E5]" : "bg-[#F97316]"
                              )}
                              style={{ width: `${childWidth}%` }}
                            />
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-50">
                            <div
                              className="h-full rounded-full bg-slate-300 transition-all"
                              style={{ width: `${classWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Optional Skills Breakdown — shown only when teachers tagged questions with skills */}
          {(() => {
            const activeSkills = overview.skills.filter(
              (s) => s.childPct !== null || s.classPct !== null
            );
            if (activeSkills.length === 0) return null;
            return (
              <div className="stitch-card p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1C30]">
                      {vi.parent.skillsChartTitle}
                    </h3>
                    <p className="text-xs text-[#464555]">
                      {tr(
                        "Thành tích của con so với trung bình lớp ở các kỹ năng có gắn nhãn câu hỏi",
                        "Your child's performance vs the class average across tagged question skills"
                      )}
                    </p>
                  </div>
                  <BarChart2 className="h-5 w-5 shrink-0 text-[#4F46E5]" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeSkills.map((s) => (
                    <div key={s.skill} className="space-y-1.5 rounded-xl border border-slate-100 bg-[#F8F9FF] p-3.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#0B1C30]">{vi.skills[s.skill]}</span>
                        <span className="tabular-nums">
                          <strong className="text-[#3525CD]">
                            {tr("Con:", "Child:")} {s.childPct === null ? "—" : `${s.childPct}%`}
                          </strong>
                          <span className="mx-1.5 text-slate-300">|</span>
                          <span className="text-slate-500">
                            {tr("Lớp:", "Class:")} {s.classPct === null ? "—" : `${s.classPct}%`}
                          </span>
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              (s.childPct ?? 0) >= (s.classPct ?? 0) ? "bg-[#4F46E5]" : "bg-[#F97316]"
                            )}
                            style={{ width: `${s.childPct ?? 0}%` }}
                          />
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-50">
                          <div
                            className="h-full rounded-full bg-slate-300 transition-all"
                            style={{ width: `${s.classPct ?? 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Recent Assignments Table (Strictly Aggregated Class Stats — NO other student names!) */}
          <div className="stitch-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-[#0B1C30]">
                {vi.parent.recentAssignments}
              </h3>
              <p className="text-xs text-[#464555]">
                {tr("Hiển thị điểm của con so với điểm trung bình lớp và vị trí xếp hạng", "Your child's score vs the class average and their rank")}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8F9FF] text-xs font-bold uppercase text-[#464555]">
                  <tr>
                    <th className="px-6 py-3">{tr("Tên bài tập", "Assignment")}</th>
                    <th className="px-6 py-3">{tr("Hạn nộp", "Due")}</th>
                    <th className="px-6 py-3">{tr("Trạng thái", "Status")}</th>
                    <th className="px-6 py-3 text-right">{tr("Điểm của con", "Child's score")}</th>
                    <th className="px-6 py-3 text-right">{tr("TB Lớp", "Class avg")}</th>
                    <th className="px-6 py-3 text-center">{tr("Thứ hạng", "Rank")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.recentAssignments.map((a) => (
                    <tr
                      key={a.assignmentId}
                      className={cn(
                        a.status === "NOT_STARTED" ? "bg-orange-50/40" : "hover:bg-slate-50/60"
                      )}
                    >
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-[#0B1C30]">{a.title}</p>
                        <p className="text-xs text-slate-400">
                          {a.className} • {a.questionCount} {tr("câu", "questions")}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-[#464555] tabular-nums">
                        {formatDateTime(a.dueAt)}
                      </td>
                      <td className="px-6 py-3.5">
                        {a.status === "ON_TIME" && <Badge variant="mint">{tr("Đã nộp (Đúng hạn)", "Submitted (on time)")}</Badge>}
                        {a.status === "LATE" && <Badge variant="orange">{tr("Đã nộp (Trễ hạn)", "Submitted (late)")}</Badge>}
                        {a.status === "NOT_STARTED" && <Badge variant="danger">{tr("Chưa làm", "Not started")}</Badge>}
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-[#3525CD] tabular-nums">
                        {a.childScore10 !== null ? `${a.childScore10} / 10` : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right text-slate-600 tabular-nums">
                        {a.classAvg10 !== null ? `${a.classAvg10}` : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {a.rank !== null ? (
                          <Badge variant="default" className="tabular-nums">
                            {tr("Hạng", "Rank")} {a.rank}/{a.totalParticipants}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phase 21: In-class / Paper Test Scores (Offline Grades) */}
          <div
            data-testid="parent-offline-grades-section"
            className="stitch-card overflow-hidden"
          >
            <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#EA580C]" />
              <div>
                <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
                  {tr("Điểm kiểm tra trên lớp (giấy)", "In-class paper test scores")}
                </h3>
                <p className="text-xs text-[#464555] dark:text-slate-400">
                  {tr(
                    "Điểm kiểm tra trực tiếp trên lớp do giáo viên cập nhật vào sổ điểm.",
                    "In-class and paper assessment scores recorded by the teacher."
                  )}
                </p>
              </div>
            </div>
            {(overview.offlineGrades ?? []).length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-slate-400">
                {tr("Chưa có cột điểm kiểm tra trên lớp nào.", "No in-class paper test scores recorded yet.")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8F9FF] dark:bg-slate-800/70 text-xs font-bold uppercase text-[#464555] dark:text-slate-300">
                    <tr>
                      <th className="px-6 py-3">{tr("Bài kiểm tra", "Assessment")}</th>
                      <th className="px-6 py-3">{tr("Ngày", "Date")}</th>
                      <th className="px-6 py-3 text-right">{tr("Điểm của con", "Child's score")}</th>
                      <th className="px-6 py-3 text-right">{tr("TB Lớp (/10)", "Class avg")}</th>
                      <th className="px-6 py-3 text-center">{tr("Hệ số", "Weight")}</th>
                      <th className="px-6 py-3">{tr("Ghi chú", "Note")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(overview.offlineGrades ?? []).map((g) => (
                      <tr key={g.columnId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-[#0B1C30] dark:text-slate-100">{g.title}</p>
                          <p className="text-xs text-slate-400">{g.className}</p>
                        </td>
                        <td className="px-6 py-3.5 text-xs text-[#464555] dark:text-slate-300 tabular-nums whitespace-nowrap">
                          {formatDateTime(g.date)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                          {g.score !== null ? `${g.score} / ${g.maxScore}` : "—"}
                        </td>
                        <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          {g.classAvg10 !== null ? `${g.classAvg10} / 10` : "—"}
                        </td>
                        <td className="px-6 py-3.5 text-center tabular-nums">x{g.weight}</td>
                        <td className="px-6 py-3.5 text-xs text-slate-500">{g.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Attendance & Punctuality (Strictly Child's Own Records — Phase 23) */}
          {overview.attendance && (
            <div className="stitch-card overflow-hidden" data-testid="parent-attendance-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-[#0B1C30] dark:text-slate-100">
                    <UserCheck className="h-5 w-5 text-[#4F46E5]" />
                    {tr("Chuyên cần & Điểm danh trên lớp", "Class Attendance & Punctuality")}
                  </h3>
                  <p className="text-xs text-[#464555] dark:text-slate-400">
                    {tr(
                      "Thống kê buổi học gần đây và thông báo vắng/muộn của con",
                      "Recent session attendance status and absence/late records for your child"
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="indigo">
                    {tr("Chuyên cần:", "Rate:")}{" "}
                    {overview.attendance.attendanceRatePct !== null
                      ? `${overview.attendance.attendanceRatePct}%`
                      : "—"}
                  </Badge>
                  <Badge variant="mint">
                    {tr("Có mặt:", "Present:")} {overview.attendance.presentCount}
                  </Badge>
                  <Badge variant="orange">
                    {tr("Đi muộn:", "Late:")} {overview.attendance.lateCount}
                  </Badge>
                  <Badge variant="danger">
                    {tr("Vắng KP:", "Absent:")} {overview.attendance.absentCount}
                  </Badge>
                </div>
              </div>

              {overview.attendance.recentRecords.length === 0 ? (
                <p className="px-6 py-6 text-xs text-slate-400">
                  {tr("Chưa có dữ liệu điểm danh buổi học nào.", "No attendance records yet.")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8F9FF] dark:bg-slate-800/60 text-xs font-bold uppercase text-[#464555] dark:text-slate-300">
                      <tr>
                        <th className="px-6 py-3">{tr("Buổi học", "Session")}</th>
                        <th className="px-6 py-3">{tr("Thời gian", "Date")}</th>
                        <th className="px-6 py-3">{tr("Trạng thái", "Status")}</th>
                        <th className="px-6 py-3">{tr("Ghi chú", "Note")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {overview.attendance.recentRecords.map((rec) => (
                        <tr key={rec.sessionId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-3">
                            <p className="font-semibold text-[#0B1C30] dark:text-slate-100">
                              {rec.sessionTitle}
                            </p>
                            <p className="text-xs text-slate-400">{rec.className}</p>
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                            {formatDateTime(rec.startsAt)}
                          </td>
                          <td className="px-6 py-3">
                            {rec.status === "PRESENT" && (
                              <Badge variant="mint">{tr("Có mặt", "Present")}</Badge>
                            )}
                            {rec.status === "LATE" && (
                              <Badge variant="orange">{tr("Đi muộn", "Late")}</Badge>
                            )}
                            {rec.status === "EXCUSED" && (
                              <Badge variant="sky">{tr("Vắng có phép", "Excused")}</Badge>
                            )}
                            {rec.status === "ABSENT" && (
                              <Badge variant="danger">{tr("Vắng không phép", "Absent")}</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-500">{rec.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Teacher Feedback + Shared Proctor Alerts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="stitch-card p-6 lg:col-span-7 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquareQuote className="h-5 w-5 text-[#4F46E5]" />
                <h3 className="text-base font-bold text-[#0B1C30]">
                  {vi.parent.teacherFeedback}
                </h3>
              </div>
              {overview.teacherFeedback.length === 0 ? (
                <p className="text-xs text-slate-400">{tr("Chưa có nhận xét nào từ giáo viên.", "No teacher feedback yet.")}</p>
              ) : (
                <div className="space-y-3">
                  {overview.teacherFeedback.map((fb, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-indigo-100 bg-[#F8F9FF] p-4 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#3525CD]">{fb.teacherName}</span>
                        <span className="text-slate-400">{formatDateTime(fb.submittedAt)}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-500">
                        {tr("Bài:", "Assignment:")} {fb.assignmentTitle}
                      </p>
                      <p className="text-sm italic leading-relaxed text-[#0B1C30]">
                        &ldquo;{fb.comment}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="stitch-card p-6 lg:col-span-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-[#BA1A1A]" />
                <h3 className="text-base font-bold text-[#0B1C30]">
                  {vi.parent.proctorAlerts}
                </h3>
              </div>
              {overview.proctorAlerts.length === 0 ? (
                <div className="rounded-xl bg-emerald-50/70 p-4 text-xs font-medium text-emerald-800">
                  {tr("Không có cảnh báo vi phạm quy chế thi nào được chia sẻ.", "No exam-rule violation alerts have been shared.")}
                </div>
              ) : (
                <div className="space-y-3">
                  {overview.proctorAlerts.map((al, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-red-200 bg-[#FEF2F2] p-3.5 text-xs space-y-1.5"
                    >
                      <p className="flex items-center gap-1.5 font-bold text-[#BA1A1A]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {al.assignmentTitle} ({al.violationCount} {tr("vi phạm)", "violations)")}
                      </p>
                      <ul className="space-y-0.5 text-[#93000A]">
                        {al.events.map((ev, j) => (
                          <li key={j}>
                            • {ev.type} ({formatDateTime(ev.at)})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Redeem Parent Invite Code Modal */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.parent.linkChildTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLinkChild} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Mã liên kết 8 ký tự", "8-character link code")}</Label>
              <Input
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder={vi.parent.linkCodePlaceholder}
                className="font-mono uppercase tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Mối quan hệ", "Relationship")}</Label>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value={tr("Bố", "Father")}>{tr("Bố", "Father")}</option>
                <option value={tr("Mẹ", "Mother")}>{tr("Mẹ", "Mother")}</option>
                <option value={tr("Người giám hộ", "Guardian")}>{tr("Người giám hộ", "Guardian")}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={linking}>
                {linking ? tr("Đang xác nhận…", "Verifying…") : vi.parent.linkButton}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ParentPortalPage() {
  const { m: vi } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      }
    >
      <ParentPortalContent />
    </Suspense>
  );
}
