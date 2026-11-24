import { RoleShell } from "@/components/layout/RoleShell";
import { requireLayoutUser } from "@/lib/permissions";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLayoutUser(["TEACHER", "ADMIN"]);
  return (
    <RoleShell user={user} section="teacher">
      {children}
    </RoleShell>
  );
}
