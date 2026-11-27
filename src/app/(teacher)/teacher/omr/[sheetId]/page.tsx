import { OmrSheetDetail } from "@/components/omr/OmrSheetDetail";

export default async function OmrSheetPage({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  return <OmrSheetDetail sheetId={sheetId} />;
}
