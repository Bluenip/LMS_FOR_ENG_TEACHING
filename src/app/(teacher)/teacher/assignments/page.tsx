import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Lock, Plus, Radio, Trophy } from "lucide-react";
import { auth } from "@/lib/auth";
import { listTeacherAssignments, describeProctorRuleSummary } from "@/server/assignmentService";
import { formatDateTime } from "@/lib/utils";
import { vi } from "@/messages/vi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function TeacherAssignmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const assignments = await listTeacherAssignments(session.user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.nav.assignments}</h1>
          <p className="mt-0.5 text-sm text-[#464555]">
            Quản lý bài tập đã giao, giám sát phòng thi trực tiếp và chấm điểm.
          </p>
        </div>
        <Button variant="accent" asChild>
          <Link href="/teacher/assignments/new">
            <Plus className="h-4 w-4" />
            Giao bài tập mới
          </Link>
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          Chưa có bài tập nào được giao.
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const summary = describeProctorRuleSummary(a);
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
                    {a.proctorMode !== "OFF" && (
                      <Badge variant="danger">
                        <Lock className="h-3 w-3" />
                        {vi.proctor.modes[a.proctorMode]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#464555]">
                    <span>{a.worksheet._count.fields} câu hỏi</span>
                    {a.timeLimitMin && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                        {a.timeLimitMin} phút
                      </span>
                    )}
                    <span>Hạn nộp: {formatDateTime(a.dueAt)}</span>
                    <span className="font-semibold text-[#3525CD]">
                      Đã nộp: {submittedCount}/{a.class._count.enrollments}
                    </span>
                  </div>
                  {summary && (
                    <p className="text-xs font-semibold text-[#BA1A1A]">{summary}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/teacher/classes/${a.class.id}/leaderboard?assignmentId=${a.id}`}
                    >
                      <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                      Xếp hạng
                    </Link>
                  </Button>
                  {a.proctorMode !== "OFF" && (
                    <Button size="sm" variant="secondary" asChild>
                      <Link href={`/teacher/assignments/${a.id}/live`}>
                        <Radio className="h-3.5 w-3.5 text-red-500" />
                        Giám sát Live
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" asChild>
                    <Link href={`/teacher/assignments/${a.id}/grading`}>
                      {pendingCount > 0 ? `Chấm bài (${pendingCount})` : "Báo cáo & Chấm"}
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
