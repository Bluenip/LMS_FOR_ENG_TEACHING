import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAppName } from "@/lib/utils";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { vi } from "@/messages/vi";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "STUDENT") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FF]">
      <AppNavbar
        appName={getAppName()}
        user={{
          id: session.user.id,
          name: session.user.name ?? "Học sinh",
          email: session.user.email ?? "",
          role: session.user.role,
        }}
        links={[
          { href: "/student", label: vi.nav.dashboard, exact: true },
          { href: "/student/classes", label: vi.nav.classes },
        ]}
      />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
