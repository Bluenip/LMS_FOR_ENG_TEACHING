import { Eye } from "lucide-react";
import type { Role } from "@prisma/client";
import { getAppName } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import type { LayoutUser } from "@/lib/permissions";
import { AppNavbar, type NavLinkItem } from "./AppNavbar";
import { SystemBanner } from "./SystemBanner";

/** Which area of the app the page belongs to — decides the navbar links. */
export type ShellSection = "admin" | "teacher" | "student" | "parent";

export function sectionForRole(role: Role): ShellSection {
  switch (role) {
    case "ADMIN":
      return "admin";
    case "TEACHER":
      return "teacher";
    case "PARENT":
      return "parent";
    default:
      return "student";
  }
}

/**
 * Page chrome shared by every signed-in area (role layouts and /account):
 * navbar with the section's links + a centred main column.
 */
export async function RoleShell({
  user,
  section = sectionForRole(user.role),
  children,
}: {
  user: LayoutUser;
  section?: ShellSection;
  children: React.ReactNode;
}) {
  const { m, tr } = await getI18n();

  let links: NavLinkItem[];
  let fallbackName: string;
  let topBanner: React.ReactNode = undefined;

  switch (section) {
    case "admin":
      fallbackName = tr("Quản trị viên", "Administrator");
      links = [
        { href: "/admin", label: m.nav.adminOverview, exact: true },
        { href: "/admin/moderation", label: tr("Kiểm duyệt", "Moderation") },
        { href: "/admin/audit", label: tr("Nhật ký hoạt động", "Audit log") },
        { href: "/admin/errors", label: tr("Nhật ký lỗi", "Error log") },
        { href: "/admin/terms", label: tr("Học kỳ", "Terms") },
        { href: "/admin/system", label: tr("Hệ thống", "System") },
        { href: "/teacher", label: tr("Giao diện Giáo viên", "Teacher view") },
      ];
      break;
    case "teacher":
      fallbackName = tr("Giáo viên", "Teacher");
      links = [
        ...(user.role === "ADMIN"
          ? [{ href: "/admin", label: m.nav.adminOverview, exact: true }]
          : []),
        { href: "/teacher", label: m.nav.classes, exact: true, activePrefixes: ["/teacher/classes"] },
        { href: "/teacher/schedule", label: tr("Lịch dạy", "Schedule") },
        { href: "/teacher/worksheets", label: m.nav.worksheets },
        { href: "/teacher/question-bank", label: tr("Ngân hàng câu", "Question bank") },
        { href: "/discover", label: tr("Khám phá", "Discover") },
        { href: "/teacher/assignments", label: m.nav.assignments },
        { href: "/teacher/exams", label: tr("Kỳ thi", "Exams") },
        { href: "/teacher/settings", label: tr("Cài đặt", "Settings") },
      ];
      break;
    case "parent":
      fallbackName = tr("Phụ huynh", "Parent");
      links = [
        { href: "/parent", label: m.nav.parentOverview, exact: true },
        { href: "/messages", label: tr("Tin nhắn", "Messages") },
      ];
      topBanner = (
        <div className="flex items-center justify-center gap-2 bg-[#EFF4FF] px-4 py-1.5 text-center text-xs font-medium text-[#3525CD]">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span>{m.parent.banner}</span>
        </div>
      );
      break;
    default:
      fallbackName = tr("Học sinh", "Student");
      links = [
        { href: "/student", label: m.nav.dashboard, exact: true },
        { href: "/student/classes", label: m.nav.classes },
        { href: "/student/schedule", label: tr("Lịch học", "Schedule") },
        { href: "/student/flashcards", label: tr("Flashcard", "Flashcards") },
        { href: "/student/mistakes", label: tr("Ôn câu sai", "Mistakes") },
        { href: "/live", label: "Live Quiz" },
      ];
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FF]">
      <SystemBanner />
      <AppNavbar
        appName={getAppName()}
        user={{
          id: user.id,
          name: user.name || fallbackName,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
        }}
        topBanner={topBanner}
        links={links}
      />
      <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
