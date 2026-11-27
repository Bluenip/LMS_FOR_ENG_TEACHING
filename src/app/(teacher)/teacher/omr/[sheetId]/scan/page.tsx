import { OmrScanner } from "@/components/omr/OmrScanner";

export default async function OmrScanPage({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  return <OmrScanner sheetId={sheetId} />;
}
