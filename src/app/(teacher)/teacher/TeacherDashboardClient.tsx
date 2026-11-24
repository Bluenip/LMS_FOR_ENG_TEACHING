"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  FilePlus2,
  GraduationCap,
  PieChart,
  Plus,
  Radio,
  Users,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeacherDashboardClientProps {
  teacherName: string;
  /** admin: the list holds every class, labelled with its teacher */
  isAdmin?: boolean;
  stats: {
    totalStudents: number;
    activeClassCount: number;
    pendingManual: number;
    submissionRate: number;
  };
  classes: Array<{
    id: string;
    name: string;
    description: string | null;
    joinCode: string;
    archived: boolean;
    studentCount: number;
    assignmentCount: number;
    /** set when the class belongs to another teacher (admin view) */
    teacherName?: string | null;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    className: string;
    classId: string;
    dueAt: string | null;
    proctorMode: string;
    submittedCount: number;
    totalStudents: number;
    pendingCount: number;
  }>;
}

const CARD_GRADIENTS = [
  "from-[#3525CD] via-[#4F46E5] to-[#6366F1]",
  "from-[#0F766E] via-[#0D9488] to-[#14B8A6]",
  "from-[#C2410C] via-[#EA580C] to-[#F97316]",
  "from-[#4338CA] via-[#6D28D9] to-[#7C3AED]",
];

