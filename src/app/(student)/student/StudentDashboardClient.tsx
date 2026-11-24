"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Lock,
  PlusCircle,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import { formatDateTime, formatScore } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StudentDashboardProps {
  studentName: string;
  classes: Array<{
    id: string;
    name: string;
    description: string | null;
    teacherName: string;
    studentCount: number;
    assignmentCount: number;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    classId: string;
    className: string;
    teacherName: string;
    dueAt: string | null;
    timeLimitMin: number | null;
    maxAttempts: number;
    questionCount: number;
    proctorMode: string;
    proctorSummary: string | null;
    attemptsUsed: number;
    latestSubmission: {
      id: string;
      status: string;
      totalScore: number | null;
      maxScore: number;
      isLate: boolean;
      lockedAt: string | null;
      submittedAt: string | null;
    } | null;
  }>;
}

export function StudentDashboardClient({
  studentName,
  classes,
  assignments,
}: StudentDashboardProps) {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [parentCodeModal, setParentCodeModal] = useState<string | null>(null);

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Mã lớp không hợp lệ", "Invalid class code"));

      if (json.enrollment?.status === "PENDING") {
        toast.info(vi.classes.joinPending);
      } else {
        toast.success(vi.classes.joinSuccess);
        router.push(`/student/classes/${json.class.id}`);
      }
      setJoinCode("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setJoining(false);
    }
  };

  const handleGenerateParentCode = async () => {
    const res = await fetch("/api/parent/invite-code", { method: "POST" });
    const json = await res.json();
    if (res.ok) {
      setParentCodeModal(json.invite.code);
      toast.success(tr(`Đã tạo mã liên kết phụ huynh: ${json.invite.code}`, `Parent link code created: ${json.invite.code}`));
    } else {
      toast.error(json.error ?? tr("Không thể tạo mã", "Could not create the code"));
    }
  };

  const pendingAssignments = assignments.filter(
    (a) =>
      !a.latestSubmission ||
      a.latestSubmission.status === "IN_PROGRESS"
  );
  const completedAssignments = assignments.filter(
    (a) =>
      a.latestSubmission &&
      (a.latestSubmission.status === "SUBMITTED" ||
        a.latestSubmission.status === "GRADED")
  );

  return (
    <div className="space-y-8">
      {/* Greeting + Join Class Bar + Parent Code */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1C30]">
            {tr("Chào", "Hello")} {studentName}!
          </h1>
          <p className="mt-1 text-sm text-[#464555]">
            {tr("Theo dõi bài tập sắp đến hạn, làm worksheet tương tác và xem bảng xếp hạng lớp.", "Track upcoming assignments, do interactive worksheets and see the class leaderboard.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={handleGenerateParentCode}>
            <KeyRound className="h-4 w-4 text-[#4F46E5]" />
            {tr("Tạo mã cho Phụ huynh", "Create code for parent")}
          </Button>
          <form onSubmit={handleJoinClass} className="flex items-center gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={vi.classes.joinPlaceholder}
              className="h-9 w-52 font-mono text-xs uppercase"
            />
            <Button type="submit" size="sm" disabled={joining}>
              <PlusCircle className="h-4 w-4" />
              {vi.classes.joinButton}
            </Button>
          </form>
        </div>
      </div>

      {/* Pending / Upcoming Assignments */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#F97316]" />
          <h2 className="text-xl font-bold text-[#0B1C30]">
            {tr("Bài tập cần làm (", "To do (")}{pendingAssignments.length})
          </h2>
        </div>

        {pendingAssignments.length === 0 ? (
          <div className="stitch-card p-8 text-center text-sm text-slate-500">
            {tr("Tuyệt vời! Bạn đã hoàn thành tất cả bài tập hiện có.", "Great! You have finished all current assignments.")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pendingAssignments.map((a) => {
              const targetHref =
                a.proctorMode !== "OFF" && !a.latestSubmission
                  ? `/student/assignments/${a.id}/rules`
                  : `/student/assignments/${a.id}/do`;
              return (
                <div
                  key={a.id}
                  className="stitch-card-hover flex flex-col justify-between p-5 space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{a.className}</Badge>
                      {a.proctorMode !== "OFF" && (
                        <Badge variant="danger">
                          <Lock className="h-3 w-3" />
                          {vi.proctor.badge}
                        </Badge>
                      )}
                      {a.latestSubmission?.status === "IN_PROGRESS" && (
                        <Badge variant="orange">{tr("Đang làm dở", "In progress")}</Badge>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-[#0B1C30]">{a.title}</h3>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#464555]">
                      <span>{a.questionCount} {tr("câu", "questions")}</span>
                      {a.timeLimitMin && <span>• {a.timeLimitMin} {tr("phút", "min")}</span>}
                      {a.dueAt && <span>{tr("• Hạn:", "• Due:")} {formatDateTime(a.dueAt)}</span>}
                    </div>

                    {a.proctorSummary && (
                      <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#BA1A1A]">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {a.proctorSummary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-400">{tr("GV:", "Teacher:")} {a.teacherName}</span>
                    <Button variant="accent" size="sm" asChild>
                      <Link href={targetHref}>
                        {a.latestSubmission?.status === "IN_PROGRESS"
                          ? vi.assignments.do.continue
                          : vi.assignments.do.start}{" "}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Completed Assignments */}
      <section className="stitch-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-bold text-[#0B1C30]">
            {tr("Bài đã nộp & Kết quả (", "Submitted & results (")}{completedAssignments.length})
          </h2>
        </div>

        {completedAssignments.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">
            {tr("Bạn chưa nộp bài tập nào.", "You have not submitted any assignment yet.")}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {completedAssignments.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/70"
              >
                <div>
                  <p className="font-semibold text-[#0B1C30]">{a.title}</p>
                  <p className="text-xs text-[#464555]">
                    {a.className} {tr("• Nộp lúc", "• Submitted at")} {formatDateTime(a.latestSubmission?.submittedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {a.latestSubmission?.status === "GRADED" ? (
                    <Badge variant="mint" className="text-xs px-3 py-1 tabular-nums">
                      {tr("Điểm:", "Score:")} {formatScore(a.latestSubmission.totalScore, a.latestSubmission.maxScore)}
                    </Badge>
                  ) : (
                    <Badge variant="orange">{tr("Chờ chấm tự luận", "Essay awaiting grading")}</Badge>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/student/classes/${a.classId}/leaderboard?assignmentId=${a.id}`}>
                      <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                      {tr("Xếp hạng", "Leaderboard")}
                    </Link>
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/student/assignments/${a.id}/do`}>
                      {vi.assignments.do.viewResult}
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Enrolled Classes */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-xl font-bold text-[#0B1C30]">
            {tr("Lớp học của tôi (", "My classes (")}{classes.length})
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <div key={cls.id} className="stitch-card-hover p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0B1C30]">{cls.name}</h3>
                <p className="mt-1 text-xs text-[#464555]">{tr("Giáo viên:", "Teacher:")} {cls.teacherName}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {cls.studentCount} {tr("học sinh •", "students •")} {cls.assignmentCount} {tr("bài tập", "assignments")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" asChild className="flex-1">
                  <Link href={`/student/classes/${cls.id}`}>{tr("Vào lớp", "Open class")}</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/student/classes/${cls.id}/leaderboard`}>
                    <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Parent Invite Code Dialog */}
      <Dialog open={Boolean(parentCodeModal)} onOpenChange={(o) => !o && setParentCodeModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Mã liên kết dành cho Phụ huynh", "Parent link code")}</DialogTitle>
          </DialogHeader>
          {parentCodeModal && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#464555]">
                {tr("Chia sẻ mã này để phụ huynh liên kết tài khoản và theo dõi kết quả học tập của bạn (hạn 7 ngày, dùng một lần):", "Share this code so your parent can link their account and follow your results (valid 7 days, single use):")}
              </p>
              <div className="rounded-2xl bg-[#EEF2FF] py-4 font-mono text-2xl font-extrabold tracking-widest text-[#3525CD]">
                {parentCodeModal}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  navigator.clipboard?.writeText(parentCodeModal);
                  toast.success(tr("Đã sao chép mã!", "Code copied!"));
                }}
              >
                <Copy className="h-4 w-4" /> {tr("Sao chép mã", "Copy code")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
