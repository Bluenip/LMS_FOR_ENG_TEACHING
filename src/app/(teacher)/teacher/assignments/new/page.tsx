"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ClipboardX,
  Info,
  Lock,
  RefreshCcw,
  Rocket,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type {
  LeaderboardMode,
  ProctorMode,
  ScoreScale,
  ShowResultMode,
  ViolationAction,
  WorksheetSubject,
} from "@prisma/client";
import { getSubjectProfile } from "@/lib/subjects";
import { scoreScaleLabel } from "@/lib/score-scale";
import { foldText } from "@/lib/text-search";
import { cn, formatAttemptsLimit } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WorksheetPicker } from "@/components/assignments/WorksheetPicker";
import { BackLink } from "@/components/navigation/BackLink";
import { previousInAppUrl } from "@/lib/navigation-history";
import { ClassPicker } from "@/components/assignments/ClassPicker";

interface WorksheetOption {
  id: string;
  title: string;
  subject?: WorksheetSubject;
  updatedAt?: string;
  owner?: { name: string };
  _count: { fields: number; audios?: number };
}

interface ClassOption {
  id: string;
  name: string;
  _count: { enrollments: number };
}

interface EditableAssignment {
  id: string;
  classId: string;
  worksheetId: string;
  title: string;
  openAt: string | null;
  dueAt: string | null;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  shuffle: boolean;
  shuffleOptions?: boolean;
  showResult: ShowResultMode;
  showAnswerKey: boolean;
  allowLate: boolean;
  showLeaderboard: LeaderboardMode;
  leaderboardAnon: boolean;
  leaderboardScoreRule: string;
  proctorMode: ProctorMode;
  violationAction: ViolationAction;
  maxViolations: number;
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  sebConfigKeyHash: string | null;
  shareProctorWithParent: boolean;
  requireCamera: boolean;
  cameraEnforce: boolean;
  cameraSnapshots: boolean;
  audioMaxPlays: number | null;
  audioBlockPause: boolean;
  audioBlockSeek: boolean;
  oneQuestionPerPage: boolean;
  remindBeforeDue?: boolean;
  scoreScale?: ScoreScale;
  weight?: number;
  targets?: Array<{ studentId: string }>;
  class: {
    id: string;
    name: string;
    enrollments?: Array<{ student: { id: string; name: string; email: string } }>;
  };
  worksheet?: { id: string; title: string; subject?: WorksheetSubject; _count: { fields: number; audios?: number } };
  _count: { submissions: number };
}

interface ClassStudentOption {
  id: string;
  name: string;
  email: string;
}

/** ISO date -> value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Where to go after saving: back to the class page / assignment list / dashboard the teacher came
 * from (with its tab and filters), otherwise the assignment list. Pushing (not history.back) makes
 * sure the page shows the new data.
 */
function afterSaveUrl(): string {
  const prev = previousInAppUrl();
  if (prev && /^\/teacher(\/classes\/[^/?]+|\/assignments)?(\?|$)/.test(prev)) return prev;
  return "/teacher/assignments";
}

const DUE_PRESETS = [
  { days: 0, vi: "Hết hôm nay", en: "End of today" },
  { days: 1, vi: "+1 ngày", en: "+1 day" },
  { days: 3, vi: "+3 ngày", en: "+3 days" },
  { days: 7, vi: "+1 tuần", en: "+1 week" },
] as const;

/** 23:59 local time, `days` days from today, as a datetime-local value. */
function endOfDayInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d.toISOString());
}

function ChipButton({
  children,
  onClick,
  active,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition",
        active
          ? "border-[#4F46E5] bg-[#4F46E5] text-white"
          : muted
            ? "border-transparent text-[#464555] hover:bg-slate-100"
            : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-300"
      )}
    >
      {children}
    </button>
  );
}