export function TeacherDashboardClient({
  teacherName,
  isAdmin = false,
  stats,
  classes,
  assignments,
}: TeacherDashboardClientProps) {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [createWsOpen, setCreateWsOpen] = useState(false);

  const [className, setClassName] = useState("");
  const [classDesc, setClassDesc] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [wsTitle, setWsTitle] = useState("");
  const [wsInstructions, setWsInstructions] = useState("");

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: className,
          description: classDesc || null,
          requireApproval,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tạo lớp thất bại", "Could not create the class"));
      toast.success(tr(`Đã tạo lớp "${json.class.name}" (Mã: ${json.class.joinCode})`, `Created class "${json.class.name}" (code: ${json.class.joinCode})`));
      setCreateClassOpen(false);
      setClassName("");
      setClassDesc("");
      setRequireApproval(false);
      router.push(`/teacher/classes/${json.class.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWorksheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: wsTitle,
          instructions: wsInstructions || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tạo worksheet thất bại", "Could not create the worksheet"));
      toast.success(tr("Đã tạo Worksheet! Đang mở trình biên tập…", "Worksheet created! Opening the editor…"));
      setCreateWsOpen(false);
      router.push(`/teacher/worksheets/${json.worksheet.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Stitch Hero Greeting */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1C30]">
            {tr("Xin chào", "Hello")} {teacherName}!
          </h1>
          <p className="mt-1 text-sm text-[#464555]">
            {tr("Chúc bạn một ngày giảng dạy hiệu quả và nhiều cảm hứng cùng các lớp học.", "Have a productive and inspiring day of teaching.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={() => setCreateClassOpen(true)}>
            <Plus className="h-4 w-4" />
            {vi.classes.createClass}
          </Button>
          <Button variant="accent" onClick={() => setCreateWsOpen(true)}>
            <FilePlus2 className="h-4 w-4" />
            {vi.worksheets.createWorksheet}
          </Button>
        </div>
      </div>

      {/* Stitch 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stitch-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#464555]">{tr("Học sinh", "Students")}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
              <GraduationCap className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-[#0B1C30] tabular-nums">
            {stats.totalStudents}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">{tr("Đang theo học các lớp", "Enrolled in your classes")}</p>
        </div>

        <div className="stitch-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#464555]">{tr("Lớp đang dạy", "Classes taught")}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E5EEFF] text-[#3525CD]">
              <BookOpen className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-[#0B1C30] tabular-nums">
            {stats.activeClassCount}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#3525CD]">
            <CheckCircle2 className="h-3.5 w-3.5" /> {tr("Đang hoạt động", "Active")}
          </p>
        </div>

        <div className="stitch-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#464555]">{tr("Bài chờ chấm tay", "Awaiting manual grading")}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#EA580C]">
              <ClipboardCheck className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-[#0B1C30] tabular-nums">
            {stats.pendingManual}
          </p>
          <p className="mt-1 text-xs font-medium text-[#EA580C]">
            {stats.pendingManual > 0 ? tr("Cần chấm phần tự luận", "Essay answers to grade") : tr("Đã chấm hết bài", "All graded")}
          </p>
        </div>

        <div className="stitch-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#464555]">{tr("Tỉ lệ nộp bài", "Submission rate")}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#15803D]">
              <PieChart className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-[#0B1C30] tabular-nums">
            {stats.submissionRate}%
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700">{tr("Trên các bài đã giao", "Across assigned work")}</p>
        </div>
      </div>

      {/* My Classes Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-[#0B1C30]">
              {isAdmin ? tr("Tất cả lớp học", "All classes") : vi.classes.title}
            </h2>
            <Badge variant="neutral">
              {classes.length} {tr("lớp", "class(es)")}
              {isAdmin && tr(" · toàn hệ thống", " · whole system")}
            </Badge>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="stitch-card p-10 text-center">
            <p className="text-sm text-slate-500">{tr("Bạn chưa có lớp học nào.", "You do not have any classes yet.")}</p>
            <Button className="mt-3" onClick={() => setCreateClassOpen(true)}>
              <Plus className="h-4 w-4" />
              {vi.classes.createClass}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {classes.map((cls, idx) => (
              <div key={cls.id} className="stitch-card-hover overflow-hidden flex flex-col">
                <div
                  className={`relative h-28 bg-gradient-to-br ${CARD_GRADIENTS[idx % CARD_GRADIENTS.length]} p-4 text-white`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur">
                      {cls.assignmentCount} {tr("bài tập", "assignments")}
                    </span>
                    <span className="rounded-full bg-emerald-400/90 px-2.5 py-0.5 text-[11px] font-bold text-emerald-950">
                      {cls.archived ? tr("Đã lưu trữ", "Archived") : tr("• Đang diễn ra", "• Running")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1C30] line-clamp-1">
                      {cls.name}
                    </h3>
                    {cls.teacherName && (
                      <p className="mt-0.5 text-xs font-semibold text-[#4F46E5]">
                        {tr("GV:", "Teacher:")} {cls.teacherName}
                      </p>
                    )}
                    {cls.description && (
                      <p className="mt-1 text-xs text-[#464555] line-clamp-2">
                        {cls.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F8F9FF] px-3 py-2 text-xs">
                      <span className="text-slate-500">{tr("Mã tham gia lớp:", "Join code:")}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(cls.joinCode);
                          toast.success(tr(`Đã sao chép mã ${cls.joinCode}`, `Copied code ${cls.joinCode}`));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF2FF] px-2.5 py-1 font-mono font-bold text-[#3525CD] hover:bg-[#E2DFFF]"
                      >
                        {cls.joinCode}
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#464555]">
                      <Users className="h-4 w-4 text-slate-400" />
                      {cls.studentCount} {tr("học sinh", "students")}
                    </span>
                    <Button size="sm" asChild>
                      <Link href={`/teacher/classes/${cls.id}`}>
                        {tr("Vào lớp", "Open class")} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assignments Table */}
      <section className="stitch-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-base font-bold text-[#0B1C30]">
              {tr("Bài tập & Worksheet gần đây", "Recent assignments & worksheets")}
            </h2>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/teacher/assignments/new">
              <Plus className="h-4 w-4" />
              {tr("Giao bài mới", "New assignment")}
            </Link>
          </Button>
        </div>

        {assignments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">{tr("Chưa có bài tập nào được giao.", "No assignments yet.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F8F9FF] text-xs font-bold uppercase text-[#464555]">
                <tr>
                  <th className="px-6 py-3">{tr("Tên bài tập", "Assignment")}</th>
                  <th className="px-6 py-3">{tr("Lớp", "Class")}</th>
                  <th className="px-6 py-3">{tr("Hạn nộp", "Due")}</th>
                  <th className="px-6 py-3">{tr("Đã nộp", "Submitted")}</th>
                  <th className="px-6 py-3 text-right">{tr("Thao tác", "Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((a) => {
                  const pct =
                    a.totalStudents > 0
                      ? Math.min(100, Math.round((a.submittedCount / a.totalStudents) * 100))
                      : 0;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4 font-semibold text-[#0B1C30]">
                        <div className="flex items-center gap-2">
                          <span>{a.title}</span>
                          {a.proctorMode !== "OFF" && (
                            <Badge variant="danger" className="text-[10px]">
                              {tr("Giám sát", "Proctored")}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-[#464555]">{a.className}</td>
                      <td className="px-6 py-4 text-xs text-[#464555] tabular-nums">
                        {formatDateTime(a.dueAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-[#3525CD] tabular-nums">
                            <span>
                              {a.submittedCount}/{a.totalStudents} {tr("hs", "students")}
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#4F46E5]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          {a.proctorMode !== "OFF" && (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/teacher/assignments/${a.id}/live`}>
                                <Radio className="h-3.5 w-3.5 text-red-500" />
                                Live
                              </Link>
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" asChild>
                            <Link href={`/teacher/assignments/${a.id}/grading`}>
                              {a.pendingCount > 0 ? tr(`Chấm bài (${a.pendingCount})`, `Grade (${a.pendingCount})`) : tr("Xem kết quả", "View results")}
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Class Dialog */}
      <Dialog open={createClassOpen} onOpenChange={setCreateClassOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.classes.createClass}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateClass} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{vi.classes.name}</Label>
              <Input
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder={tr("VD: Tiếng Anh 11 - Nâng cao", "e.g. English 11 - Advanced")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{vi.classes.description}</Label>
              <Textarea
                value={classDesc}
                onChange={(e) => setClassDesc(e.target.value)}
                placeholder={tr("Mô tả mục tiêu khoá học…", "Describe the course goals…")}
                rows={3}
              />
            </div>
            <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
              <span className="text-xs font-semibold text-[#0B1C30]">
                {vi.classes.requireApproval}
              </span>
              <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateClassOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {tr("Tạo lớp", "Create class")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Worksheet Dialog */}
      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{vi.worksheets.createWorksheet}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateWorksheet} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{vi.worksheets.worksheetTitle}</Label>
              <Input
                required
                value={wsTitle}
                onChange={(e) => setWsTitle(e.target.value)}
                placeholder="VD: Unit 8: Wildlife Conservation - Practice Test"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{vi.worksheets.instructions}</Label>
              <Textarea
                value={wsInstructions}
                onChange={(e) => setWsInstructions(e.target.value)}
                placeholder={tr("Hướng dẫn học sinh làm bài…", "Instructions for students…")}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateWsOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" disabled={submitting}>
                {tr("Tạo & Mở Editor", "Create & open editor")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
