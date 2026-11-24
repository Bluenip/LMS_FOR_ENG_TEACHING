"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  ClipboardX,
  Clock,
  Headphones,
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
import { cn, formatAttemptsLimit } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface WorksheetOption {
  id: string;
  title: string;
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
  class: { id: string; name: string };
  _count: { submissions: number };
}

/** ISO date -> value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewAssignmentForm() {
  const { m: vi, tr } = useI18n();
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
  const [allowLate, setAllowLate] = useState(false);
  const [oneQuestionPerPage, setOneQuestionPerPage] = useState(false);

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
    setAllowLate(editing.allowLate);
    setOneQuestionPerPage(editing.oneQuestionPerPage);
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

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Giao bài thất bại", "Assigning failed"));
      toast.success(
        isEdit
          ? tr("Đã cập nhật bài tập đã giao.", "Assignment updated.")
          : tr(`Đã giao bài cho ${json.assignments.length} lớp thành công!`, `Assigned to ${json.assignments.length} class(es) successfully!`)
      );
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
          {isEdit ? tr("Sửa bài tập đã giao", "Edit assignment") : vi.assignments.createTitle}
        </h1>
        {isEdit && editing && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
            {tr(
              `Lớp ${editing.class.name} · ${editing._count.submissions} lượt làm đã có được giữ nguyên. Tăng số lượt hoặc lùi hạn nộp sẽ báo cho học sinh.`,
              `Class ${editing.class.name} · the ${editing._count.submissions} existing attempts are kept. Students are notified when you add attempts or extend the deadline.`
            )}
          </p>
        )}
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
                  disabled={isEdit}
                  value={worksheetId}
                  onChange={(e) => {
                    setWorksheetId(e.target.value);
                    const ws = worksheets.find((w) => w.id === e.target.value);
                    if (ws) setTitle(ws.title);
                  }}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#4F46E5]"
                >
                  <option value="">{tr("— Chọn phiếu bài tập —", "— Choose a worksheet —")}</option>
                  {ownWorksheets.length > 0 && (
                    <optgroup label={tr("Phiếu bài tập của tôi", "My worksheets")}>
                      {ownWorksheets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.title} ({w._count.fields} {tr("câu)", "questions)")}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {sharedWorksheets.length > 0 && (
                    <optgroup label={tr("Giáo viên khác chia sẻ", "Shared by colleagues")}>
                      {sharedWorksheets.map((w) => (
                        <option key={w.id} value={w.id}>
                          [{w.owner?.name ?? "GV"}] {w.title} ({w._count.fields} {tr("câu)", "questions)")}
                        </option>
                      ))}
                    </optgroup>
                  )}
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
                        disabled={isEdit && !active}
                        onClick={() => !isEdit && toggleClass(c.id)}
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
                  <div className="space-y-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      disabled={unlimitedAttempts}
                      value={unlimitedAttempts ? "" : maxAttempts}
                      placeholder={unlimitedAttempts ? tr("Không giới hạn (∞)", "Unlimited (∞)") : undefined}
                      onChange={(e) => setMaxAttempts(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                      className="text-xs"
                      data-testid="max-attempts-input"
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[#464555]">
                      <input
                        type="checkbox"
                        checked={unlimitedAttempts}
                        onChange={(e) => setUnlimitedAttempts(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                        data-testid="unlimited-attempts-checkbox"
                      />
                      {tr("Không giới hạn lượt làm", "Unlimited attempts")}
                    </label>
                  </div>
                </div>
              </div>

              {/* Audio playback settings (per assignment, default = unlimited + allow pause + allow seek) */}
              <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Headphones className="h-4 w-4 text-[#4F46E5]" />
                    <span className="text-xs font-bold text-[#0B1C30]">
                      {tr("Cài đặt file nghe (Listening / Chép chính tả)", "Listening audio settings")}
                    </span>
                  </div>
                  {selectedWs && (
                    <Badge variant={(selectedWs._count.audios ?? 0) > 0 ? "default" : "neutral"}>
                      {(selectedWs._count.audios ?? 0) > 0
                        ? tr(`${selectedWs._count.audios} file nghe`, `${selectedWs._count.audios} audio track(s)`)
                        : tr("Phiếu chưa có file nghe", "No audio attached")}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-[#464555]">
                  {tr(
                    "Mặc định học sinh được nghe không giới hạn, được dừng và được tua. Tích vào các ô bên dưới nếu muốn siết chặt (áp dụng cho từng file nghe trong lượt làm).",
                    "By default students can play unlimited times, pause and seek. Tick the boxes below to restrict playback (applied per track in each attempt)."
                  )}
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#0B1C30]">
                      <input
                        type="checkbox"
                        checked={limitAudioPlays}
                        onChange={(e) => setLimitAudioPlays(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                        data-testid="audio-limit-checkbox"
                      />
                      {tr("Giới hạn số lần nghe", "Limit play count")}
                    </label>
                    {limitAudioPlays && (
                      <div className="flex items-center gap-2 pl-6">
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={audioMaxPlays}
                          onChange={(e) =>
                            setAudioMaxPlays(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                          }
                          className="h-8 w-20 text-xs"
                          data-testid="audio-max-plays-input"
                        />
                        <span className="text-[11px] text-[#464555]">
                          {tr("lần / file", "plays / track")}
                        </span>
                      </div>
                    )}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-[#0B1C30]">
                    <input
                      type="checkbox"
                      checked={audioBlockPause}
                      onChange={(e) => setAudioBlockPause(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                      data-testid="audio-block-pause-checkbox"
                    />
                    {tr("Không cho dừng (Pause)", "Disable pause")}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-[#0B1C30]">
                    <input
                      type="checkbox"
                      checked={audioBlockSeek}
                      onChange={(e) => setAudioBlockSeek(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#4F46E5]"
                      data-testid="audio-block-seek-checkbox"
                    />
                    {tr("Không cho tua (Seek)", "Disable seeking")}
                  </label>
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
                  <div>
                    <span className="block text-xs font-semibold text-[#0B1C30]">
                      {tr("Hiển thị từng câu một trên màn hình (Chế độ tập trung / Học thuộc)", "One question per screen (Focus / Memorization mode)")}
                    </span>
                    <span className="text-[11px] text-[#464555]">
                      {tr(
                        "Giúp học sinh tập trung cao độ, điền từ trực tiếp trong câu và nhấn Enter sang câu tiếp theo.",
                        "Shows one clean card at a time with inline fill-in-the-blank inputs and Enter-to-advance."
                      )}
                    </span>
                  </div>
                  <Switch
                    checked={oneQuestionPerPage}
                    onCheckedChange={setOneQuestionPerPage}
                    data-testid="one-question-per-page-switch"
                  />
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
                <label className="flex items-center justify-between rounded-xl bg-[#F8F9FF] px-4 py-3">
                  <div>
                    <span className="block text-xs font-semibold text-[#0B1C30]">
                      {tr("Chặn Copy / Paste / Kéo thả / Chuột phải (dùng được cả khi tắt chế độ thi)", "Block copy / paste / drag-drop / right-click (works even without proctoring)")}
                    </span>
                    <span className="text-[11px] text-[#464555]">
                      {tr(
                        "Tắt kiểm tra chính tả & gợi ý sửa từ trên ô trả lời — rất phù hợp bài chép chính tả tiếng Anh.",
                        "Also disables spellcheck & autocorrect on inputs — ideal for English dictation."
                      )}
                    </span>
                  </div>
                  <Switch
                    checked={blockCopyPaste}
                    onCheckedChange={setBlockCopyPaste}
                    data-testid="block-copy-paste-switch"
                  />
                </label>
                {unlimitedAttempts && showLeaderboard !== "OFF" && leaderboardScoreRule === "BEST" && (
                  <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {tr(
                      "Lưu ý: Khi bật không giới hạn lượt kết hợp quy tắc lấy điểm cao nhất, học sinh có thể làm đi làm lại đến khi đạt điểm tuyệt đối trên bảng xếp hạng.",
                      "Note: Unlimited attempts combined with 'Best attempt' lets students retry until they reach a perfect leaderboard score."
                    )}
                  </p>
                )}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs">{tr("Cấp độ bảo mật tổng thể", "Overall security level")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset("DICTATION")}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-bold text-[#3525CD] hover:bg-indigo-100 transition"
                  >
                    <ClipboardX className="h-3.5 w-3.5" />
                    {tr("Preset: Chép chính tả", "Preset: Dictation")}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("MEMORIZE")}
                    className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-[#FFEDD5] px-2.5 py-1 text-[11px] font-bold text-[#C2410C] hover:bg-orange-100 transition"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {tr("Preset: Học thuộc (1 câu/màn + Khoá màn)", "Preset: Memorization (Focus + Lockdown)")}
                  </button>
                </div>
              </div>
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

            {/* Layer 2: Webcam AI Proctoring (independent toggle, works with or without lockdown) */}
            <div className="rounded-2xl border border-indigo-200 bg-[#F8F9FF] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                    <Camera className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-[#0B1C30]">
                      {tr("Lớp 2: Giám sát bằng Camera AI (Webcam)", "Layer 2: AI Webcam Proctoring")}
                    </h3>
                    <p className="text-[11px] text-[#464555]">
                      {tr(
                        "Phát hiện rời chỗ, có từ 2 người, nhìn ra ngoài / cúi đầu lâu và phát hiện điện thoại — chạy trực tiếp trên trình duyệt, không truyền video lên server.",
                        "Detects missing face, multiple faces, prolonged looking away, and phones — runs locally in browser without streaming video."
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={requireCamera}
                  onCheckedChange={setRequireCamera}
                  data-testid="require-camera-switch"
                />
              </div>

              {requireCamera && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <div>
                        <span className="block text-xs font-semibold text-[#0B1C30]">
                          {tr("Chụp ảnh bằng chứng khi có sự kiện", "Capture snapshot on events")}
                        </span>
                        <span className="text-[10px] text-[#464555]">
                          {tr("Ảnh nhỏ 320×240, tự xoá sau 30 ngày", "Small 320×240 JPEG, auto-purged after 30 days")}
                        </span>
                      </div>
                      <Switch
                        checked={cameraSnapshots}
                        onCheckedChange={setCameraSnapshots}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <div>
                        <span className="block text-xs font-semibold text-[#0B1C30]">
                          {tr("Tính sự kiện AI vào số lần vi phạm", "Count AI events toward violations")}
                        </span>
                        <span className="text-[10px] text-[#464555]">
                          {tr("Tắt (khuyên dùng): chỉ gắn cờ nghi vấn", "Off (recommended): flag as suspicious only")}
                        </span>
                      </div>
                      <Switch
                        checked={cameraEnforce}
                        onCheckedChange={setCameraEnforce}
                      />
                    </label>
                  </div>
                  <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {tr(
                      "AI có thể báo nhầm khi phòng tối hoặc học sinh cúi viết nháp. Riêng hành vi tắt/chặn camera luôn bị ghi nhận và che đề thi. Chế độ SEB mặc định chặn camera trừ khi bật trong file .seb.",
                      "AI may produce false positives in dim lighting or when taking notes. Turning off camera is always enforced. SEB blocks camera unless allowed in .seb config."
                    )}
                  </p>
                </div>
              )}
            </div>
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
                  {formatAttemptsLimit(unlimitedAttempts ? null : maxAttempts, tr)}
                </span>
                {limitAudioPlays && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-slate-200">
                    <Headphones className="h-3 w-3 text-[#4F46E5]" />
                    {tr(`Nghe tối đa ${audioMaxPlays} lần`, `Max ${audioMaxPlays} plays`)}
                  </span>
                )}
                {requireCamera && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-red-200 text-[#BA1A1A]">
                    <Camera className="h-3 w-3" />
                    {tr("Camera AI", "AI Camera")}
                  </span>
                )}
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
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {tr("Chặn Copy/Paste, kéo thả & chuột phải", "Copy/paste, drag-drop & right-click blocked")}
                  </li>
                )}
                {(limitAudioPlays || audioBlockPause || audioBlockSeek) && (
                  <li className="flex items-center gap-1.5">
                    <Headphones className="h-3.5 w-3.5 text-[#4F46E5]" />{" "}
                    {[
                      limitAudioPlays ? tr(`Tối đa ${audioMaxPlays} lượt nghe`, `Max ${audioMaxPlays} plays`) : null,
                      audioBlockPause ? tr("không dừng", "no pause") : null,
                      audioBlockSeek ? tr("không tua", "no seek") : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </li>
                )}
                {requireCamera && (
                  <li className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-[#BA1A1A]" />{" "}
                    {tr("Bắt buộc bật camera AI giám sát", "AI webcam monitoring required")}
                  </li>
                )}
                {oneQuestionPerPage && (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {tr("Chế độ tập trung: hiển thị từng câu một", "Focus mode: one question per screen")}
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
              disabled={submitting || (isEdit && (editLoading || !prefilled))}
            >
              <Rocket className="h-4 w-4" />
              {submitting
                ? isEdit
                  ? tr("Đang lưu…", "Saving…")
                  : tr("Đang giao bài…", "Assigning…")
                : isEdit
                  ? tr("Lưu thay đổi", "Save changes")
                  : tr("Giao bài ngay", "Assign now")}
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
