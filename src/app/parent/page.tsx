"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Award,
  BarChart2,
  CheckCircle2,
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
import { vi } from "@/messages/vi";
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
  if (trend.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-slate-400">
        Chưa đủ dữ liệu bài kiểm tra để vẽ biểu đồ tiến bộ.
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
                stroke="#E2E8F0"
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
            <circle cx={p.x} cy={p.y} r="4.5" fill="#FFFFFF" stroke="#4F46E5" strokeWidth="2.5" />
            <text
              x={p.x}
              y={p.y - 9}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#3525CD"
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
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialChildId = searchParams.get("childId") ?? "";

  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [relation, setRelation] = useState("Phụ huynh");
  const [linking, setLinking] = useState(false);

  const { data: childrenData, isLoading: loadingChildren } = useQuery<{
    children: ChildLinkSummary[];
  }>({
    queryKey: ["parent-children"],
    queryFn: async () => {
      const res = await fetch("/api/parent/children");
      if (!res.ok) throw new Error("Không tải được danh sách con");
      return res.json();
    },
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
    queryFn: async () => {
      const res = await fetch(`/api/parent/children/${selectedChildId}/overview`);
      if (!res.ok) throw new Error("Không tải được báo cáo của con");
      return res.json();
    },
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
      if (!res.ok) throw new Error(json.error ?? "Mã liên kết không hợp lệ");
      toast.success(`Đã liên kết với học sinh ${json.link.student.name}!`);
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
            <Badge variant="default">Chỉ xem</Badge>
          </div>
          <p className="mt-0.5 text-sm text-[#464555]">
            Dữ liệu kết quả học tập được đồng bộ tự động từ lớp học trực tuyến của giáo viên.
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto">
          {children.length > 0 && (
            <select
              aria-label={vi.parent.selectChild}
              data-testid="parent-child-selector"
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="h-10 w-full min-w-0 max-w-full truncate rounded-full border border-indigo-200 bg-[#EEF2FF] px-4 text-sm font-bold text-[#3525CD] outline-none focus:ring-2 focus:ring-indigo-400 sm:w-auto sm:max-w-md"
            >
              {children.map((ch) => (
                <option key={ch.studentId} value={ch.studentId}>
                  Con: {ch.studentName}
                  {ch.classes[0] ? ` — ${ch.classes[0].name}` : ""}
                </option>
              ))}
            </select>
          )}

          <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Liên kết thêm con
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
            Nhập mã liên kết 8 ký tự
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4F46E5] text-base font-bold text-white">
                {getInitials(overview.student.name)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[#0B1C30]">{overview.student.name}</h2>
                  {overview.classes[0] && (
                    <Badge variant="default">{overview.classes[0].name}</Badge>
                  )}
                </div>
                {overview.classes[0] && (
                  <p className="text-xs text-[#464555]">
                    Giáo viên phụ trách: <strong>{overview.classes[0].teacherName}</strong>
                  </p>
                )}
              </div>
            </div>
            <Badge variant="mint" className="gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> Đã xác nhận liên kết phụ huynh
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
                {diffAvg >= 0 ? `+${diffAvg}` : diffAvg} so với TB lớp ({overview.kpis.classAvg10})
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
              <p className="mt-1.5 text-xs text-slate-500">Xếp hạng tổng hợp trong lớp</p>
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
                {overview.kpis.onTimeCount}/{overview.kpis.totalSubmitted} bài nộp đúng hạn
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
                  ? "Cần nhắc con hoàn thành sớm"
                  : "Con đã hoàn thành hết bài tập"}
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
                    So sánh điểm của con với trung bình lớp qua các bài gần nhất
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-[#3525CD]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#4F46E5]" /> Con (
                    {overview.kpis.childAvg10})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-400" /> TB
                    lớp ({overview.kpis.classAvg10})
                  </span>
                </div>
              </div>
              <ScoreTrendSvgChart trend={overview.trend} />
            </div>

            {/* Bar Chart: 5 English Skills */}
            <div className="stitch-card p-6 lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#0B1C30]">
                    {vi.parent.skillsChartTitle}
                  </h3>
                  <p className="text-xs text-[#464555]">
                    Thành tích của con so với trung bình lớp theo từng kỹ năng
                  </p>
                </div>
                <BarChart2 className="h-5 w-5 text-[#4F46E5]" />
              </div>

              <div className="space-y-3.5">
                {overview.skills.map((s) => (
                  <div key={s.skill} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#0B1C30]">{vi.skills[s.skill]}</span>
                      <span className="tabular-nums">
                        <strong className="text-[#3525CD]">
                          Con: {s.childPct === null ? "—" : `${s.childPct}%`}
                        </strong>
                        <span className="mx-1.5 text-slate-300">|</span>
                        <span className="text-slate-500">
                          Lớp: {s.classPct === null ? "—" : `${s.classPct}%`}
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
          </div>

          {/* Recent Assignments Table (Strictly Aggregated Class Stats — NO other student names!) */}
          <div className="stitch-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-[#0B1C30]">
                {vi.parent.recentAssignments}
              </h3>
              <p className="text-xs text-[#464555]">
                Hiển thị điểm của con so với điểm trung bình lớp và vị trí xếp hạng
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8F9FF] text-xs font-bold uppercase text-[#464555]">
                  <tr>
                    <th className="px-6 py-3">Tên bài tập</th>
                    <th className="px-6 py-3">Hạn nộp</th>
                    <th className="px-6 py-3">Trạng thái</th>
                    <th className="px-6 py-3 text-right">Điểm của con</th>
                    <th className="px-6 py-3 text-right">TB Lớp</th>
                    <th className="px-6 py-3 text-center">Thứ hạng</th>
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
                          {a.className} • {a.questionCount} câu
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-[#464555] tabular-nums">
                        {formatDateTime(a.dueAt)}
                      </td>
                      <td className="px-6 py-3.5">
                        {a.status === "ON_TIME" && <Badge variant="mint">Đã nộp (Đúng hạn)</Badge>}
                        {a.status === "LATE" && <Badge variant="orange">Đã nộp (Trễ hạn)</Badge>}
                        {a.status === "NOT_STARTED" && <Badge variant="danger">Chưa làm</Badge>}
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
                            Hạng {a.rank}/{a.totalParticipants}
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
                <p className="text-xs text-slate-400">Chưa có nhận xét nào từ giáo viên.</p>
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
                        Bài: {fb.assignmentTitle}
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
                  Không có cảnh báo vi phạm quy chế thi nào được chia sẻ.
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
                        {al.assignmentTitle} ({al.violationCount} vi phạm)
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
              <Label>Mã liên kết 8 ký tự</Label>
              <Input
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder={vi.parent.linkCodePlaceholder}
                className="font-mono uppercase tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mối quan hệ</Label>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value="Bố">Bố</option>
                <option value="Mẹ">Mẹ</option>
                <option value="Người giám hộ">Người giám hộ</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={linking}>
                {linking ? "Đang xác nhận…" : vi.parent.linkButton}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ParentPortalPage() {
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