function NewAssignmentForm() {
  const { m: vi, tr, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preWorksheetId = searchParams.get("worksheetId") ?? "";
  const preClassId = searchParams.get("classId") ?? "";
  /** ?edit=<assignmentId>: change an assignment that was already given */
  const editId = searchParams.get("edit") ?? "";
  const isEdit = Boolean(editId);

  const { data: wsData } = useQuery<{
    worksheets: WorksheetOption[];
    sharedWorksheets?: WorksheetOption[];
  }>({
    queryKey: ["teacher-worksheets"],
    queryFn: () =>
      apiFetchJson<{ worksheets: WorksheetOption[]; sharedWorksheets?: WorksheetOption[] }>(
        "/api/worksheets"
      ),
  });
  const { data: clsData } = useQuery<{ classes: ClassOption[] }>({
    queryKey: ["teacher-classes"],
    queryFn: () => apiFetchJson<{ classes: ClassOption[] }>("/api/classes"),
  });

  const ownWorksheets = useMemo(() => wsData?.worksheets ?? [], [wsData]);
  const sharedWorksheets = useMemo(() => wsData?.sharedWorksheets ?? [], [wsData]);
  const worksheets = useMemo(
    () => [...ownWorksheets, ...sharedWorksheets],
    [ownWorksheets, sharedWorksheets]
  );
  const classes = useMemo(() => clsData?.classes ?? [], [clsData]);

  const [worksheetId, setWorksheetId] = useState(preWorksheetId);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    preClassId ? [preClassId] : []
  );
  const [title, setTitle] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState<string>("45");
  const [unlimitedAttempts, setUnlimitedAttempts] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [allowLate, setAllowLate] = useState(false);
  const [oneQuestionPerPage, setOneQuestionPerPage] = useState(false);
  const [remindBeforeDue, setRemindBeforeDue] = useState(true);
  const [scoreScale, setScoreScale] = useState<ScoreScale>("SCALE_10");
  const [weight, setWeight] = useState<number>(1);
  const [targetMode, setTargetMode] = useState<"ALL" | "SELECTED">("ALL");
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [studentFilter, setStudentFilter] = useState("");

  // Audio playback settings (default: unlimited, allow pause, allow seek)
  const [limitAudioPlays, setLimitAudioPlays] = useState(false);
  const [audioMaxPlays, setAudioMaxPlays] = useState(2);
  const [audioBlockPause, setAudioBlockPause] = useState(false);
  const [audioBlockSeek, setAudioBlockSeek] = useState(false);

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

  // Camera AI proctoring (Layer 2)
  const [requireCamera, setRequireCamera] = useState(false);
  const [cameraEnforce, setCameraEnforce] = useState(false);
  const [cameraSnapshots, setCameraSnapshots] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const { data: editData, isLoading: editLoading } = useQuery<{ assignment: EditableAssignment }>({
    queryKey: ["assignment-settings", editId],
    enabled: isEdit,
    queryFn: () =>
      apiFetchJson<{ assignment: EditableAssignment }>(`/api/assignments/${editId}/settings`),
  });
  const editing = editData?.assignment ?? null;
  const singleSelectedClassId = selectedClassIds.length === 1 ? selectedClassIds[0]! : null;
  const { data: singleClassDetail } = useQuery<{
    class: {
      enrollments: Array<{
        status: string;
        student: ClassStudentOption;
      }>;
    };
  }>({
    queryKey: ["class-students-for-assign", singleSelectedClassId],
    enabled: Boolean(singleSelectedClassId) && !isEdit,
    queryFn: () => apiFetchJson(`/api/classes/${singleSelectedClassId}`),
  });

  const singleClassStudents: ClassStudentOption[] = useMemo(() => {
    if (isEdit && editing?.class.enrollments) {
      return editing.class.enrollments.map((e) => e.student);
    }
    const enrollments = singleClassDetail?.class?.enrollments ?? [];
    return enrollments
      .filter((e) => e.status === "ACTIVE")
      .map((e) => e.student);
  }, [isEdit, editing, singleClassDetail]);

  const filteredSingleClassStudents = useMemo(() => {
    const q = foldText(studentFilter.trim());
    if (!q) return singleClassStudents;
    return singleClassStudents.filter((s) =>
      foldText(`${s.name} ${s.email}`).includes(q)
    );
  }, [singleClassStudents, studentFilter]);

  useEffect(() => {
    if (selectedClassIds.length !== 1 && targetMode !== "ALL") {
      setTargetMode("ALL");
      setTargetStudentIds([]);
    }
  }, [selectedClassIds.length, targetMode]);

  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!editing || prefilled) return;
    setPrefilled(true);
    setWorksheetId(editing.worksheetId);
    setSelectedClassIds([editing.classId]);
    setTitle(editing.title);
    setOpenAt(toLocalInput(editing.openAt));
    setDueAt(toLocalInput(editing.dueAt));
    setTimeLimitMin(editing.timeLimitMin ? String(editing.timeLimitMin) : "");
    setUnlimitedAttempts(editing.maxAttempts === null);
    setMaxAttempts(editing.maxAttempts ?? 1);
    setShuffle(editing.shuffle);
    setShuffleOptions(Boolean(editing.shuffleOptions));
    setAllowLate(editing.allowLate);
    setOneQuestionPerPage(editing.oneQuestionPerPage);
    setRemindBeforeDue(editing.remindBeforeDue ?? true);
    setScoreScale(editing.scoreScale ?? "SCALE_10");
    setWeight(editing.weight ?? 1);
    if (editing.targets && editing.targets.length > 0) {
      setTargetMode("SELECTED");
      setTargetStudentIds(editing.targets.map((t) => t.studentId));
    } else {
      setTargetMode("ALL");
      setTargetStudentIds([]);
    }
    setLimitAudioPlays(editing.audioMaxPlays !== null);
    setAudioMaxPlays(editing.audioMaxPlays ?? 2);
    setAudioBlockPause(editing.audioBlockPause);
    setAudioBlockSeek(editing.audioBlockSeek);
    setShowResult(editing.showResult);
    setShowAnswerKey(editing.showAnswerKey);
    setShowLeaderboard(editing.showLeaderboard);
    setLeaderboardAnon(editing.leaderboardAnon);
    setLeaderboardScoreRule(editing.leaderboardScoreRule === "LAST" ? "LAST" : "BEST");
    setProctorMode(editing.proctorMode);
    setViolationAction(editing.violationAction);
    setMaxViolations(editing.maxViolations);
    setRequireFullscreen(editing.requireFullscreen);
    setBlockCopyPaste(editing.blockCopyPaste);
    setSebConfigKeyHash(editing.sebConfigKeyHash ?? "");
    setShareProctorWithParent(editing.shareProctorWithParent);
    setRequireCamera(editing.requireCamera);
    setCameraEnforce(editing.cameraEnforce);
    setCameraSnapshots(editing.cameraSnapshots);
  }, [editing, prefilled]);

  // Auto-select default worksheet & title when loaded
  useEffect(() => {
    if (!isEdit && !worksheetId && worksheets.length > 0) {
      setWorksheetId(worksheets[0]!.id);
    }
  }, [worksheets, worksheetId, isEdit]);

  useEffect(() => {
    const selectedWs = worksheets.find((w) => w.id === worksheetId);
    if (!isEdit && selectedWs && !title) {
      setTitle(selectedWs.title);
    }
  }, [worksheetId, worksheets, title, isEdit]);

  const applyPreset = (
    preset: "WARN" | "LOCK_1" | "RESTART_1" | "AUTO_SUBMIT_3" | "DICTATION" | "MEMORIZE"
  ) => {
    if (preset === "DICTATION") {
      setProctorMode("MONITOR");
      setViolationAction("WARN");
      setMaxViolations(3);
      setRequireFullscreen(true);
      setBlockCopyPaste(true);
      return;
    }
    if (preset === "MEMORIZE") {
      setProctorMode("LOCKDOWN");
      setViolationAction("WARN");
      setMaxViolations(3);
      setRequireFullscreen(true);
      setBlockCopyPaste(true);
      setOneQuestionPerPage(true);
      return;
    }
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
    if (selectedClassIds.length === 1 && targetMode === "SELECTED" && targetStudentIds.length === 0) {
      toast.error(
        tr(
          "Vui lòng chọn ít nhất 1 học sinh hoặc chuyển về Giao cả lớp.",
          "Please select at least 1 student or switch back to Whole class."
        )
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/assignments/${editId}` : "/api/assignments", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? {} : { worksheetId, classIds: selectedClassIds }),
          title,
          openAt: openAt ? new Date(openAt).toISOString() : null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          timeLimitMin: timeLimitMin ? Number(timeLimitMin) : null,
          maxAttempts: unlimitedAttempts ? null : maxAttempts,
          shuffle,
          shuffleOptions,
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
          requireCamera,
          cameraEnforce: requireCamera ? cameraEnforce : false,
          cameraSnapshots: requireCamera ? cameraSnapshots : false,
          audioMaxPlays: limitAudioPlays ? audioMaxPlays : null,
          audioBlockPause,
          audioBlockSeek,
          oneQuestionPerPage,
          remindBeforeDue,
          scoreScale,
          weight,
          targetStudentIds:
            selectedClassIds.length === 1 && targetMode === "SELECTED"
              ? targetStudentIds
              : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Giao bài thất bại", "Assigning failed"));
      toast.success(
        isEdit
          ? tr("Đã cập nhật bài tập đã giao.", "Assignment updated.")
          : tr(`Đã giao bài cho ${json.assignments.length} lớp thành công!`, `Assigned to ${json.assignments.length} class(es) successfully!`)
      );
      router.push(afterSaveUrl());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedWs = worksheets.find((w) => w.id === worksheetId);
  const selectedClasses = classes.filter((c) => selectedClassIds.includes(c.id));
  const totalSelectedStudents = selectedClasses.reduce((sum, c) => sum + c._count.enrollments, 0);
  const audioCount = selectedWs?._count.audios ?? editing?.worksheet?._count.audios ?? 0;
  const hasAudio = audioCount > 0;
  const audioRestricted = limitAudioPlays || audioBlockPause || audioBlockSeek;
  const proctoringOn = proctorMode !== "OFF" || requireCamera;
  const fmt = (v: string) =>
    v
      ? new Date(v).toLocaleString(locale === "en" ? "en-GB" : "vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;
  const canSubmit = Boolean(worksheetId) && selectedClassIds.length > 0 && title.trim().length > 0;
  const submitLabel = submitting
    ? isEdit
      ? tr("Đang lưu…", "Saving…")
      : tr("Đang giao bài…", "Assigning…")
    : isEdit
      ? tr("Lưu thay đổi", "Save changes")
      : tr("Giao bài", "Assign");

  const violationSummary =
    proctorMode === "OFF"
      ? null
      : violationAction === "LOCK"
        ? tr(`Vi phạm ${maxViolations} lần → khoá bài`, `${maxViolations} violation(s) → locked`)
        : violationAction === "RESTART"
          ? tr(`Vi phạm ${maxViolations} lần → làm lại từ đầu`, `${maxViolations} violation(s) → start over`)
          : violationAction === "AUTO_SUBMIT"
            ? tr(`Vi phạm ${maxViolations} lần → tự nộp`, `${maxViolations} violation(s) → auto submit`)
            : tr("Chỉ cảnh báo, báo giáo viên", "Warn and alert the teacher");

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-6xl space-y-6 pb-28 lg:pb-12">
      {/* Header */}
      <div className="space-y-3">
        <BackLink fallbackHref="/teacher/assignments" label={tr("Quay lại", "Back")} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B1C30] sm:text-3xl">
            {isEdit ? tr("Sửa bài đã giao", "Edit assignment") : tr("Giao bài mới", "New assignment")}
          </h1>
          <p className="mt-1 text-sm text-[#464555]">
            {tr(
              "Chọn phiếu, lớp và thời gian. Các tuỳ chọn nâng cao có thể để mặc định.",
              "Pick the worksheet, classes and timing. Advanced options can stay at their defaults."
            )}
          </p>
        </div>
        {isEdit && editing && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {tr(
              `Lớp ${editing.class.name} · ${editing._count.submissions} lượt làm đã có được giữ nguyên. Tăng số lượt hoặc lùi hạn nộp sẽ báo cho học sinh.`,
              `Class ${editing.class.name} · the ${editing._count.submissions} existing attempts are kept. Students are notified when you add attempts or extend the deadline.`
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          {/* ===== Essentials ===== */}
          <section className="stitch-card divide-y divide-slate-100 overflow-visible">
            <FormRow
              id="step-worksheet"
              title={tr("Phiếu bài tập", "Worksheet")}
              hint={tr("Gõ tên để tìm nhanh, không cần dấu.", "Type to search.")}
            >
              <WorksheetPicker
                mine={ownWorksheets}
                shared={sharedWorksheets}
                value={worksheetId}
                disabled={isEdit}
                onChange={(ws) => {
                  setWorksheetId(ws.id);
                  setTitle(ws.title);
                }}
              />
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="assignment-title" className="text-xs text-[#464555]">
                  {tr("Tên học sinh nhìn thấy", "Name students see")}
                </Label>
                <Input
                  id="assignment-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr("VD: Unit 7 - Đề số 1", "e.g. Unit 7 - Test 1")}
                />
              </div>
            </FormRow>

            <FormRow
              id="step-classes"
              title={tr("Giao cho lớp", "Classes")}
              hint={
                isEdit
                  ? tr("Bài đã giao không đổi được lớp.", "The class of a given assignment cannot change.")
                  : tr("Chọn một hoặc nhiều lớp.", "Pick one or more classes.")
              }
            >
              <ClassPicker
                classes={classes}
                value={selectedClassIds}
                onChange={(ids) => {
                  setSelectedClassIds(ids);
                  setTargetStudentIds([]);
                }}
                locked={isEdit}
              />

              {selectedClassIds.length === 1 && (
                <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-[#F8F9FF] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0B1C30]">
                      {tr("Đối tượng nhận bài", "Assign to")}
                    </span>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setTargetMode("ALL")}
                        data-testid="target-mode-all"
                        className={cn(
                          "rounded-md px-2.5 py-1 transition",
                          targetMode === "ALL"
                            ? "bg-[#4F46E5] text-white"
                            : "text-[#464555] hover:text-[#0B1C30]"
                        )}
                      >
                        {tr("Cả lớp", "Whole class")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetMode("SELECTED")}
                        data-testid="target-mode-selected"
                        className={cn(
                          "rounded-md px-2.5 py-1 transition",
                          targetMode === "SELECTED"
                            ? "bg-[#4F46E5] text-white"
                            : "text-[#464555] hover:text-[#0B1C30]"
                        )}
                      >
                        {tr("Nhóm học sinh", "Selected students")}
                        {targetMode === "SELECTED" && targetStudentIds.length > 0
                          ? ` (${targetStudentIds.length})`
                          : ""}
                      </button>
                    </div>
                  </div>

                  {targetMode === "SELECTED" && (
                    <div className="space-y-2" data-testid="target-student-picker">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={studentFilter}
                          onChange={(e) => setStudentFilter(e.target.value)}
                          placeholder={tr("Tìm học sinh theo tên hoặc email…", "Search student by name or email…")}
                          className="h-9 flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setTargetStudentIds(singleClassStudents.map((s) => s.id))}
                        >
                          {tr("Chọn hết", "Select all")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setTargetStudentIds([])}
                        >
                          {tr("Bỏ chọn", "Clear")}
                        </Button>
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                        {filteredSingleClassStudents.length === 0 ? (
                          <p className="py-3 text-center text-xs text-slate-400">
                            {tr("Không có học sinh nào.", "No students found.")}
                          </p>
                        ) : (
                          filteredSingleClassStudents.map((stu) => {
                            const checked = targetStudentIds.includes(stu.id);
                            return (
                              <label
                                key={stu.id}
                                className={cn(
                                  "flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition",
                                  checked ? "bg-[#EEF2FF] text-[#3525CD]" : "hover:bg-slate-50"
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      setTargetStudentIds((prev) =>
                                        e.target.checked
                                          ? [...prev, stu.id]
                                          : prev.filter((x) => x !== stu.id)
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                                    data-testid={`target-student-cb-${stu.id}`}
                                  />
                                  <span className="truncate font-semibold">{stu.name}</span>
                                </span>
                                <span className="hidden truncate text-[11px] text-slate-400 sm:inline">
                                  {stu.email}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </FormRow>

            <FormRow
              id="step-timing"
              title={tr("Thời gian", "Timing")}
              hint={tr("Để trống nếu không muốn giới hạn.", "Leave empty for no limit.")}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={vi.assignments.openAt} htmlFor="open-at" hint={openAt ? null : tr("Trống = mở ngay", "Empty = opens now")}>
                  <Input id="open-at" type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
                </Field>
                <Field label={vi.assignments.dueAt} htmlFor="due-at">
                  <Input id="due-at" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DUE_PRESETS.map((p) => (
                      <ChipButton key={p.days} onClick={() => setDueAt(endOfDayInput(p.days))}>
                        {tr(p.vi, p.en)}
                      </ChipButton>
                    ))}
                    {dueAt && (
                      <ChipButton onClick={() => setDueAt("")} muted>
                        {tr("Bỏ hạn", "Clear")}
                      </ChipButton>
                    )}
                  </div>
                </Field>
                <Field label={vi.assignments.timeLimitMin} htmlFor="time-limit">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[15, 30, 45, 60, 90].map((m) => (
                      <ChipButton key={m} active={timeLimitMin === String(m)} onClick={() => setTimeLimitMin(String(m))}>
                        {m}′
                      </ChipButton>
                    ))}
                    <ChipButton active={!timeLimitMin} onClick={() => setTimeLimitMin("")}>
                      {tr("Không giới hạn", "No limit")}
                    </ChipButton>
                    <Input
                      id="time-limit"
                      type="number"
                      min={1}
                      max={600}
                      value={timeLimitMin}
                      onChange={(e) => setTimeLimitMin(e.target.value)}
                      aria-label={tr("Số phút tuỳ chọn", "Custom minutes")}
                      placeholder={tr("Khác", "Other")}
                      className="h-9 w-20"
                    />
                  </div>
                </Field>
                <Field label={vi.assignments.maxAttempts} htmlFor="max-attempts">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3].map((n) => (
                      <ChipButton
                        key={n}
                        active={!unlimitedAttempts && maxAttempts === n}
                        onClick={() => {
                          setUnlimitedAttempts(false);
                          setMaxAttempts(n);
                        }}
                      >
                        {tr(`${n} lượt`, `${n}×`)}
                      </ChipButton>
                    ))}
                    <ChipButton active={unlimitedAttempts} onClick={() => setUnlimitedAttempts((v) => !v)}>
                      {tr("Không giới hạn", "Unlimited")}
                    </ChipButton>
                    <Input
                      id="max-attempts"
                      type="number"
                      min={1}
                      max={50}
                      disabled={unlimitedAttempts}
                      value={unlimitedAttempts ? "" : maxAttempts}
                      onChange={(e) => setMaxAttempts(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                      aria-label={tr("Số lượt tuỳ chọn", "Custom attempts")}
                      className="h-9 w-20"
                      data-testid="max-attempts-input"
                    />
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={unlimitedAttempts}
                      onChange={(e) => setUnlimitedAttempts(e.target.checked)}
                      data-testid="unlimited-attempts-checkbox"
                      tabIndex={-1}
                      aria-hidden
                    />
                  </div>
                </Field>
              </div>
            </FormRow>

            {(hasAudio || audioRestricted) && (
              <FormRow
                title={tr("File nghe", "Audio")}
                hint={
                  hasAudio
                    ? tr(
                        `Phiếu có ${audioCount} file nghe. Mặc định nghe thoải mái.`,
                        `${audioCount} audio track(s). Unlimited playback by default.`
                      )
                    : tr("Phiếu này chưa có file nghe.", "This worksheet has no audio.")
                }
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <label className="flex min-h-7 cursor-pointer items-center gap-2 text-xs font-semibold text-[#0B1C30]">
                      <input
                        type="checkbox"
                        checked={limitAudioPlays}
                        onChange={(e) => setLimitAudioPlays(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                        data-testid="audio-limit-checkbox"
                      />
                      {tr("Giới hạn số lần nghe", "Limit plays")}
                    </label>
                    {limitAudioPlays && (
                      <div className="mt-1.5 flex items-center gap-2 pl-6">
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={audioMaxPlays}
                          onChange={(e) => setAudioMaxPlays(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                          className="h-8 w-16 text-xs"
                          data-testid="audio-max-plays-input"
                        />
                        <span className="text-[11px] text-[#464555]">{tr("lần / file", "per track")}</span>
                      </div>
                    )}
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B1C30]">
                    <input
                      type="checkbox"
                      checked={audioBlockPause}
                      onChange={(e) => setAudioBlockPause(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                      data-testid="audio-block-pause-checkbox"
                    />
                    {tr("Không cho dừng", "No pause")}
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B1C30]">
                    <input
                      type="checkbox"
                      checked={audioBlockSeek}
                      onChange={(e) => setAudioBlockSeek(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                      data-testid="audio-block-seek-checkbox"
                    />
                    {tr("Không cho tua", "No seeking")}
                  </label>
                </div>
              </FormRow>
            )}
          </section>

          {/* ===== Results & leaderboard ===== */}
          <section className="stitch-card divide-y divide-slate-100">
            <FormRow
              id="step-results"
              title={tr("Kết quả", "Results")}
              hint={tr("Khi nào học sinh thấy điểm và đáp án.", "When students see scores and answers.")}
            >
              <Segmented
                value={showResult}
                onChange={(v) => setShowResult(v as ShowResultMode)}
                options={(["AFTER_SUBMIT", "AFTER_DUE", "NEVER"] as const).map((m) => ({
                  value: m,
                  label: vi.assignments.showResultModes[m],
                }))}
              />
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleRow label={vi.assignments.showAnswerKey} checked={showAnswerKey} onChange={setShowAnswerKey} />
                <ToggleRow label={vi.assignments.allowLate} checked={allowLate} onChange={setAllowLate} />
                <ToggleRow label={vi.assignments.shuffle} checked={shuffle} onChange={setShuffle} />
                <ToggleRow
                  label={tr("Trộn thứ tự đáp án A/B/C/D", "Shuffle A/B/C/D options")}
                  checked={shuffleOptions}
                  onChange={setShuffleOptions}
                  testId="shuffle-options-switch"
                />
                <ToggleRow
                  label={tr("Mỗi màn một câu (tập trung)", "One question per screen")}
                  checked={oneQuestionPerPage}
                  onChange={setOneQuestionPerPage}
                  testId="one-question-per-page-switch"
                />
                <ToggleRow
                  label={tr("Nhắc hạn nộp trước 24 giờ", "Remind students 24h before due")}
                  checked={remindBeforeDue}
                  onChange={setRemindBeforeDue}
                  testId="remind-before-due-switch"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={tr("Thang điểm hiển thị", "Score display scale")} htmlFor="score-scale">
                  <select
                    id="score-scale"
                    value={scoreScale}
                    onChange={(e) => setScoreScale(e.target.value as ScoreScale)}
                    data-testid="score-scale-select"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0B1C30] outline-none focus:border-[#4F46E5]"
                  >
                    {(["SCALE_10", "SCALE_100", "IELTS", "RAW"] as const).map((sc) => (
                      <option key={sc} value={sc}>
                        {scoreScaleLabel(sc, tr)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={tr("Hệ số điểm", "Score weight")} htmlFor="score-weight">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3].map((w) => (
                      <ChipButton key={w} active={weight === w} onClick={() => setWeight(w)}>
                        ×{w}
                      </ChipButton>
                    ))}
                    <Input
                      id="score-weight"
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={weight}
                      onChange={(e) =>
                        setWeight(Math.max(0.5, Math.min(10, Number(e.target.value) || 1)))
                      }
                      className="h-9 w-20 text-xs tabular-nums"
                      data-testid="score-weight-input"
                    />
                  </div>
                </Field>
              </div>
            </FormRow>

            <FormRow
              title={tr("Bảng xếp hạng", "Leaderboard")}
              hint={tr("Vinh danh học sinh trong lớp.", "Rank students in the class.")}
            >
              <Segmented
                value={showLeaderboard}
                onChange={(v) => setShowLeaderboard(v as LeaderboardMode)}
                options={(["AFTER_DUE", "AFTER_SUBMIT", "OFF"] as const).map((m) => ({
                  value: m,
                  label: vi.assignments.leaderboardModes[m],
                }))}
              />
              {showLeaderboard !== "OFF" && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ToggleRow label={vi.assignments.leaderboardAnon} checked={leaderboardAnon} onChange={setLeaderboardAnon} />
                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
                    <span className="text-xs font-semibold text-[#0B1C30]">{tr("Tính điểm theo", "Score by")}</span>
                    <select
                      value={leaderboardScoreRule}
                      onChange={(e) => setLeaderboardScoreRule(e.target.value as "BEST" | "LAST")}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-[#0B1C30] outline-none focus:border-[#4F46E5]"
                    >
                      <option value="BEST">{tr("Lượt cao nhất", "Best attempt")}</option>
                      <option value="LAST">{tr("Lượt cuối", "Last attempt")}</option>
                    </select>
                  </label>
                </div>
              )}
              {unlimitedAttempts && showLeaderboard !== "OFF" && leaderboardScoreRule === "BEST" && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {tr(
                    "Không giới hạn lượt + lấy lượt cao nhất: học sinh có thể làm lại tới khi đạt điểm tối đa.",
                    "Unlimited attempts + best attempt lets students retry until they reach full marks."
                  )}
                </p>
              )}
            </FormRow>
          </section>

          {/* ===== Advanced (collapsible) ===== */}
          <details
            id="step-proctor"
            className="stitch-card group/adv scroll-mt-24"
            open={proctoringOn || blockCopyPaste || undefined}
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#EA580C]">
                  <Shield className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[#0B1C30]">
                    {tr("Chống gian lận & giám sát", "Anti-cheating & proctoring")}
                  </span>
                  <span className="block text-xs text-[#464555]">
                    {proctoringOn
                      ? [proctorMode !== "OFF" ? vi.proctor.modes[proctorMode] : null, requireCamera ? tr("Camera AI", "AI camera") : null]
                          .filter(Boolean)
                          .join(" · ")
                      : tr("Đang tắt · khoá màn hình, chặn copy, camera AI", "Off · screen lockdown, copy blocking, AI camera")}
                  </span>
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open/adv:rotate-180" />
            </summary>

            <div className="divide-y divide-slate-100 border-t border-slate-100">
              <FormRow
                title={tr("Mức giám sát", "Proctoring")}
                hint={tr("Theo dõi rời tab, thoát toàn màn hình…", "Watch tab switches, fullscreen exits…")}
              >
                <Segmented
                  value={proctorMode}
                  onChange={(v) => {
                    const m = v as ProctorMode;
                    setProctorMode(m);
                    if (m === "LOCKDOWN") {
                      setRequireFullscreen(true);
                      setBlockCopyPaste(true);
                    }
                  }}
                  options={(["OFF", "MONITOR", "LOCKDOWN", "SEB"] as const).map((m) => ({
                    value: m,
                    label: vi.proctor.modes[m],
                    testId: m,
                  }))}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(getSubjectProfile(selectedWs?.subject ?? editing?.worksheet?.subject).showDictationPreset ||
                    hasAudio) && (
                    <ChipButton onClick={() => applyPreset("DICTATION")}>
                      <ClipboardX className="mr-1 h-3.5 w-3.5" />
                      {tr("Mẫu: Chép chính tả", "Preset: Dictation")}
                    </ChipButton>
                  )}
                  <ChipButton onClick={() => applyPreset("MEMORIZE")}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    {tr("Mẫu: Học thuộc", "Preset: Memorization")}
                  </ChipButton>
                </div>

                {proctorMode !== "OFF" && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-[#464555]">{tr("Khi học sinh vi phạm", "When a student violates")}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(
                        [
                          ["WARN", 3, <Bell key="i" className="h-4 w-4 text-[#4F46E5]" />, tr("Chỉ cảnh báo", "Warn only"), tr("Ghi nhận, báo giáo viên", "Log and alert the teacher")],
                          ["LOCK_1", 1, <Lock key="i" className="h-4 w-4 text-[#BA1A1A]" />, tr("Khoá bài ngay", "Lock at once"), tr("Rời tab 1 lần là khoá", "Locked after 1 tab switch")],
                          ["RESTART_1", 1, <RefreshCcw key="i" className="h-4 w-4 text-[#EA580C]" />, tr("Làm lại từ đầu", "Start over"), tr("Xoá đáp án, giờ vẫn chạy", "Answers cleared, timer keeps running")],
                          ["AUTO_SUBMIT_3", 3, <ShieldAlert key="i" className="h-4 w-4 text-[#4F46E5]" />, tr("Tự nộp sau 3 lần", "Auto submit after 3"), tr("2 lần đầu chỉ cảnh báo", "Warn twice first")],
                        ] as const
                      ).map(([preset, n, icon, label, desc]) => {
                        const action = preset === "LOCK_1" ? "LOCK" : preset === "RESTART_1" ? "RESTART" : preset === "AUTO_SUBMIT_3" ? "AUTO_SUBMIT" : "WARN";
                        const active = violationAction === action && (action === "WARN" || maxViolations === n);
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className={cn(
                              "flex min-h-14 items-start gap-2.5 rounded-xl border p-3 text-left transition",
                              active ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-slate-200 bg-white hover:border-indigo-200"
                            )}
                          >
                            <span className="mt-0.5">{icon}</span>
                            <span>
                              <span className="block text-xs font-bold text-[#0B1C30]">{label}</span>
                              <span className="block text-[11px] text-[#464555]">{desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={tr("Hành động", "Action")} htmlFor="violation-action">
                        <select
                          id="violation-action"
                          value={violationAction}
                          onChange={(e) => setViolationAction(e.target.value as ViolationAction)}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-[#0B1C30] outline-none focus:border-[#4F46E5]"
                        >
                          <option value="WARN">{vi.proctor.actions.WARN}</option>
                          <option value="LOCK">{vi.proctor.actions.LOCK}</option>
                          <option value="RESTART">{vi.proctor.actions.RESTART}</option>
                          <option value="AUTO_SUBMIT">{vi.proctor.actions.AUTO_SUBMIT}</option>
                        </select>
                      </Field>
                      <Field label={tr("Ngưỡng (1–10 lần)", "Threshold (1–10)")} htmlFor="max-violations">
                        <Input
                          id="max-violations"
                          type="number"
                          min={1}
                          max={10}
                          value={maxViolations}
                          onChange={(e) => setMaxViolations(Number(e.target.value) || 1)}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <ToggleRow label={tr("Bắt buộc toàn màn hình", "Require fullscreen")} checked={requireFullscreen} onChange={setRequireFullscreen} />
                      <ToggleRow
                        label={tr("Báo vi phạm cho phụ huynh", "Share violations with parents")}
                        checked={shareProctorWithParent}
                        onChange={setShareProctorWithParent}
                      />
                    </div>
                    {proctorMode === "SEB" && (
                      <Field label="Safe Exam Browser — Config Key Hash" htmlFor="seb-hash">
                        <Input
                          id="seb-hash"
                          value={sebConfigKeyHash}
                          onChange={(e) => setSebConfigKeyHash(e.target.value)}
                          placeholder={tr("ConfigKeyHash của file .seb (tuỳ chọn)", "ConfigKeyHash of the .seb file (optional)")}
                          className="font-mono text-xs"
                        />
                      </Field>
                    )}
                    <p className="flex items-start gap-2 rounded-xl bg-[#EFF4FF] p-3 text-[11px] leading-relaxed text-[#464555]">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F46E5]" />
                      {vi.proctor.disclaimer}
                    </p>
                  </div>
                )}
              </FormRow>

              <FormRow
                title={tr("Camera AI", "AI camera")}
                hint={tr("Chạy trên máy học sinh, không gửi video lên server.", "Runs on the student's device; no video is uploaded.")}
              >
                <ToggleRow
                  label={tr("Bắt buộc bật camera giám sát", "Require AI webcam monitoring")}
                  checked={requireCamera}
                  onChange={setRequireCamera}
                  testId="require-camera-switch"
                />
                {requireCamera && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <ToggleRow
                        label={tr("Chụp ảnh khi có sự kiện", "Snapshot on events")}
                        hint={tr("320×240, tự xoá sau 30 ngày", "320×240, deleted after 30 days")}
                        checked={cameraSnapshots}
                        onChange={setCameraSnapshots}
                      />
                      <ToggleRow
                        label={tr("Tính vào số lần vi phạm", "Count as violations")}
                        hint={tr("Nên tắt: chỉ gắn cờ nghi vấn", "Recommended off: flag only")}
                        checked={cameraEnforce}
                        onChange={setCameraEnforce}
                      />
                    </div>
                    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {tr(
                        "AI có thể báo nhầm khi phòng tối hoặc học sinh cúi viết nháp. Tắt/chặn camera luôn bị ghi nhận.",
                        "AI may misfire in dim light or when students take notes. Turning the camera off is always recorded."
                      )}
                    </p>
                  </div>
                )}
              </FormRow>

              <FormRow
                title={tr("Chặn sao chép", "Copy protection")}
                hint={tr("Hợp với bài chép chính tả.", "Good for dictation.")}
              >
                <ToggleRow
                  label={tr("Chặn copy / dán / chuột phải, tắt gợi ý chính tả", "Block copy / paste / right-click, disable spellcheck")}
                  checked={blockCopyPaste}
                  onChange={setBlockCopyPaste}
                  testId="block-copy-paste-switch"
                />
              </FormRow>
            </div>
          </details>
        </div>

        {/* ===== Summary (sticky on desktop) ===== */}
        <aside className="lg:sticky lg:top-24">
          <div className="stitch-card overflow-hidden">
            <div className="bg-gradient-to-br from-[#4F46E5] to-[#6366F1] px-5 py-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
                {tr("Tóm tắt", "Summary")}
              </p>
              <p className="mt-1 line-clamp-2 text-base font-bold">{title || tr("Chưa đặt tên bài", "Untitled")}</p>
              <p className="mt-0.5 text-xs text-white/80">
                {selectedWs
                  ? tr(`${selectedWs._count.fields} câu hỏi`, `${selectedWs._count.fields} questions`)
                  : tr("Chưa chọn phiếu", "No worksheet yet")}
              </p>
            </div>
            <dl className="divide-y divide-slate-100 px-5 text-sm">
              <SummaryRow label={tr("Lớp", "Classes")} missing={selectedClasses.length === 0}>
                {selectedClasses.length === 0
                  ? tr("Chưa chọn", "None yet")
                  : selectedClasses.length <= 2
                    ? selectedClasses.map((c) => c.name).join(", ")
                    : tr(`${selectedClasses.length} lớp`, `${selectedClasses.length} classes`)}
                {selectedClasses.length > 0 && (
                  <span className="block text-[11px] font-normal text-[#464555]">
                    {selectedClassIds.length === 1 && targetMode === "SELECTED"
                      ? tr(`${targetStudentIds.length} học sinh được chọn`, `${targetStudentIds.length} selected students`)
                      : tr(`${totalSelectedStudents} học sinh`, `${totalSelectedStudents} students`)}
                  </span>
                )}
              </SummaryRow>
              <SummaryRow label={tr("Thang điểm", "Scale")}>
                {scoreScaleLabel(scoreScale, tr)} · ×{weight}
              </SummaryRow>
              <SummaryRow label={tr("Mở đề", "Opens")}>{fmt(openAt) ?? tr("Ngay khi giao", "Immediately")}</SummaryRow>
              <SummaryRow label={tr("Hạn nộp", "Due")}>{fmt(dueAt) ?? tr("Không có", "None")}</SummaryRow>
              <SummaryRow label={tr("Thời gian", "Time")}>
                {timeLimitMin ? tr(`${timeLimitMin} phút`, `${timeLimitMin} min`) : tr("Không giới hạn", "No limit")}
              </SummaryRow>
              <SummaryRow label={tr("Lượt làm", "Attempts")}>
                {formatAttemptsLimit(unlimitedAttempts ? null : maxAttempts, tr)}
              </SummaryRow>
              <SummaryRow label={tr("Kết quả", "Results")}>{vi.assignments.showResultModes[showResult]}</SummaryRow>
              <SummaryRow label={tr("Giám sát", "Proctoring")}>
                {proctoringOn ? (
                  <span className="inline-flex items-center gap-1 text-[#BA1A1A]">
                    <Lock className="h-3.5 w-3.5" />
                    {[violationSummary, requireCamera ? tr("Camera AI", "AI camera") : null].filter(Boolean).join(" · ")}
                  </span>
                ) : (
                  tr("Tắt", "Off")
                )}
              </SummaryRow>
              {(hasAudio || audioRestricted) && (
                <SummaryRow label={tr("File nghe", "Audio")}>
                  {audioRestricted
                    ? [
                        limitAudioPlays ? tr(`${audioMaxPlays} lượt`, `${audioMaxPlays} plays`) : null,
                        audioBlockPause ? tr("không dừng", "no pause") : null,
                        audioBlockSeek ? tr("không tua", "no seek") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : tr("Nghe thoải mái", "Unlimited")}
                </SummaryRow>
              )}
            </dl>
            <div className="space-y-2 border-t border-slate-100 p-4">
              <Button
                type="submit"
                variant="accent"
                size="lg"
                className="w-full"
                disabled={submitting || (isEdit && (editLoading || !prefilled))}
              >
                <Rocket className="h-4 w-4" />
                {submitLabel}
              </Button>
              {!canSubmit && (
                <p className="text-center text-[11px] text-[#464555]">
                  {!worksheetId
                    ? tr("Chọn phiếu bài tập để tiếp tục", "Choose a worksheet to continue")
                    : selectedClassIds.length === 0
                      ? tr("Chọn ít nhất một lớp", "Choose at least one class")
                      : tr("Nhập tên bài", "Enter a title")}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Phone / tablet: submit stays reachable while scrolling */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-semibold text-[#0B1C30]">{title || tr("Chưa đặt tên bài", "Untitled")}</p>
            <p className="truncate text-[#464555]">
              {selectedClassIds.length > 0
                ? tr(`${selectedClassIds.length} lớp · ${totalSelectedStudents} HS`, `${selectedClassIds.length} class(es) · ${totalSelectedStudents} students`)
                : tr("Chưa chọn lớp", "No class yet")}
            </p>
          </div>
          <Button
            type="submit"
            variant="accent"
            className="min-h-11 shrink-0"
            disabled={submitting || (isEdit && (editLoading || !prefilled))}
          >
            <Rocket className="h-4 w-4" />
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Settings-style row: label + hint on the left, controls on the right (stacked on phones). */
function FormRow({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="grid scroll-mt-24 grid-cols-1 gap-3 px-5 py-5 sm:px-6 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
      <div>
        <h2 className="text-sm font-bold text-[#0B1C30]">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-[#464555]">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold text-[#464555]">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-[#464555]">{hint}</p>}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; testId?: string }>;
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-1 rounded-xl bg-[#EFF4FF] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-proctor-mode={o.testId}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-10 rounded-lg px-2 text-xs font-semibold transition",
            value === o.value ? "bg-white text-[#3525CD] shadow-sm" : "text-[#464555] hover:text-[#0B1C30]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[#0B1C30]">{label}</span>
        {hint && <span className="block text-[11px] text-[#464555]">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </label>
  );
}

function SummaryRow({
  label,
  missing,
  children,
}: {
  label: string;
  missing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-[#464555]">{label}</dt>
      <dd className={cn("min-w-0 text-right text-xs font-semibold", missing ? "text-[#BA1A1A]" : "text-[#0B1C30]")}>
        {children}
      </dd>
    </div>
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
