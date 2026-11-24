import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorksheetForTeacher } from "@/server/worksheetService";
import { WorksheetEditor } from "@/components/worksheet/WorksheetEditor";
import type { EditorFieldDTO } from "@/components/worksheet/types";
import type { FieldOption, FieldStyle, GradingOptions } from "@/lib/grading/types";

export default async function WorksheetEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  try {
    const ws = await getWorksheetForTeacher(id);
    if (session.user.role !== "ADMIN" && ws.ownerId !== session.user.id) {
      redirect("/teacher/worksheets");
    }

    const fields: EditorFieldDTO[] = ws.fields.map((f) => ({
      id: f.id,
      isPersisted: true,
      placement: f.placement,
      type: f.type,
      label: f.label,
      prompt: f.prompt,
      explanation: f.explanation,
      skillTag: f.skillTag,
      order: f.order,
      points: f.points,
      pageIndex: f.pageIndex,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      style: (f.style as FieldStyle | null) ?? null,
      options: (f.options as FieldOption[] | null) ?? null,
      answerKey: (f.answerKey as Record<string, unknown>) ?? {},
      gradingOpts: (f.gradingOpts as GradingOptions | null) ?? null,
    }));

    return (
      <WorksheetEditor
        initialWorksheet={{
          id: ws.id,
          title: ws.title,
          instructions: ws.instructions,
          pdfFileKey: ws.pdfFileKey,
          pageCount: ws.pageCount,
          pages: ws.pages,
          fields,
        }}
      />
    );
  } catch {
    notFound();
  }
}
