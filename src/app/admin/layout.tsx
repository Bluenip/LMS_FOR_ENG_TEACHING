import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAppName } from "@/lib/utils";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { vi } from "@/messages/vi";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FF]">
      <AppNavbar
        appName={getAppName()}
        user={{
          id: session.user.id,
          name: session.user.name ?? "Quản trị viên",
          email: session.user.email ?? "",
          role: session.user.role,
        }}
        links={[
          { href: "/admin", label: vi.nav.adminOverview, exact: true },
          { href: "/teacher", label: "Giao diện Giáo viên" },
        ]}
      />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
