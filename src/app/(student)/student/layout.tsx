import { RoleShell } from "@/components/layout/RoleShell";
import { requireLayoutUser } from "@/lib/permissions";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLayoutUser(["STUDENT"]);
  return (
    <RoleShell user={user} section="student">
      {children}
    </RoleShell>
  );
}
