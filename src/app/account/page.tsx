import { requireLayoutUser } from "@/lib/permissions";
import { getHomeForRole } from "@/lib/utils";
import { AccountClient } from "./AccountClient";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ force?: string }> }) {
  const user = await requireLayoutUser(undefined, { allowPendingPasswordChange: true });
  const { force } = await searchParams;
  return <AccountClient email={user.email} homeHref={getHomeForRole(user.role)} forced={force === "1"} />;
}
