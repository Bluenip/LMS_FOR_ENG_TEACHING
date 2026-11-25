import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireLayoutUser } from "@/lib/permissions";
import { getAppName, getHomeForRole } from "@/lib/utils";
import { LandingPage } from "@/components/landing/LandingPage";

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    const user = await requireLayoutUser();
    redirect(getHomeForRole(user.role));
  }

  return <LandingPage appName={getAppName()} />;
}
