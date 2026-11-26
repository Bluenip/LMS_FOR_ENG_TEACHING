import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Grid3X3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRequestLocale } from "@/lib/i18n/server";
import { resolveUserClassRole, hasMinClassRole } from "@/lib/permissions";
import { getWorkbookMatrix } from "@/server/workbookService";
import { BackLink } from "@/components/navigation/BackLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function scoreCellClasses(scoreScale10: number | null, status: string): string {
  if (status === "RETURNED") {
    return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
  }
  if (scoreScale10 === null) {
    return "text-slate-400";
  }
  if (scoreScale10 >= 8) {
    return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold";
  }
  if (scoreScale10 >= 5) {
    return "bg-indigo-50 dark:bg-indigo-950/40 text-[#3525CD] dark:text-indigo-300 font-semibold";
  }
  return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold";
}

export default async function WorkbookMatrixPage({
  params,
}: {
  params: Promise<{ id: string; workbookId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id: classId, workbookId } = await params;
  const locale = await getRequestLocale();
  const tr = (viText: string, enText: string) => (locale === "en" ? enText : viText);

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, teacherId: true, deletedAt: true },
  });
  if (!cls || cls.deletedAt) notFound();

  const role = await resolveUserClassRole(
    cls.id,
    session.user.id,
    session.user.role,
    cls.teacherId
  );
  if (!hasMinClassRole(role, "ASSISTANT")) {
    redirect("/teacher");
  }

  let matrix;
  try {
    matrix = await getWorkbookMatrix(workbookId, classId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6" data-testid="workbook-matrix-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BackLink
            fallbackHref={`/teacher/classes/${classId}?tab=assignments`}
            label={matrix.class.name}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5 text-[#4F46E5] shrink-0" />
              <h1 className="truncate text-xl font-bold text-[#0B1C30] dark:text-slate-100">
                {matrix.workbook.title}
              </h1>
            </div>
            <p className="text-xs text-[#464555] dark:text-slate-400">
              {matrix.class.name} • {matrix.rows.length} {tr("học sinh", "students")} •{" "}
              {matrix.assignments.length} {tr("bài trong lộ trình", "assignments")}
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" asChild className="min-h-10">
          <a
            href={`/api/worksheets/workbooks/${workbookId}/matrix?classId=${classId}&export=xlsx`}
            data-testid="workbook-matrix-export-btn"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            {tr("Xuất Excel ma trận", "Export Excel matrix")}
          </a>
        </Button>
      </div>

      <section className="stitch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="workbook-matrix-table">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-bold uppercase text-[#464555] dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-slate-50 dark:bg-slate-900 min-w-[180px]">
                  {tr("Học sinh", "Student")}
                </th>
                {matrix.assignments.map((asg, idx) => (
                  <th key={asg.id} className="px-4 py-3 text-center min-w-[130px]">
                    <Link
                      href={`/teacher/assignments/${asg.id}/grading`}
                      className="hover:text-[#3525CD] hover:underline"
                    >
                      #{idx + 1} {asg.worksheetTitle}
                    </Link>
                  </th>
                ))}
                <th className="px-4 py-3 text-center">{tr("Hoàn thành", "Completed")}</th>
                <th className="px-4 py-3 text-right">{tr("TB (/10)", "Avg (/10)")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {matrix.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={matrix.assignments.length + 3}
                    className="px-6 py-8 text-center text-sm text-slate-400"
                  >
                    {tr("Lớp chưa có học sinh nào.", "No active students in this class yet.")}
                  </td>
                </tr>
              ) : (
                matrix.rows.map((row) => (
                  <tr key={row.studentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 sticky left-0 bg-white dark:bg-slate-950">
                      <p className="font-semibold text-[#0B1C30] dark:text-slate-100">
                        {row.studentName}
                      </p>
                      <p className="text-[11px] text-slate-400">{row.studentEmail}</p>
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.assignmentId}
                        className={`px-4 py-3 text-center tabular-nums ${scoreCellClasses(
                          cell.scoreScale10,
                          cell.status
                        )}`}
                      >
                        {cell.status === "RETURNED" ? (
                          <Badge variant="orange">{tr("Trả làm lại", "Returned")}</Badge>
                        ) : cell.status === "IN_PROGRESS" ? (
                          <Badge variant="sky">{tr("Đang làm", "In progress")}</Badge>
                        ) : cell.scoreScale10 !== null ? (
                          <Link
                            href={`/teacher/assignments/${cell.assignmentId}/grading`}
                            className="hover:underline"
                          >
                            {cell.scoreScale10}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center font-medium tabular-nums">
                      {row.completedCount}/{row.totalCount}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#3525CD] dark:text-indigo-300 tabular-nums">
                      {row.avgScore10 !== null ? row.avgScore10 : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
