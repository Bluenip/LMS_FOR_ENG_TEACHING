"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { FileDown, Loader2, TrendingUp } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StudentProgressDetailDTO {
  class: { id: string; name: string; teacherName: string };
  student: { id: string; name: string; email: string };
  range: { from: string | null; to: string | null };
  summary: {
    weightedAvg10: number | null;
    classAvg10: number | null;
    submissionRatePct: number;
    submittedOnlineCount: number;
    totalOnlineCount: number;
    offlineGradedCount: number;
    offlineTotalCount: number;
    attendance?: {
      presentCount: number;
      lateCount: number;
      excusedCount: number;
      absentCount: number;
      totalMarked: number;
      attendanceRatePct: number | null;
    };
  };
  timeline: Array<{
    id: string;
    kind: "ONLINE" | "OFFLINE";
    title: string;
    date: string;
    score: number | null;
    maxScore: number;
    score10: number | null;
    weight: number;
    classAvg10: number | null;
    status: string;
    note: string | null;
  }>;
}

function ProgressTrendSvg({
  timeline,
}: {
  timeline: StudentProgressDetailDTO["timeline"];
}) {
  const { tr } = useI18n();
  const points = timeline.filter((t) => t.score10 !== null || t.classAvg10 !== null);
  if (points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
        {tr("Chưa có dữ liệu điểm theo thời gian.", "No scored items in this period yet.")}
      </div>
    );
  }

  const width = 540;
  const height = 195;
  const padL = 34;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const getX = (i: number) =>
    points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW;
  const getY = (score10: number) =>
    padT + plotH - (Math.max(0, Math.min(10, score10)) / 10) * plotH;

  const stuPts = points
    .map((p, idx) =>
      p.score10 !== null
        ? { x: getX(idx), y: getY(p.score10), val: p.score10, kind: p.kind }
        : null
    )
    .filter((p): p is { x: number; y: number; val: number; kind: "ONLINE" | "OFFLINE" } =>
      Boolean(p)
    );

  const avgPts = points
    .map((p, idx) =>
      p.classAvg10 !== null ? { x: getX(idx), y: getY(p.classAvg10), val: p.classAvg10 } : null
    )
    .filter((p): p is { x: number; y: number; val: number } => Boolean(p));

  const stuPath = stuPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const avgPath = avgPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full min-w-[340px]"
        data-testid="student-progress-svg"
      >
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

        {avgPath && (
          <path
            d={avgPath}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1.8"
            strokeDasharray="5 4"
          />
        )}
        {stuPath && (
          <path d={stuPath} fill="none" stroke="#4F46E5" strokeWidth="2.6" strokeLinecap="round" />
        )}

        {stuPts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4.5"
              className="fill-white dark:fill-slate-900"
              stroke={p.kind === "OFFLINE" ? "#EA580C" : "#4F46E5"}
              strokeWidth="2.5"
            />
            <text
              x={p.x}
              y={p.y - 9}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              className="fill-[#3525CD] dark:fill-indigo-300"
            >
              {p.val}
            </text>
          </g>
        ))}

        {points.map((pt, idx) => (
          <text
            key={`${pt.kind}-${pt.id}`}
            x={getX(idx)}
            y={height - 8}
            textAnchor="middle"
            fontSize="9"
            fill="#64748B"
          >
            {pt.title.slice(0, 10)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function StudentProgressDrawer({
  classId,
  student,
  from,
  to,
  onClose,
}: {
  classId: string;
  student: { id: string; name: string } | null;
  from?: string;
  to?: string;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const qs = new URLSearchParams({ format: "json" });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const { data, isLoading } = useQuery<StudentProgressDetailDTO>({
    queryKey: ["student-gradebook-detail", classId, student?.id ?? "", from ?? "", to ?? ""],
    enabled: Boolean(student),
    queryFn: () =>
      apiFetchJson<StudentProgressDetailDTO>(
        `/api/classes/${classId}/gradebook/student/${student!.id}?${qs.toString()}`,
        undefined,
        tr("Không tải được hồ sơ tiến bộ", "Could not load student progress")
      ),
  });

  const pdfHref = student
    ? (() => {
        const p = new URLSearchParams({ format: "pdf" });
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        return `/api/classes/${classId}/gradebook/student/${student.id}?${p.toString()}`;
      })()
    : "#";

  return (
    <Dialog open={Boolean(student)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="student-progress-drawer"
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#4F46E5]" />
            {tr("Hồ sơ tiến bộ học sinh", "Student Progress Profile")}
          </DialogTitle>
          <DialogDescription>
            {student?.name} {data ? `• ${data.student.email} • ${data.class.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("Đang tải dữ liệu…", "Loading…")}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="indigo">
                  {tr("TB tổng:", "Weighted Avg:")}{" "}
                  {data.summary.weightedAvg10 !== null ? `${data.summary.weightedAvg10}/10` : "—"}
                </Badge>
                <Badge variant="neutral">
                  {tr("TB lớp:", "Class Avg:")}{" "}
                  {data.summary.classAvg10 !== null ? `${data.summary.classAvg10}/10` : "—"}
                </Badge>
                <Badge variant="mint">
                  {tr("Nộp online:", "Online:")} {data.summary.submittedOnlineCount}/
                  {data.summary.totalOnlineCount} ({data.summary.submissionRatePct}%)
                </Badge>
                {data.summary.attendance && data.summary.attendance.totalMarked > 0 && (
                  <Badge variant="sky">
                    {tr("Chuyên cần:", "Attendance:")}{" "}
                    {data.summary.attendance.attendanceRatePct ?? "—"}% (
                    {data.summary.attendance.absentCount} {tr("vắng", "absent")})
                  </Badge>
                )}
              </div>
              <Button variant="outline" className="min-h-10" asChild>
                <a href={pdfHref} data-testid="download-report-card-pdf-btn">
                  <FileDown className="h-4 w-4 text-[#4F46E5]" />
                  {tr("Tải Phiếu báo điểm PDF", "Download Report Card PDF")}
                </a>
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#0B1C30] dark:text-slate-100">
                  {tr("Biểu đồ điểm theo thời gian (Thang 10)", "Score Trend Over Time (Scale 10)")}
                </span>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-[#4F46E5]" />
                    Online
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-[#EA580C]" />
                    {tr("Giấy", "Paper")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-0.5 w-4 bg-slate-400" />
                    {tr("TB lớp", "Class avg")}
                  </span>
                </div>
              </div>
              <ProgressTrendSvg timeline={data.timeline} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FF] dark:bg-slate-800/70 text-[11px] font-bold uppercase text-[#464555] dark:text-slate-300">
                  <tr>
                    <th className="px-3.5 py-2.5">{tr("Đầu điểm", "Item")}</th>
                    <th className="px-3.5 py-2.5">{tr("Loại", "Type")}</th>
                    <th className="px-3.5 py-2.5">{tr("Ngày", "Date")}</th>
                    <th className="px-3.5 py-2.5 text-right">{tr("Điểm", "Score")}</th>
                    <th className="px-3.5 py-2.5 text-right">{tr("Thang 10", "/ 10")}</th>
                    <th className="px-3.5 py-2.5 text-center">{tr("Hệ số", "Wt")}</th>
                    <th className="px-3.5 py-2.5">{tr("Ghi chú", "Note")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.timeline.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        {tr("Chưa có đầu điểm nào.", "No grade items yet.")}
                      </td>
                    </tr>
                  ) : (
                    data.timeline.map((item) => (
                      <tr key={`${item.kind}-${item.id}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-3.5 py-2.5 font-semibold text-[#0B1C30] dark:text-slate-100">
                          {item.title}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge variant={item.kind === "OFFLINE" ? "orange" : "indigo"}>
                            {item.kind === "OFFLINE" ? tr("Giấy", "Paper") : "Online"}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTime(item.date)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-semibold tabular-nums">
                          {item.score !== null ? `${item.score}/${item.maxScore}` : "—"}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                          {item.score10 !== null ? `${item.score10}` : "—"}
                        </td>
                        <td className="px-3.5 py-2.5 text-center tabular-nums">x{item.weight}</td>
                        <td className="px-3.5 py-2.5 text-slate-500">{item.note ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
