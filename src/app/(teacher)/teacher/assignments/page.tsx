import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Copy, Lock, Pencil, Plus, Radio, Trophy } from "lucide-react";
import { auth } from "@/lib/auth";
import { listTeacherAssignments, describeProctorRuleSummary } from "@/server/assignmentService";
import { formatDateTime } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function TeacherAssignmentsPage() {
  const { m: vi, tr } = await getI18n();
  const session = await auth();
  if (!session?.user) redirect("/login");
  const assignments = await listTeacherAssignments(session.user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.nav.assignments}</h1>
          <p className="mt-0.5 text-sm text-[#464555]">
            {tr("Quản lý bài tập đã giao, giám sát phòng thi trực tiếp và chấm điểm.", "Manage assigned work, run live exams and grade.")}
          </p>
        </div>
        <Button variant="accent" asChild>
          <Link href="/teacher/assignments/new">
            <Plus className="h-4 w-4" />
            {tr("Giao bài tập mới", "New assignment")}
          </Link>
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {tr("Chưa có bài tập nào được giao.", "No assignments yet.")}
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const summary = describeProctorRuleSummary(a, tr);
            const submittedCount = new Set(
              a.submissions
                .filter((s) => s.status === "SUBMITTED" || s.status === "GRADED")
                .map((s) => s.studentId)
            ).size;
            const pendingCount = a.submissions.filter((s) => s.status === "SUBMITTED").length;

            return (
              <div
                key={a.id}
                className="stitch-card-hover flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[#0B1C30]">{a.title}</h3>
                    <Badge variant="default">{a.class.name}</Badge>
                    {(a.proctorMode !== "OFF" || a.requireCamera) && (
                      <Badge variant="danger">
                        <Lock className="h-3 w-3" />
                        {a.proctorMode !== "OFF" ? vi.proctor.modes[a.proctorMode] : tr("Camera AI", "AI Camera")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#464555]">
                    <span>{a.worksheet._count.fields} {tr("câu hỏi", "questions")}</span>
                    {a.timeLimitMin && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                        {a.timeLimitMin} {tr("phút", "min")}
                      </span>
                    )}
                    <span>{tr("Hạn nộp:", "Due:")} {formatDateTime(a.dueAt)}</span>
                    <span className="font-semibold text-[#3525CD]">
                      {tr("Đã nộp:", "Submitted:")} {submittedCount}/{a.class._count.enrollments}
                    </span>
                  </div>
                  {summary && (
                    <p className="text-xs font-semibold text-[#BA1A1A]">{summary}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/teacher/assignments/new?edit=${a.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                      {tr("Sửa", "Edit")}
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/teacher/assignments/new?worksheetId=${a.worksheet.id}&classId=${a.class.id}`}
                      title={tr("Giao lại phiếu này thành một bài mới", "Assign this worksheet again as a new assignment")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {tr("Giao lại", "Assign again")}
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/teacher/classes/${a.class.id}/leaderboard?assignmentId=${a.id}`}
                    >
                      <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                      {tr("Xếp hạng", "Leaderboard")}
                    </Link>
                  </Button>
                  {(a.proctorMode !== "OFF" || a.requireCamera) && (
                    <Button size="sm" variant="secondary" asChild>
                      <Link href={`/teacher/assignments/${a.id}/live`}>
                        <Radio className="h-3.5 w-3.5 text-red-500" />
                        {tr("Giám sát Live", "Live proctoring")}
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" asChild>
                    <Link href={`/teacher/assignments/${a.id}/grading`}>
                      {pendingCount > 0 ? tr(`Chấm bài (${pendingCount})`, `Grade (${pendingCount})`) : tr("Báo cáo & Chấm", "Report & grading")}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
