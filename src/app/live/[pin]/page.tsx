import { notFound } from "next/navigation";
import { getOptionalAuthUser } from "@/lib/permissions";
import { LiveQuizPlayer } from "@/components/live-quiz/LiveQuizPlayer";

export const dynamic = "force-dynamic";

export default async function LivePlayPage({ params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;
  if (!/^\d{6}$/.test(pin)) notFound();
  const user = await getOptionalAuthUser().catch(() => null);
  return <LiveQuizPlayer pin={pin} signedInName={user?.name ?? null} />;
}
