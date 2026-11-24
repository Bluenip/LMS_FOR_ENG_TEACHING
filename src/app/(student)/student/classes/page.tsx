import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Trophy, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { listStudentClasses } from "@/server/classService";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function StudentClassesPage() {
  const { tr } = await getI18n();
  const session = await auth();
  if (!session?.user) redirect("/login");
  const classes = await listStudentClasses(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1C30]">{tr("Lớp học của tôi", "My classes")}</h1>
        <p className="mt-0.5 text-sm text-[#464555]">
          {tr("Các lớp học bạn đang tham gia. Bạn có thể nhập mã lớp mới ngay tại trang Tổng quan.", "Classes you have joined. You can enter a new class code on the Dashboard.")}
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-3">
          <p className="text-sm text-slate-500">{tr("Bạn chưa tham gia lớp học nào.", "You have not joined any class yet.")}</p>
          <Button asChild>
            <Link href="/student">{tr("Quay lại trang Tổng quan để nhập mã lớp", "Go to the Dashboard to enter a class code")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <div key={cls.id} className="stitch-card-hover p-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-lg font-bold text-[#0B1C30]">{cls.name}</h3>
                <p className="mt-1 text-xs font-semibold text-[#4F46E5]">
                  {tr("GV:", "Teacher:")} {cls.teacher.name}
                </p>
                {cls.description && (
                  <p className="mt-2 text-xs text-[#464555] line-clamp-2">{cls.description}</p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-4 w-4" /> {cls._count.enrollments} {tr("học sinh", "students")}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/student/classes/${cls.id}/leaderboard`}>
                      <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={`/student/classes/${cls.id}`}>
                      {tr("Vào lớp", "Open class")} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
