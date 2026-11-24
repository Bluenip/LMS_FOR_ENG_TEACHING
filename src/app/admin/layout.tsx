import { getAppName } from "@/lib/utils";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { getI18n } from "@/lib/i18n/server";
import { requireLayoutUser } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { m: vi, tr } = await getI18n();
  const user = await requireLayoutUser(["ADMIN"]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FF]">
      <AppNavbar
        appName={getAppName()}
        user={{
          id: user.id,
          name: user.name || tr("Quản trị viên", "Administrator"),
          email: user.email,
          role: user.role,
        }}
        links={[
          { href: "/admin", label: vi.nav.adminOverview, exact: true },
          { href: "/teacher", label: tr("Giao diện Giáo viên", "Teacher view") },
        ]}
      />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
