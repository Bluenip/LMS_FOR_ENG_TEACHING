import { Eye } from "lucide-react";
import { getAppName } from "@/lib/utils";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { getI18n } from "@/lib/i18n/server";
import { requireLayoutUser } from "@/lib/permissions";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { m: vi, tr } = await getI18n();
  const user = await requireLayoutUser(["PARENT"]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FF]">
      <AppNavbar
        appName={getAppName()}
        user={{
          id: user.id,
          name: user.name || tr("Phụ huynh", "Parent"),
          email: user.email,
          role: user.role,
        }}
        topBanner={
          <div className="flex items-center justify-center gap-2 bg-[#EFF4FF] px-4 py-1.5 text-xs font-medium text-[#3525CD]">
            <Eye className="h-3.5 w-3.5" />
            <span>{vi.parent.banner}</span>
          </div>
        }
        links={[
          { href: "/parent", label: vi.nav.parentOverview, exact: true },
        ]}
      />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
