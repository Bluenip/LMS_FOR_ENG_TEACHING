"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { BarChart3, Clock, Layers, Loader2, Plus, Radio, ShieldAlert, Users } from "lucide-react";
import type { ProctorMode } from "@prisma/client";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExamSessionSummary {
  id: string;
  title: string;
  openAt: string | null;
  dueAt: string | null;
  timeLimitMin: number | null;
  createdAt: string;
  owner: { id: string; name: string };
  worksheet: { id: string; title: string; questionCount: number };
  classCount: number;
  totalStudents: number;
  totalSubmissions: number;
  variantCount: number;
  assignments: Array<{
    id: string;
    classId: string;
    className: string;
    studentCount: number;
    submissionCount: number;
    variantCount: number;
  }>;
}

interface WorksheetOpt {
  id: string;
  title: string;
  _count: { fields: number };
}

interface ClassOpt {
  id: string;
  name: string;
  _count: { enrollments: number };
}

export default function TeacherExamsPage() {
  const { tr } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: examsData, isLoading } = useQuery<{ sessions: ExamSessionSummary[] }>({
    queryKey: ["exam-sessions"],
    queryFn: () =>
      apiFetchJson<{ sessions: ExamSessionSummary[] }>(
        "/api/exams",
        undefined,
        tr("Không tải được danh sách kỳ thi", "Could not load exam sessions")
      ),
  });

  const { data: wsData } = useQuery<{
    worksheets: WorksheetOpt[];
    sharedWorksheets?: WorksheetOpt[];
  }>({
    queryKey: ["teacher-worksheets"],
    queryFn: () => apiFetchJson("/api/worksheets"),
  });

  const { data: clsData } = useQuery<{ classes: ClassOpt[] }>({
    queryKey: ["teacher-classes"],
    queryFn: () => apiFetchJson("/api/classes"),
  });

  const worksheets = useMemo(
    () => [...(wsData?.worksheets ?? []), ...(wsData?.sharedWorksheets ?? [])],
    [wsData]
  );
  const classes = clsData?.classes ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [worksheetId, setWorksheetId] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [variantCount, setVariantCount] = useState(4);
  const [timeLimitMin, setTimeLimitMin] = useState("45");
  const [proctorMode, setProctorMode] = useState<ProctorMode>("MONITOR");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!worksheetId && worksheets.length > 0) {
      setWorksheetId(worksheets[0]!.id);
    }
  }, [worksheetId, worksheets]);

  const toggleClass = (cid: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !worksheetId || selectedClassIds.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          worksheetId,
          classIds: selectedClassIds,
          variantCount,
          timeLimitMin: Number(timeLimitMin) || 45,
          proctorMode,
          showResult: "AFTER_SUBMIT",
          showAnswerKey: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tạo kỳ thi thất bại", "Could not create exam session"));

      toast.success(
        tr(
          `Đã tạo kỳ thi liên lớp cho ${json.assignments.length} lớp!`,
          `Created multi-class exam session for ${json.assignments.length} class(es)!`
        )
      );
      setCreateOpen(false);
      setTitle("");
      setSelectedClassIds([]);
      await queryClient.invalidateQueries({ queryKey: ["exam-sessions"] });
      router.push(`/teacher/exams/${json.session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tạo kỳ thi thất bại", "Could not create exam session"));
    } finally {
      setCreating(false);
    }
  };

  const sessions = examsData?.sessions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Kỳ thi liên lớp", "Multi-class Exams")}
          </h1>
          <p className="mt-1 text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Tổ chức 1 kỳ thi đồng bộ nhiều lớp từ 1 đề chuẩn, sinh nhiều mã đề, giám sát Live và tổng hợp báo cáo chung.",
              "Run synchronized multi-class exams with randomized variants, unified proctoring, and cross-class reporting."
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="accent"
          className="min-h-10"
          data-testid="create-exam-session-btn"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {tr("Tổ chức Kỳ thi liên lớp", "New Multi-class Exam")}
        </Button>
      </div>

      {isLoading ? (
        <div className="stitch-card flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Đang tải danh sách kỳ thi…", "Loading exams…")}
        </div>
      ) : sessions.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-3">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
            {tr("Chưa có kỳ thi liên lớp nào.", "No multi-class exams yet.")}
          </p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="exam-sessions-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              data-testid={`exam-session-card-${s.id}`}
              className="stitch-card p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">{s.title}</h2>
                  {s.variantCount > 1 && (
                    <Badge variant="indigo">{s.variantCount} {tr("mã đề", "variants")}</Badge>
                  )}
                </div>
                <p className="text-xs text-[#464555] dark:text-slate-400">
                  {tr("Phiếu đề:", "Worksheet:")} <strong>{s.worksheet.title}</strong> ({s.worksheet.questionCount}{" "}
                  {tr("câu", "questions")})
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-[#4F46E5]" />
                    {s.classCount} {tr("lớp", "classes")} • {s.totalSubmissions}/{s.totalStudents}{" "}
                    {tr("bài nộp", "submitted")}
                  </span>
                  {s.timeLimitMin && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-[#F97316]" />
                      {s.timeLimitMin} {tr("phút", "min")}
                    </span>
                  )}
                  {s.dueAt && <span>{tr("Hạn:", "Due:")} {formatDateTime(s.dueAt)}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.assignments.map((a) => (
                    <Badge key={a.id} variant="neutral">
                      {a.className} ({a.submissionCount}/{a.studentCount})
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" className="min-h-10" asChild>
                  <Link href={`/teacher/exams/${s.id}?tab=live`}>
                    <Radio className="h-4 w-4 text-red-500" />
                    {tr("Giám sát Live", "Live Monitor")}
                  </Link>
                </Button>
                <Button variant="accent" className="min-h-10" asChild>
                  <Link href={`/teacher/exams/${s.id}?tab=report`}>
                    <BarChart3 className="h-4 w-4" />
                    {tr("Báo cáo liên lớp", "Cross-class Report")}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Exam Session Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          data-testid="create-exam-dialog"
          className="max-w-xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[#4F46E5]" />
              {tr("Tổ chức Kỳ thi liên lớp", "Create Multi-class Exam")}
            </DialogTitle>
            <DialogDescription>
              {tr(
                "Chọn 1 đề gốc và nhiều lớp tham gia. Hệ thống sinh mã đề ngẫu nhiên và đồng bộ cấu hình giám sát.",
                "Select one worksheet and multiple classes with unified variants and proctoring."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exam-title-input">{tr("Tên kỳ thi", "Exam title")}</Label>
              <Input
                id="exam-title-input"
                data-testid="exam-title-input"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr("VD: Thi Giữa Kỳ I Khối 12", "e.g. Midterm Exam Grade 12")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exam-worksheet-select">{tr("Chọn phiếu đề chuẩn", "Worksheet")}</Label>
              <select
                id="exam-worksheet-select"
                data-testid="exam-worksheet-select"
                value={worksheetId}
                onChange={(e) => setWorksheetId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
              >
                {worksheets.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.title} ({ws._count.fields} {tr("câu", "q")})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>{tr("Các lớp tham gia thi", "Participating classes")}</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {classes.map((cls) => {
                  const checked = selectedClassIds.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      data-testid={`exam-class-toggle-${cls.id}`}
                      onClick={() => toggleClass(cls.id)}
                      className={`min-h-10 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                        checked
                          ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD] dark:bg-indigo-950/60 dark:text-indigo-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div>{cls.name}</div>
                      <div className="text-[11px] font-normal text-slate-400">
                        {cls._count.enrollments} {tr("học sinh", "students")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="exam-variant-count-input">{tr("Số mã đề", "Variants")}</Label>
                <Input
                  id="exam-variant-count-input"
                  data-testid="exam-variant-count-input"
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  value={variantCount}
                  onChange={(e) =>
                    setVariantCount(Math.max(1, Math.min(24, Math.floor(Number(e.target.value) || 1))))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exam-time-input">{tr("Thời gian (phút)", "Time (min)")}</Label>
                <Input
                  id="exam-time-input"
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  value={timeLimitMin}
                  onChange={(e) => setTimeLimitMin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exam-proctor-select">{tr("Giám sát thi", "Proctor mode")}</Label>
                <select
                  id="exam-proctor-select"
                  value={proctorMode}
                  onChange={(e) => setProctorMode(e.target.value as ProctorMode)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-sm"
                >
                  <option value="OFF">{tr("Tắt", "Off")}</option>
                  <option value="MONITOR">{tr("Theo dõi", "Monitor")}</option>
                  <option value="LOCKDOWN">{tr("Khoá chặt", "Lockdown")}</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setCreateOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button
                type="submit"
                variant="accent"
                className="min-h-10"
                data-testid="create-exam-submit-btn"
                disabled={creating || !title.trim() || !worksheetId || selectedClassIds.length === 0}
              >
                {creating ? tr("Đang tạo…", "Creating…") : tr("Tạo kỳ thi ngay", "Create exam")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
