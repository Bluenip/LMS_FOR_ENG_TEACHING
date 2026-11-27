import Link from "next/link";
import { Wrench } from "lucide-react";
import { getActiveBanner } from "@/server/adminSystemOpsService";
import { getRequestLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [banner, locale] = await Promise.all([getActiveBanner(true), getRequestLocale()]);
  const en = locale === "en";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F8F9FF] px-4 dark:bg-slate-950">
      <div className="stitch-card max-w-md space-y-3 p-8 text-center" data-testid="maintenance-page">
        <Wrench className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-bold">{en ? "Pivora is under maintenance" : "Pivora đang bảo trì"}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {banner?.message || (en ? "Please come back in a few minutes." : "Vui lòng quay lại sau ít phút.")}
        </p>
        <Link href="/login" className="text-sm font-semibold text-[#4F46E5] hover:underline">
          {en ? "Back to sign in" : "Về trang đăng nhập"}
        </Link>
      </div>
    </main>
  );
}
