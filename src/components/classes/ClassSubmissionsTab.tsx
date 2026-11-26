"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardEdit } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OverviewSubmission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  attemptNo: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED" | "RETURNED";
  isLate: boolean;
  totalScore: number | null;
  maxScore: number;
  submittedAt: string | null;
  startedAt: string;
}

export function ClassSubmissionsTab({
  classId,
  assignments,
  students,
}: {
  classId: string;
  assignments: Array<{ id: string; title: string }>;
  students: Array<{ id: string; name: string }>;
}) {
  const { tr, locale } = useI18n();
  const [assignmentId, setAssignmentId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");

  const queryStr = new URLSearchParams();
  if (assignmentId) queryStr.set("assignmentId", assignmentId);
  if (studentId) queryStr.set("studentId", studentId);
  if (status) queryStr.set("status", status);

  const { data, isLoading } = useQuery<{ submissions: OverviewSubmission[] }>({
    queryKey: ["class-submissions", classId, assignmentId, studentId, status],
    queryFn: () =>
      apiFetchJson(
        `/api/classes/${classId}/submissions${queryStr.toString() ? `?${queryStr.toString()}` : ""}`
      ),
  });

  const submissions = data?.submissions ?? [];

  const renderStatus = (st: OverviewSubmission["status"]) => {
    switch (st) {
      case "GRADED":
        return <Badge variant="mint">{tr("Đã chấm", "Graded")}</Badge>;
      case "SUBMITTED":
        return <Badge variant="orange">{tr("Chờ chấm", "Submitted")}</Badge>;
      case "RETURNED":
        return <Badge variant="orange">{tr("Trả làm lại", "Returned")}</Badge>;
      default:
        return <Badge variant="sky">{tr("Đang làm", "In progress")}</Badge>;
    }
  };

  return (
    <div className="space-y-4" data-testid="class-submissions-tab">
      <div className="stitch-card grid gap-3 p-4 sm:grid-cols-3">
        <select
          value={assignmentId}
          onChange={(e) => setAssignmentId(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
          aria-label={tr("Lọc bài tập", "Filter by assignment")}
        >
          <option value="">{tr("Tất cả bài tập", "All assignments")}</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>

        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
          aria-label={tr("Lọc học sinh", "Filter by student")}
        >
          <option value="">{tr("Tất cả học sinh", "All students")}</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
          aria-label={tr("Lọc trạng thái", "Filter by status")}
        >
          <option value="">{tr("Mọi trạng thái", "All statuses")}</option>
          <option value="SUBMITTED">{tr("Chờ chấm tự luận", "Submitted")}</option>
          <option value="GRADED">{tr("Đã chấm", "Graded")}</option>
          <option value="RETURNED">{tr("Đã trả làm lại", "Returned")}</option>
          <option value="IN_PROGRESS">{tr("Đang làm", "In progress")}</option>
        </select>
      </div>

      <div className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-bold uppercase text-[#464555] dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">{tr("Học sinh", "Student")}</th>
                <th className="px-4 py-3">{tr("Bài tập", "Assignment")}</th>
                <th className="px-4 py-3">{tr("Trạng thái", "Status")}</th>
                <th className="px-4 py-3 text-right">{tr("Điểm", "Score")}</th>
                <th className="px-4 py-3">{tr("Thời gian nộp", "Submitted at")}</th>
                <th className="px-4 py-3 text-right">{tr("Thao tác", "Action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                    {tr("Đang tải bài nộp…", "Loading submissions…")}
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                    {tr("Chưa có bài nộp nào phù hợp bộ lọc.", "No matching submissions found.")}
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0B1C30] dark:text-slate-100">
                        {sub.studentName}
                      </p>
                      <p className="text-[11px] text-slate-400">{sub.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-[#0B1C30] dark:text-slate-200">
                      {sub.assignmentTitle}
                    </td>
                    <td className="px-4 py-3">{renderStatus(sub.status)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                      {sub.totalScore !== null ? `${sub.totalScore}/${sub.maxScore}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {sub.submittedAt ? formatDateTime(sub.submittedAt, locale) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" asChild className="min-h-9">
                        <Link href={`/teacher/assignments/${sub.assignmentId}/grading`}>
                          <ClipboardEdit className="h-3.5 w-3.5" />
                          {tr("Chấm bài", "Grade")}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
