import { OmrSheetList } from "@/components/omr/OmrSheetList";

export default async function ClassOmrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OmrSheetList classId={id} />;
}
