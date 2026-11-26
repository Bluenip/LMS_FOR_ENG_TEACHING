import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorksheetForTeacher } from "@/server/worksheetService";
import { WorksheetEditor } from "@/components/worksheet/WorksheetEditor";
import type { EditorFieldDTO, WorksheetPassageDTO } from "@/components/worksheet/types";
import type {
  FieldOption,
  FieldStyle,
  GradingOptions,
  RubricCriterion,
} from "@/lib/grading/types";

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
      passageId: f.passageId,
      audioId: f.audioId,
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
      rubric: Array.isArray(f.rubric) ? (f.rubric as unknown as RubricCriterion[]) : null,
    }));

    return (
      <WorksheetEditor
        initialWorksheet={{
          id: ws.id,
          title: ws.title,
          subject: ws.subject,
          instructions: ws.instructions,
          passages: Array.isArray(ws.passages) ? (ws.passages as unknown as WorksheetPassageDTO[]) : [],
          pdfFileKey: ws.pdfFileKey,
          pageCount: ws.pageCount,
          isShared: ws.isShared,
          pages: ws.pages,
          fields,
          storageLocations: ws.storageLocations,
          audios: ws.audios.map((a) => ({
            id: a.id,
            title: a.title,
            fileKey: a.fileKey,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            durationSec: a.durationSec,
            order: a.order,
          })),
        }}
      />
    );
  } catch {
    notFound();
  }
}
