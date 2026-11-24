"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import {
  ArrowDown,
  ArrowUp,
  Award,
  Crown,
  Info,
  Lock,
  Minus,
  Trophy,
} from "lucide-react";
import { cn, formatDurationMs, getInitials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import type {
  AssignmentLeaderboardResponse,
  ClassLeaderboardResponse,
  LeaderboardEntryDTO,
} from "@/server/leaderboardService";

interface AssignmentOption {
  id: string;
  title: string;
  dueAt: string | null;
  showLeaderboard: string;
  leaderboardAnon: boolean;
}

interface LeaderboardViewProps {
  classId: string;
  className: string;
  isTeacher: boolean;
  initialAssignmentId?: string;
}

export function LeaderboardView({
  classId,
  className,
  isTeacher,
  initialAssignmentId,
}: LeaderboardViewProps) {
  const { m: vi, tr } = useI18n();
  const [mode, setMode] = useState<"ASSIGNMENT" | "CLASS">(
    initialAssignmentId ? "ASSIGNMENT" : "ASSIGNMENT"
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>(
    initialAssignmentId ?? ""
  );
  const [scoreRule, setScoreRule] = useState<"BEST" | "LAST">("BEST");
  const [missingZero, setMissingZero] = useState(true);

  const { data, isLoading } = useQuery<{
    leaderboard: AssignmentLeaderboardResponse | ClassLeaderboardResponse;
    assignments: AssignmentOption[];
  }>({
    queryKey: ["leaderboard", classId, mode, selectedAssignmentId, scoreRule, missingZero],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mode === "ASSIGNMENT" && selectedAssignmentId) {
        params.set("assignmentId", selectedAssignmentId);
        params.set("scoreRule", scoreRule);
      } else if (mode === "CLASS") {
        params.set("missingZero", String(missingZero));
      }
      const json = await apiFetchJson<{
        leaderboard: AssignmentLeaderboardResponse | ClassLeaderboardResponse;
        assignments: AssignmentOption[];
      }>(
        `/api/classes/${classId}/leaderboard?${params.toString()}`,
        undefined,
        tr("Không thể tải bảng xếp hạng", "Could not load the leaderboard")
      );
      // Auto-select first assignment if in ASSIGNMENT mode with none selected yet
      if (mode === "ASSIGNMENT" && !selectedAssignmentId && json.assignments?.length > 0) {
        setSelectedAssignmentId(json.assignments[0]!.id);
      }
      return json;
    },
  });

  const assignments = data?.assignments ?? [];
  const lb = data?.leaderboard;
  const hidden = Boolean(lb && lb.visible === false);
  const entries: LeaderboardEntryDTO[] = lb && !hidden ? lb.entries : [];
  const currentUserEntry = lb && !hidden ? lb.currentUserEntry : null;

  const top1 = entries[0];
  const top2 = entries[1];
  const top3 = entries[2];

  return (
    <div className="space-y-6 pb-20">
      {/* Stitch Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#464555]">
            {className} {tr("› Bảng vinh danh & Xếp hạng", "› Hall of fame & ranking")}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-[#0B1C30]">
            {vi.leaderboard.title} — {className}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Toggle */}
          <div className="inline-flex rounded-xl bg-[#EFF4FF] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("ASSIGNMENT");
                if (!selectedAssignmentId && assignments[0]) {
                  setSelectedAssignmentId(assignments[0].id);
                }
              }}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-bold transition",
                mode === "ASSIGNMENT"
                  ? "bg-[#4F46E5] text-white shadow-sm"
                  : "text-[#464555] hover:text-[#3525CD]"
              )}
            >
              {vi.leaderboard.byAssignment}
            </button>
            <button
              type="button"
              onClick={() => setMode("CLASS")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-bold transition",
                mode === "CLASS"
                  ? "bg-[#4F46E5] text-white shadow-sm"
                  : "text-[#464555] hover:text-[#3525CD]"
              )}
            >
              {vi.leaderboard.byClass}
            </button>
          </div>

          {mode === "ASSIGNMENT" && assignments.length > 0 && (
            <select
              value={selectedAssignmentId}
              onChange={(e) => setSelectedAssignmentId(e.target.value)}
              className="h-9 max-w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B1C30] outline-none focus:border-[#4F46E5]"
            >
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          )}

          {mode === "ASSIGNMENT" && isTeacher && (
            <select
              value={scoreRule}
              onChange={(e) => setScoreRule(e.target.value as "BEST" | "LAST")}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B1C30] outline-none"
            >
              <option value="BEST">{tr("Lượt điểm cao nhất", "Best attempt")}</option>
              <option value="LAST">{tr("Lượt nộp gần nhất", "Latest attempt")}</option>
            </select>
          )}

          {mode === "CLASS" && isTeacher && (
            <select
              value={missingZero ? "zero" : "skip"}
              onChange={(e) => setMissingZero(e.target.value === "zero")}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B1C30] outline-none"
            >
              <option value="zero">{tr("Bài chưa làm = 0 điểm", "Missing work = 0 points")}</option>
              <option value="skip">{tr("Bỏ qua bài chưa làm", "Ignore missing work")}</option>
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">
          {vi.common.loading}
        </div>
      ) : hidden ? (
        <div className="stitch-card flex flex-col items-center justify-center p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4F46E5]">
            <Lock className="h-6 w-6" />
          </span>
          <h3 className="mt-3 text-base font-bold text-[#0B1C30]">
            {tr("Bảng xếp hạng hiện đang ẩn", "The leaderboard is hidden")}
          </h3>
          <p className="mt-1 max-w-md text-sm text-[#464555]">
            {lb?.hiddenReason ?? vi.leaderboard.hiddenUntilDue}
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-500">
          {tr("Chưa có bài nộp hợp lệ nào để xếp hạng.", "No valid submissions to rank yet.")}
        </div>
      ) : (
        <>
          {/* Stitch Top 3 Podium Card */}
          <div className="stitch-card p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#F97316]" />
                <div>
                  <h2 className="text-base font-bold text-[#0B1C30]">
                    {vi.leaderboard.podiumTitle}
                  </h2>
                  <p className="text-xs text-[#464555]">
                    {tr("Top 3 học sinh có thành tích xuất sắc nhất", "Top 3 best-performing students")}
                  </p>
                </div>
              </div>
              {lb?.anonymized && (
                <Badge variant="default">{tr("Chế độ ẩn danh (chỉ hiện tên Top 3 & bạn)", "Anonymous mode (only top 3 & you are named)")}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
              {/* Rank 2 - Silver */}
              <div className="order-2 md:order-1">
                {top2 && (
                  <div className="rounded-2xl border border-slate-200 bg-[#F8F9FF] p-5 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700 ring-4 ring-white dark:ring-slate-900">
                      {getInitials(top2.displayName)}
                    </div>
                    <Badge variant="neutral" className="mt-2">
                      {tr("Á Quân • Hạng", "Runner-up • Rank")} {top2.rank}
                    </Badge>
                    <p className="mt-2 font-bold text-[#0B1C30]">{top2.displayName}</p>
                    <p className="mt-1 text-2xl font-bold text-[#3525CD] tabular-nums">
                      {top2.scoreScale10}
                      <span className="text-xs font-medium text-slate-400"> / 10</span>
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-2 text-xs">
                      <div>
                        <p className="text-[10px] text-slate-400">{tr("Thời gian", "Time")}</p>
                        <p className="font-semibold tabular-nums">
                          {formatDurationMs(top2.durationMs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">
                          {mode === "ASSIGNMENT" ? tr("Chính xác", "Correct") : tr("Đã làm", "Done")}
                        </p>
                        <p className="font-semibold tabular-nums">
                          {top2.correctCount}/{top2.totalQuestions}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rank 1 - Gold Champion */}
              <div className="order-1 md:order-2">
                {top1 && (
                  <div className="relative rounded-2xl border-2 border-[#F97316]/60 bg-gradient-to-b from-[#FFF7ED] to-white dark:from-[#2B1B10] dark:to-[#111A2E] p-6 text-center shadow-card-hover">
                    <Crown className="mx-auto mb-1 h-6 w-6 text-[#F97316]" />
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-base font-bold text-white ring-4 ring-orange-100 dark:ring-orange-500/25">
                      {getInitials(top1.displayName)}
                    </div>
                    <Badge variant="orange" className="mt-2">
                      {tr("Quán Quân • Hạng", "Champion • Rank")} {top1.rank}
                    </Badge>
                    <p className="mt-2 text-lg font-bold text-[#0B1C30]">
                      {top1.displayName}
                    </p>
                    <p className="mt-1 text-3xl font-extrabold text-[#EA580C] tabular-nums">
                      {top1.scoreScale10}
                      <span className="text-sm font-medium text-slate-400"> / 10</span>
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-2.5 text-xs border border-orange-100 dark:border-orange-500/30">
                      <div>
                        <p className="text-[10px] text-slate-400">{tr("Thời gian", "Time")}</p>
                        <p className="font-bold tabular-nums">
                          {formatDurationMs(top1.durationMs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">
                          {mode === "ASSIGNMENT" ? tr("Chính xác", "Correct") : tr("Đã làm", "Done")}
                        </p>
                        <p className="font-bold tabular-nums">
                          {top1.correctCount}/{top1.totalQuestions}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rank 3 - Bronze */}
              <div className="order-3">
                {top3 && (
                  <div className="rounded-2xl border border-amber-200/70 bg-[#FFFBEB]/60 dark:border-amber-500/35 dark:bg-amber-950/25 p-5 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-amber-900 ring-4 ring-white dark:bg-amber-500/25 dark:text-amber-300 dark:ring-slate-900">
                      {getInitials(top3.displayName)}
                    </div>
                    <Badge variant="outline" className="mt-2 border-amber-300 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300">
                      {tr("Hạng", "Rank")} {top3.rank}
                    </Badge>
                    <p className="mt-2 font-bold text-[#0B1C30]">{top3.displayName}</p>
                    <p className="mt-1 text-2xl font-bold text-[#3525CD] tabular-nums">
                      {top3.scoreScale10}
                      <span className="text-xs font-medium text-slate-400"> / 10</span>
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white p-2 text-xs">
                      <div>
                        <p className="text-[10px] text-slate-400">{tr("Thời gian", "Time")}</p>
                        <p className="font-semibold tabular-nums">
                          {formatDurationMs(top3.durationMs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">
                          {mode === "ASSIGNMENT" ? tr("Chính xác", "Correct") : tr("Đã làm", "Done")}
                        </p>
                        <p className="font-semibold tabular-nums">
                          {top3.correctCount}/{top3.totalQuestions}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Detailed Rankings Table */}
          <div className="stitch-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-[#4F46E5]" />
                <h2 className="text-base font-bold text-[#0B1C30]">
                  {tr("Bảng thành tích chi tiết (", "Detailed results (")}{entries.length} / {lb?.totalStudentsInClass ?? entries.length} {tr("học sinh)", "students)")}
                </h2>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8F9FF] text-xs font-bold uppercase text-[#464555]">
                  <tr>
                    <th className="px-6 py-3">{tr("Hạng", "Rank")}</th>
                    <th className="px-6 py-3">{tr("Học sinh", "Student")}</th>
                    <th className="px-6 py-3 text-right">{tr("Điểm (thang 10)", "Score (out of 10)")}</th>
                    <th className="px-6 py-3 text-center">{tr("Thời gian làm", "Time taken")}</th>
                    <th className="px-6 py-3 text-center">
                      {mode === "ASSIGNMENT" ? tr("Số câu đúng", "Correct answers") : tr("Bài hoàn thành", "Completed")}
                    </th>
                    <th className="px-6 py-3 text-center">{tr("Xu hướng", "Trend")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => (
                    <tr
                      key={`${entry.studentId}-${entry.rank}`}
                      className={cn(
                        "transition",
                        entry.isCurrentUser
                          ? "bg-[#EEF2FF]/80 font-semibold"
                          : "hover:bg-slate-50/80"
                      )}
                    >
                      <td className="px-6 py-3.5">
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                            entry.rank === 1
                              ? "bg-[#FFEDD5] text-[#EA580C]"
                              : entry.rank === 2
                                ? "bg-slate-200 text-slate-700"
                                : entry.rank === 3
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                  : "text-slate-600"
                          )}
                        >
                          {entry.rank}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E5EEFF] text-xs font-bold text-[#3525CD]">
                            {getInitials(entry.displayName)}
                          </span>
                          <span className="font-semibold text-[#0B1C30]">
                            {entry.displayName}
                          </span>
                          {entry.isCurrentUser && <Badge variant="indigo">{tr("Bạn", "You")}</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold tabular-nums">
                        <span
                          className={
                            entry.rank === 1 ? "text-[#EA580C]" : "text-[#3525CD]"
                          }
                        >
                          {entry.scoreScale10}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center text-slate-600 tabular-nums">
                        {formatDurationMs(entry.durationMs)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <Badge
                          variant={
                            entry.totalQuestions > 0 &&
                            entry.correctCount / entry.totalQuestions >= 0.8
                              ? "mint"
                              : "default"
                          }
                          className="tabular-nums"
                        >
                          {entry.correctCount}/{entry.totalQuestions}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {entry.trend === null ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : entry.trend > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600">
                            <ArrowUp className="h-3.5 w-3.5" />+{entry.trend}
                          </span>
                        ) : entry.trend < 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-red-600">
                            <ArrowDown className="h-3.5 w-3.5" />
                            {entry.trend}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-400">
                            <Minus className="h-3.5 w-3.5" />0
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-100 bg-[#F8F9FF] px-6 py-3 text-xs text-[#464555]">
              <Info className="h-4 w-4 text-[#4F46E5] shrink-0" />
              <span>{vi.leaderboard.tieRule}</span>
            </div>
          </div>
        </>
      )}

      {/* Pinned Current Student Bar (Stitch bottom bar) */}
      {currentUserEntry && (
        <div
          data-testid="pinned-student-rank"
          className="fixed inset-x-0 bottom-4 z-30 mx-auto max-w-4xl px-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#4F46E5]/30 bg-[#EEF2FF]/95 px-5 py-3.5 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4F46E5] text-sm font-extrabold text-white tabular-nums">
                {currentUserEntry.rank}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0B1C30]">
                    {currentUserEntry.displayName}
                  </span>
                  <Badge variant="indigo">{tr("Bạn", "You")}</Badge>
                </div>
                <p className="text-xs font-semibold text-[#3525CD]">
                  {tr("Bạn đang ở hạng", "You are ranked")} {currentUserEntry.rank}/{entries.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs">
              <div>
                <p className="text-slate-500">{tr("Điểm số", "Score")}</p>
                <p className="text-base font-bold text-[#3525CD] tabular-nums">
                  {currentUserEntry.scoreScale10} / 10
                </p>
              </div>
              <div>
                <p className="text-slate-500">{tr("Thời gian", "Time")}</p>
                <p className="font-bold text-[#0B1C30] tabular-nums">
                  {formatDurationMs(currentUserEntry.durationMs)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">{tr("Đúng", "Correct")}</p>
                <p className="font-bold text-[#0B1C30] tabular-nums">
                  {currentUserEntry.correctCount}/{currentUserEntry.totalQuestions}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
