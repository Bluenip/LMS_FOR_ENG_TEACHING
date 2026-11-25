import Link from "next/link";
import { Clock, Copy, Lock, Pencil, Plus, Radio, Trophy } from "lucide-react";
import { requireLayoutUser } from "@/lib/permissions";
import { listTeacherAssignments, describeProctorRuleSummary } from "@/server/assignmentService";
import { formatDateTime } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssignmentListFilters } from "@/components/classes/AssignmentListFilters";
import { ASSIGNMENT_SORTS, type AssignmentSort } from "@/lib/assignment-list";
import { foldText } from "@/lib/text-search";

/** "YYYY-MM" of a date in Vietnam time (the month an assignment was given). */
function monthKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}


export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; q?: string; class?: string; month?: string; sort?: string }>;
}) {
  const { m: vi, tr } = await getI18n();
  const user = await requireLayoutUser(["TEACHER", "ADMIN"]);
  const isAdmin = user.role === "ADMIN";
  const all = await listTeacherAssignments(user.id, { allClasses: isAdmin });

  // admin: optional filter by teacher (?teacher=<id>)
  const {
    teacher: teacherFilter,
    q: rawQuery,
    class: classFilter,
    month: monthFilter,
    sort: rawSort,
  } = await searchParams;
  const sort: AssignmentSort = ASSIGNMENT_SORTS.includes(rawSort as AssignmentSort)
    ? (rawSort as AssignmentSort)
    : "newest";
  const teachers = isAdmin
    ? [...new Map(all.map((a) => [a.class.teacher.id, a.class.teacher.name])).entries()].sort((x, y) =>
        x[1].localeCompare(y[1], "vi")
      )
    : [];
  const byTeacher =
    isAdmin && teacherFilter ? all.filter((a) => a.class.teacher.id === teacherFilter) : all;

  // options for the filter bar come from the teacher-filtered list
  const classOptions = [...new Map(byTeacher.map((a) => [a.class.id, a.class.name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((x, y) => x.name.localeCompare(y.name, "vi"));
  const monthOptions = [...new Set(byTeacher.map((a) => monthKey(a.createdAt)))].sort().reverse();

  const needle = foldText(rawQuery?.trim() ?? "");
  const assignments = byTeacher
    .filter((a) => !classFilter || a.class.id === classFilter)
    .filter((a) => !monthFilter || monthKey(a.createdAt) === monthFilter)
    .filter(
      (a) =>
        !needle ||
        foldText(`${a.title} ${a.class.name} ${a.worksheet.title} ${a.class.teacher.name}`).includes(needle)
    )
    .sort((x, y) => {
      const due = (d: Date | null, missing: number) => (d ? d.getTime() : missing);
      switch (sort) {
        case "oldest":
          return x.createdAt.getTime() - y.createdAt.getTime();
        case "due_asc":
          return due(x.dueAt, Infinity) - due(y.dueAt, Infinity);
        case "due_desc":
          return due(y.dueAt, -Infinity) - due(x.dueAt, -Infinity);
        case "class":
          return (
            x.class.name.localeCompare(y.class.name, "vi", { numeric: true }) || y.createdAt.getTime() - x.createdAt.getTime()
          );
        case "title":
          return x.title.localeCompare(y.title, "vi", { numeric: true });
        default:
          return y.createdAt.getTime() - x.createdAt.getTime();
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.nav.assignments}</h1>
          <p className="mt-0.5 text-sm text-[#464555]">
            {isAdmin
              ? tr(
                  `Tất cả bài tập đã giao trong hệ thống (${all.length}).`,
                  `Every assignment in the system (${all.length}).`
                )
              : tr("Quản lý bài tập đã giao, giám sát phòng thi trực tiếp và chấm điểm.", "Manage assigned work, run live exams and grade.")}
          </p>
        </div>
        <Button variant="accent" asChild>
          <Link href="/teacher/assignments/new">
            <Plus className="h-4 w-4" />
            {tr("Giao bài tập mới", "New assignment")}
          </Link>
        </Button>
      </div>

      {isAdmin && teachers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#464555]">{tr("Giáo viên:", "Teacher:")}</span>
          <Link
            href="/teacher/assignments"
            className={
              !teacherFilter
                ? "rounded-full bg-[#4F46E5] px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-[#464555] hover:bg-[#EFF4FF]"
            }
          >
            {tr("Tất cả", "All")}
          </Link>
          {teachers.map(([id, name]) => (
            <Link
              key={id}
              href={`/teacher/assignments?teacher=${id}`}
              className={
                teacherFilter === id
                  ? "rounded-full bg-[#4F46E5] px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-[#464555] hover:bg-[#EFF4FF]"
              }
            >
              {name}
            </Link>
          ))}
        </div>
      )}

      {byTeacher.length > 0 && (
        <AssignmentListFilters
          classes={classOptions}
          months={monthOptions}
          shown={assignments.length}
          total={byTeacher.length}
        />
      )}

      {assignments.length === 0 ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {byTeacher.length === 0
            ? tr("Chưa có bài tập nào được giao.", "No assignments yet.")
            : tr("Không có bài tập nào khớp bộ lọc.", "No assignments match the filters.")}
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
                    {isAdmin && a.class.teacher.id !== user.id && (
                      <Badge variant="neutral">
                        {tr("GV:", "Teacher:")} {a.class.teacher.name}
                      </Badge>
                    )}
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
                    <span>{tr("Giao:", "Assigned:")} {formatDateTime(a.createdAt)}</span>
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
