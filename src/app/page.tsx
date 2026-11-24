import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHomeForRole } from "@/lib/utils";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.role) {
    redirect("/login");
  }
  redirect(getHomeForRole(session.user.role));
}
