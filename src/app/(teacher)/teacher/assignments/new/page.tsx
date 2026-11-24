"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  RefreshCcw,
  Rocket,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import type {
  LeaderboardMode,
  ProctorMode,
  ShowResultMode,
  ViolationAction,
} from "@prisma/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface WorksheetOption {
  id: string;
  title: string;
  _count: { fields: number };
}

interface ClassOption {
  id: string;
  name: string;
  _count: { enrollments: number };
}

function NewAssignmentForm() {
  const { m: vi, tr } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preWorksheetId = searchParams.get("worksheetId") ?? "";
  const preClassId = searchParams.get("classId") ?? "";

  const { data: wsData } = useQuery<{ worksheets: WorksheetOption[] }>({
    queryKey: ["teacher-worksheets"],
    queryFn: async () => (await fetch("/api/worksheets")).json(),
  });
  const { data: clsData } = useQuery<{ classes: ClassOption[] }>({
    queryKey: ["teacher-classes"],
    queryFn: async () => (await fetch("/api/classes")).json(),
  });

  const worksheets = useMemo(() => wsData?.worksheets ?? [], [wsData]);
  const classes = useMemo(() => clsData?.classes ?? [], [clsData]);

  const [worksheetId, setWorksheetId] = useState(preWorksheetId);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    preClassId ? [preClassId] : []
  );
  const [title, setTitle] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState<string>("45");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [allowLate, setAllowLate] = useState(false);

  // Results & Leaderboard
  const [showResult, setShowResult] = useState<ShowResultMode>("AFTER_SUBMIT");
  const [showAnswerKey, setShowAnswerKey] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState<LeaderboardMode>("AFTER_DUE");
  const [leaderboardAnon, setLeaderboardAnon] = useState(false);
  const [leaderboardScoreRule, setLeaderboardScoreRule] = useState<"BEST" | "LAST">("BEST");

  // Proctoring
  const [proctorMode, setProctorMode] = useState<ProctorMode>("OFF");
  const [violationAction, setViolationAction] = useState<ViolationAction>("WARN");
  const [maxViolations, setMaxViolations] = useState(3);
  const [requireFullscreen, setRequireFullscreen] = useState(false);
  const [blockCopyPaste, setBlockCopyPaste] = useState(false);
  const [sebConfigKeyHash, setSebConfigKeyHash] = useState("");
  const [shareProctorWithParent, setShareProctorWithParent] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Auto-select default worksheet & title when loaded
  useEffect(() => {
    if (!worksheetId && worksheets.length > 0) {
      setWorksheetId(worksheets[0]!.id);
    }
  }, [worksheets, worksheetId]);

  useEffect(() => {
    const selectedWs = worksheets.find((w) => w.id === worksheetId);
    if (selectedWs && !title) {
      setTitle(selectedWs.title);
    }
  }, [worksheetId, worksheets, title]);

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyPreset = (
    preset: "WARN" | "LOCK_1" | "RESTART_1" | "AUTO_SUBMIT_3"
  ) => {
    if (proctorMode === "OFF") setProctorMode("LOCKDOWN");
    if (preset === "WARN") {
      setViolationAction("WARN");
      setMaxViolations(3);
    } else if (preset === "LOCK_1") {
      setViolationAction("LOCK");
      setMaxViolations(1);
      setRequireFullscreen(true);
      setBlockCopyPaste(true);
    } else if (preset === "RESTART_1") {
      setViolationAction("RESTART");
      setMaxViolations(1);
      setRequireFullscreen(true);
      setBlockCopyPaste(true);
    } else if (preset === "AUTO_SUBMIT_3") {
      setViolationAction("AUTO_SUBMIT");
      setMaxViolations(3);
      setRequireFullscreen(true);
      setBlockCopyPaste(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worksheetId) {
      toast.error(tr("Vui lòng chọn một Worksheet.", "Please choose a worksheet."));
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.error(tr("Vui lòng chọn ít nhất một lớp học.", "Please choose at least one class."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId,
          classIds: selectedClassIds,
          title,
          openAt: openAt ? new Date(openAt).toISOString() : null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          timeLimitMin: timeLimitMin ? Number(timeLimitMin) : null,
          maxAttempts,
          shuffle,
          showResult,
          showAnswerKey,
          allowLate,
          showLeaderboard,
          leaderboardAnon,
          leaderboardScoreRule,
          proctorMode,
          violationAction,
          maxViolations,
          requireFullscreen,
          blockCopyPaste,
          sebConfigKeyHash: sebConfigKeyHash.trim() || null,
          shareProctorWithParent,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Giao bài thất bại", "Assigning failed"));
      toast.success(tr(`Đã giao bài cho ${json.assignments.length} lớp thành công!`, `Assigned to ${json.assignments.length} class(es) successfully!`));
      router.push("/teacher/assignments");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedWs = worksheets.find((w) => w.id === worksheetId);
  const totalSelectedStudents = classes
    .filter((c) => selectedClassIds.includes(c.id))
    .reduce((sum, c) => sum + c._count.enrollments, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-12">
      <div>
        <p className="text-xs font-semibold text-[#464555]">
          {tr("Worksheet Studio › Giao bài & Cấu hình giám sát", "Worksheet Studio › Assign & proctoring settings")}
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#0B1C30]">
          {vi.assignments.createTitle}
        </h1>
        <p className="mt-1 text-sm text-[#464555]">
          {tr("Cài đặt thời gian, lớp áp dụng, bảng xếp hạng và cơ chế chống gian lận cho ca thi.", "Set the timing, classes, leaderboard and anti-cheating rules for this exam.")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left 8 cols: 3 Stitch Cards */}
        <div className="space-y-6 lg:col-span-8">
          {/* Section 1: Basic Info */}
          <div className="stitch-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5] font-bold">
                  1
                </span>
                <div>
                  <h2 className="text-base font-bold text-[#0B1C30]">{tr("Thông tin cơ bản", "Basic information")}</h2>
                  <p className="text-xs text-[#464555]">
                    {tr("Chọn Worksheet, lớp học áp dụng và thời lượng kiểm tra", "Choose the worksheet, classes and duration")}
                  </p>
                </div>
              </div>
              <Badge variant="neutral">{tr("Bắt buộc", "Required")}</Badge>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{vi.assignments.selectWorksheet}</Label>
                <select
                  required
                  value={worksheetId}
                  onChange={(e) => {
                    setWorksheetId(e.target.value);
                    const ws = worksheets.find((w) => w.id === e.target.value);
                    if (ws) setTitle(ws.title);
                  }}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#4F46E5]"
                >
                  <option value="">{tr("— Chọn phiếu bài tập —", "— Choose a worksheet —")}</option>
                  {worksheets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} ({w._count.fields} {tr("câu)", "questions)")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{vi.assignments.assignmentTitle}</Label>
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr("VD: Unit 7: The World of Work - Đề số 1", "e.g. Unit 7: The World of Work - Test 1")}
                />
              </div>

              <div className="space-y-2">
                <Label>{vi.assignments.selectClasses}</Label>
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => {
                    const active = selectedClassIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleClass(c.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                          active
                            ? "border-[#4F46E5] bg-[#4F46E5] text-white shadow-sm"
                            : "border-slate-200 bg-[#F8F9FF] text-[#0B1C30] hover:border-indigo-300"
                        )}
                      >
                        {active && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {c.name} ({c._count.enrollments} HS)
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{vi.assignments.openAt}</Label>
                  <Input
                    type="datetime-local"
                    value={openAt}
                    onChange={(e) => setOpenAt(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{vi.assignments.dueAt}</Label>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{vi.assignments.timeLimitMin}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={timeLimitMin}
                    onChange={(e) => setTimeLimitMin(e.target.value)}
                    placeholder={tr("Không giới hạn", "Unlimited")}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{vi.assignments.maxAttempts}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value) || 1)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Results & Leaderboard */}
          <div className="stitch-card p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5] font-bold">
                2
              </span>
              <div>
                <h2 className="text-base font-bold text-[#0B1C30]">
                  {tr("Kết quả & Bảng xếp hạng", "Results & leaderboard")}
                </h2>
                <p className="text-xs text-[#464555]">
                  {tr("Chính sách công bố điểm số, đáp án đúng và bảng vinh danh học sinh", "When scores, correct answers and the leaderboard are shown")}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{vi.assignments.showResult}</Label>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#EFF4FF] p-1">
                  {(["AFTER_SUBMIT", "AFTER_DUE", "NEVER"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setShowResult(m)}
                      className={cn(
                        "rounded-lg py-2 text-xs font-semibold transition",
                        showResult === m
                          ? "bg-white text-[#3525CD] shadow-sm"
                          : "text-[#464555]"
                      )}
                    >
                      {vi.assignments.showResultModes[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{vi.assignments.leaderboardMode}</Label>
                  <select
                    value={showLeaderboard}
                    onChange={(e) => setShowLeaderboard(e.target.value as LeaderboardMode)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#4F46E5]"
                  >
                    <option value="AFTER_DUE">{vi.assignments.leaderboardModes.AFTER_DUE}</option>
                    <option value="AFTER_SUBMIT">
                      {vi.assignments.leaderboardModes.AFTER_SUBMIT}
                    </option>
                    <option value="OFF">{vi.assignments.leaderboardModes.OFF}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("Cách tính điểm xếp hạng (nhiều lượt)", "Leaderboard score rule (multiple attempts)")}</Label>
                  <select
                    value={leaderboardScoreRule}
                    onChange={(e) =>
                      setLeaderboardScoreRule(e.target.value as "BEST" | "LAST")
                    }
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#4F46E5]"
                  >
                    <option value="BEST">{tr("Lấy lượt có điểm cao nhất", "Best attempt")}</option>
                    <option value="LAST">{tr("Lấy lượt làm cuối cùng", "Last attempt")}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-3">
                  <span className="text-xs font-semibold text-[#0B1C30]">
                    {vi.assignments.showAnswerKey}
                  </span>
                  <Switch checked={showAnswerKey} onCheckedChange={setShowAnswerKey} />
                </label>
                <label className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-3">
                  <span className="text-xs font-semibold text-[#0B1C30]">
                    {vi.assignments.leaderboardAnon}
                  </span>
                  <Switch checked={leaderboardAnon} onCheckedChange={setLeaderboardAnon} />
                </label>
                <label className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-3">
                  <span className="text-xs font-semibold text-[#0B1C30]">
                    {vi.assignments.shuffle}
                  </span>
                  <Switch checked={shuffle} onCheckedChange={setShuffle} />
                </label>
                <label className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-3">
                  <span className="text-xs font-semibold text-[#0B1C30]">
                    {vi.assignments.allowLate}
                  </span>
                  <Switch checked={allowLate} onCheckedChange={setAllowLate} />
                </label>
              </div>
            </div>
          </div>

          {/* Section 3: Anti-cheat Proctoring (Stitch Section 3) */}
          <div className="stitch-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5] font-bold">
                  3
                </span>
                <div>
                  <h2 className="text-base font-bold text-[#0B1C30]">
                    {tr("Chống gian lận & Bảo mật ca thi", "Anti-cheating & exam security")}
                  </h2>
                  <p className="text-xs text-[#464555]">
                    {tr("Thiết lập mức giám sát hành vi và phản ứng tự động khi phát hiện vi phạm", "Set the monitoring level and the automatic response to violations")}
                  </p>
                </div>
              </div>
              <Badge variant="orange">
                <Shield className="h-3 w-3" /> Proctor Guard
              </Badge>
            </div>

            {/* Proctor Mode selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("Cấp độ bảo mật tổng thể", "Overall security level")}</Label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#EFF4FF] p-1 sm:grid-cols-4">
                {(["OFF", "MONITOR", "LOCKDOWN", "SEB"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-proctor-mode={m}
                    onClick={() => {
                      setProctorMode(m);
                      if (m === "LOCKDOWN") {
                        setRequireFullscreen(true);
                        setBlockCopyPaste(true);
                      }
                    }}
                    className={cn(
                      "rounded-lg py-2 px-2 text-xs font-bold transition",
                      proctorMode === m
                        ? "bg-[#4F46E5] text-white shadow-sm"
                        : "text-[#464555] hover:text-[#3525CD]"
                    )}
                  >
                    {vi.proctor.modes[m]}
                  </button>
                ))}
              </div>
            </div>

            {proctorMode !== "OFF" && (
              <>
                {/* 4 Quick Presets matching Stitch & PLAN 6C */}
                <div className="space-y-2">
                  <Label className="text-xs">{tr("Kịch bản phản ứng nhanh khi vi phạm", "Quick violation presets")}</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => applyPreset("WARN")}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition",
                        violationAction === "WARN"
                          ? "border-[#4F46E5] bg-[#EEF2FF]/70 ring-2 ring-indigo-100"
                          : "border-slate-200 bg-[#F8F9FF] hover:border-indigo-200"
                      )}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-[#0B1C30]">
                        <Bell className="h-4 w-4 text-[#4F46E5]" />
                        {tr("Chỉ cảnh báo", "Warn only")}
                      </div>
                      <p className="mt-1 text-[11px] text-[#464555]">
                        {tr("Ghi nhận vi phạm và báo giáo viên realtime, không khoá bài.", "Log violations and alert the teacher in real time, no lock.")}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset("LOCK_1")}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition",
                        violationAction === "LOCK" && maxViolations === 1
                          ? "border-[#4F46E5] bg-[#EEF2FF]/70 ring-2 ring-indigo-100"
                          : "border-slate-200 bg-[#F8F9FF] hover:border-indigo-200"
                      )}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-[#0B1C30]">
                        <Lock className="h-4 w-4 text-[#BA1A1A]" />
                        {tr("Nhảy tab là khoá luôn", "Leave tab = locked")}
                      </div>
                      <p className="mt-1 text-[11px] text-[#464555]">
                        {tr("Rời tab/thoát toàn màn hình 1 lần → Khoá bài ngay, chờ giáo viên mở.", "Leaving the tab / exiting fullscreen once → locked until the teacher unlocks.")}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset("RESTART_1")}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition",
                        violationAction === "RESTART" && maxViolations === 1
                          ? "border-[#4F46E5] bg-[#EEF2FF]/70 ring-2 ring-indigo-100"
                          : "border-slate-200 bg-[#F8F9FF] hover:border-indigo-200"
                      )}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-[#0B1C30]">
                        <RefreshCcw className="h-4 w-4 text-[#EA580C]" />
                        {tr("Thoát ra là làm lại từ đầu", "Leave = start over")}
                      </div>
                      <p className="mt-1 text-[11px] text-[#464555]">
                        {tr("Vi phạm lần đầu → Xoá toàn bộ đáp án cũ, đồng hồ KHÔNG đặt lại.", "First violation → all previous answers cleared, timer NOT reset.")}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset("AUTO_SUBMIT_3")}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition",
                        violationAction === "AUTO_SUBMIT" && maxViolations === 3
                          ? "border-[#4F46E5] bg-[#EEF2FF]/70 ring-2 ring-indigo-100"
                          : "border-slate-200 bg-[#F8F9FF] hover:border-indigo-200"
                      )}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-[#0B1C30]">
                        <ShieldAlert className="h-4 w-4 text-[#4F46E5]" />
                        {tr("Tự nộp sau 3 lần", "Auto submit after 3")}
                      </div>
                      <p className="mt-1 text-[11px] text-[#464555]">
                        {tr("Cảnh báo 2 lần đầu; lần thứ 3 hệ thống tự động thu và chấm bài.", "Warn on the first 2; on the 3rd the system collects and grades the exam.")}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Custom Action + Threshold */}
                <div className="grid grid-cols-1 gap-3 rounded-xl bg-[#F8F9FF] p-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Tuỳ chỉnh hành vi khi chạm ngưỡng", "Action when the threshold is reached")}</Label>
                    <select
                      value={violationAction}
                      onChange={(e) => setViolationAction(e.target.value as ViolationAction)}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none focus:border-[#4F46E5]"
                    >
                      <option value="WARN">{vi.proctor.actions.WARN}</option>
                      <option value="LOCK">{vi.proctor.actions.LOCK}</option>
                      <option value="RESTART">{vi.proctor.actions.RESTART}</option>
                      <option value="AUTO_SUBMIT">{vi.proctor.actions.AUTO_SUBMIT}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Ngưỡng vi phạm (1–10 lần)", "Violation threshold (1–10)")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={maxViolations}
                      onChange={(e) => setMaxViolations(Number(e.target.value) || 1)}
                      className="h-9 text-xs bg-white"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-[#0B1C30]">
                      {tr("Bắt buộc toàn màn hình", "Require fullscreen")}
                    </span>
                    <Switch
                      checked={requireFullscreen}
                      onCheckedChange={setRequireFullscreen}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-[#0B1C30]">
                      {tr("Chặn Copy / Paste / Chuột phải", "Block copy / paste / right-click")}
                    </span>
                    <Switch checked={blockCopyPaste} onCheckedChange={setBlockCopyPaste} />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 sm:col-span-2">
                    <span className="text-xs font-semibold text-[#0B1C30]">
                      {tr("Chia sẻ cảnh báo vi phạm với Phụ huynh (Cổng phụ huynh)", "Share violation alerts with parents (parent portal)")}
                    </span>
                    <Switch
                      checked={shareProctorWithParent}
                      onCheckedChange={setShareProctorWithParent}
                    />
                  </label>
                </div>

                {proctorMode === "SEB" && (
                  <div className="space-y-1.5 rounded-xl border border-indigo-200 bg-[#EEF2FF]/60 p-4">
                    <Label className="text-xs text-[#3525CD]">
                      Safe Exam Browser — Config Key Hash (X-SafeExamBrowser-ConfigKeyHash)
                    </Label>
                    <Input
                      value={sebConfigKeyHash}
                      onChange={(e) => setSebConfigKeyHash(e.target.value)}
                      placeholder={tr("Nhập chuỗi ConfigKeyHash của file .seb (tuỳ chọn)", "ConfigKeyHash of the .seb file (optional)")}
                      className="bg-white font-mono text-xs"
                    />
                  </div>
                )}

                {/* Mandatory Technical Limitation Disclaimer (PLAN.md 6C) */}
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-[#EFF4FF]/70 p-3.5 text-xs leading-relaxed text-[#464555]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5]" />
                  <span>{vi.proctor.disclaimer}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right 4 cols: Live Preview ("Học sinh sẽ thấy") + Submit Button */}
        <aside className="space-y-4 lg:col-span-4 lg:sticky lg:top-24">
          <div className="stitch-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-[#0B1C30]">
                {tr("Học sinh sẽ thấy (Live Preview)", "What students will see (live preview)")}
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-[#F8F9FF] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="default">{tr("BÀI KIỂM TRA", "TEST")}</Badge>
                {proctorMode !== "OFF" && (
                  <Badge variant="danger">
                    <Lock className="h-3 w-3" /> {tr("Chế độ giám sát", "Proctoring mode")}
                  </Badge>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-[#0B1C30]">
                  {title || tr("Chưa nhập tên bài", "Untitled")}
                </h3>
                <p className="text-xs text-[#464555]">
                  {selectedWs ? tr(`${selectedWs._count.fields} câu hỏi`, `${selectedWs._count.fields} questions`) : tr("Chưa chọn worksheet", "No worksheet selected")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-[#464555]">
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-slate-200">
                  <Clock className="h-3 w-3 text-[#F97316]" />
                  {timeLimitMin ? tr(`${timeLimitMin} phút`, `${timeLimitMin} min`) : tr("Không giới hạn", "Unlimited")}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-slate-200">
                  {maxAttempts} {tr("lượt làm", "attempt(s)")}
                </span>
                {showLeaderboard !== "OFF" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-slate-200">
                    <Trophy className="h-3 w-3 text-[#F97316]" />
                    {tr("Có Xếp hạng", "Leaderboard on")}
                  </span>
                )}
              </div>

              {proctorMode !== "OFF" && (
                <div className="rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs text-[#BA1A1A] space-y-1">
                  <p className="flex items-center gap-1 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {tr("Luật giám sát đang bật:", "Active proctoring rules:")}
                  </p>
                  <p>
                    {violationAction === "LOCK" &&
                      tr(`Rời tab hoặc vi phạm ${maxViolations} lần → BỊ KHOÁ BÀI NGAY.`, `Leaving the tab or ${maxViolations} violation(s) → EXAM LOCKED.`)}
                    {violationAction === "RESTART" &&
                      tr(`Vi phạm ${maxViolations} lần → XOÁ ĐÁP ÁN & LÀM LẠI TỪ ĐẦU.`, `${maxViolations} violation(s) → ANSWERS CLEARED & START OVER.`)}
                    {violationAction === "AUTO_SUBMIT" &&
                      tr(`Vi phạm ${maxViolations} lần → TỰ ĐỘNG NỘP BÀI.`, `${maxViolations} violation(s) → AUTO SUBMIT.`)}
                    {violationAction === "WARN" &&
                      tr("Ghi nhận mọi lần rời tab và cảnh báo trực tiếp giáo viên.", "Every tab switch is logged and the teacher is alerted live.")}
                  </p>
                </div>
              )}

              <ul className="space-y-1.5 text-xs text-[#464555]">
                {requireFullscreen && (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {tr("Bắt buộc toàn màn hình", "Require fullscreen")}
                  </li>
                )}
                {blockCopyPaste && (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {tr("Chặn Copy/Paste & chuột phải", "Copy/paste & right-click blocked")}
                  </li>
                )}
                {shuffle && (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {tr("Trộn thứ tự câu phiếu trả lời", "Shuffle answer-sheet questions")}
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-xl bg-[#EFF4FF] px-3.5 py-2.5 text-xs font-semibold text-[#3525CD]">
              {tr("Sẽ giao cho", "Will be assigned to")} {selectedClassIds.length} {tr("lớp (", "class(es) (")}{totalSelectedStudents} {tr("học sinh)", "students)")}
            </div>

            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              <Rocket className="h-4 w-4" />
              {submitting ? tr("Đang giao bài…", "Assigning…") : tr("Giao bài ngay", "Assign now")}
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

export default function NewAssignmentPage() {
  const { m: vi } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      }
    >
      <NewAssignmentForm />
    </Suspense>
  );
}
