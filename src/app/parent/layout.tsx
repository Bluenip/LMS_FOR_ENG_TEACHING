import { RoleShell } from "@/components/layout/RoleShell";
import { requireLayoutUser } from "@/lib/permissions";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLayoutUser(["PARENT"]);
  return (
    <RoleShell user={user} section="parent">
      {children}
    </RoleShell>
  );
}
