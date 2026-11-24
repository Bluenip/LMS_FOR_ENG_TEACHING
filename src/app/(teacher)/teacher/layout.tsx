import { getAppName } from "@/lib/utils";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { getI18n } from "@/lib/i18n/server";
import { requireLayoutUser } from "@/lib/permissions";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { m: vi, tr } = await getI18n();
  const user = await requireLayoutUser(["TEACHER", "ADMIN"]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FF]">
      <AppNavbar
        appName={getAppName()}
        user={{
          id: user.id,
          name: user.name || tr("Giáo viên", "Teacher"),
          email: user.email,
          role: user.role,
        }}
        links={[
          ...(user.role === "ADMIN"
            ? [{ href: "/admin", label: vi.nav.adminOverview, exact: true }]
            : []),
          {
            href: "/teacher",
            label: vi.nav.classes,
            exact: true,
            activePrefixes: ["/teacher/classes"],
          },
          { href: "/teacher/worksheets", label: vi.nav.worksheets },
          { href: "/teacher/assignments", label: vi.nav.assignments },
          { href: "/teacher/settings", label: tr("Cài đặt", "Settings") },
        ]}
      />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
