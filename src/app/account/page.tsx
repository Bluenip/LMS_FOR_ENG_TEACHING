import { requireLayoutUser } from "@/lib/permissions";
import { getHomeForRole } from "@/lib/utils";
import { getOwnProfile } from "@/server/accountService";
import { AccountClient } from "./AccountClient";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const user = await requireLayoutUser(undefined, { allowPendingPasswordChange: true });
  const [profile, { force }] = await Promise.all([getOwnProfile(user.id), searchParams]);
  return (
    <AccountClient
      initialUser={profile}
      homeHref={getHomeForRole(user.role)}
      forced={force === "1"}
    />
  );
}
