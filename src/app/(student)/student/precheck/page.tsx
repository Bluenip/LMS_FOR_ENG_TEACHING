import { PreCheckClient } from "@/components/assignments/PreCheckClient";

export default async function PreCheckPage({ searchParams }: { searchParams: Promise<{ assignmentId?: string }> }) {
  const { assignmentId } = await searchParams;
  return <PreCheckClient assignmentId={assignmentId ?? null} />;
}
