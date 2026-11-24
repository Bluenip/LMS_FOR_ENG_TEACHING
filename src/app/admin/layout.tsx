import { RoleShell } from "@/components/layout/RoleShell";
import { requireLayoutUser } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLayoutUser(["ADMIN"]);
  return (
    <RoleShell user={user} section="admin">
      {children}
    </RoleShell>
  );
}
