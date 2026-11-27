import { LiveQuizHostScreen } from "@/components/live-quiz/LiveQuizHostScreen";

export default async function LiveQuizHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveQuizHostScreen sessionId={id} />;
}
