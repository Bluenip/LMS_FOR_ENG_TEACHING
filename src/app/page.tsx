import { redirect } from "next/navigation";
import { requireLayoutUser } from "@/lib/permissions";
import { getHomeForRole } from "@/lib/utils";

export default async function HomePage() {
  const user = await requireLayoutUser();
  redirect(getHomeForRole(user.role));
}
