import { Suspense } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { requireLayoutUser } from "@/lib/permissions";
import { MessagesClient } from "@/components/messages/MessagesClient";

export default async function MessagesPage() {
  const user = await requireLayoutUser(["TEACHER", "PARENT", "ADMIN"]);
  return (
    <RoleShell user={user}>
      <Suspense fallback={null}>
        <MessagesClient currentUserId={user.id} currentUserRole={user.role} />
      </Suspense>
    </RoleShell>
  );
}
