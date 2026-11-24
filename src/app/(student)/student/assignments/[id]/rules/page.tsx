"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardX,
  Clock,
  FileQuestion,
  Maximize2,
  MonitorOff,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { vi } from "@/messages/vi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RulesPayload {
  assignment: {
    id: string;
    title: string;
    timeLimitMin: number | null;
    maxAttempts: number;
    proctorMode: "OFF" | "MONITOR" | "LOCKDOWN" | "SEB";
    violationAction: "WARN" | "LOCK" | "RESTART" | "AUTO_SUBMIT";
    maxViolations: number;
    requireFullscreen: boolean;
    blockCopyPaste: boolean;
    class: { id: string; name: string };
    worksheet: { fields: Array<{ id: string }>; questionCount?: number };
  };
  submission: {
    id: string;
    status: string;
    rulesAcceptedAt: string | null;
  } | null;
}

export default function StudentAssignmentRulesPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;
  const router = useRouter();

  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);

  const { data, isLoading, error } = useQuery<RulesPayload>({
    queryKey: ["assignment-rules", assignmentId],
    queryFn: async () => {
      const res = await fetch(`/api/assignments/${assignmentId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Không tải được thông tin bài thi");
      }
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="stitch-card mx-auto max-w-2xl p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="stitch-card mx-auto max-w-2xl p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-red-600">
          {error instanceof Error ? error.message : "Không tìm thấy bài thi."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/student">Quay lại</Link>
        </Button>
      </div>
    );
  }

  const { assignment } = data;
  const isStrict =
    assignment.violationAction === "LOCK" ||
    assignment.violationAction === "RESTART" ||
    assignment.violationAction === "AUTO_SUBMIT";

  const handleStartExam = async () => {
    if (!agreed) return;
    setStarting(true);
    try {
      const attemptToken =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tok-${Date.now()}`;

      if (typeof window !== "undefined") {
        sessionStorage.setItem(`engclass_token_${assignmentId}`, attemptToken);
      }

      // Request fullscreen on user gesture if required
      if (
        (assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN") &&
        document.documentElement.requestFullscreen
      ) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Browsers in headless/automated test environments may deny fullscreen; handled by UI banner/guard
        }
      }

      const res = await fetch(`/api/assignments/${assignmentId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rulesAccepted: true, attemptToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không thể bắt đầu bài thi");

      router.push(`/student/assignments/${assignmentId}/do`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-4">
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-indigo-950/5">
        {/* Top gradient bar matching Stitch */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#3525CD] via-[#4F46E5] to-[#F97316]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2.5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4F46E5]">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
              {assignment.class.name}
            </p>
            <h1 className="text-2xl font-bold text-[#0B1C30]">{assignment.title}</h1>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {assignment.timeLimitMin && (
                <Badge variant="orange">
                  <Clock className="h-3 w-3" /> {assignment.timeLimitMin} phút
                </Badge>
              )}
              <Badge variant="default">
                <FileQuestion className="h-3 w-3" /> {assignment.worksheet.questionCount ?? assignment.worksheet.fields.length} câu hỏi
              </Badge>
              <Badge variant="danger">
                • {vi.proctor.badge} ({vi.proctor.modes[assignment.proctorMode]})
              </Badge>
              <Badge variant="neutral">{assignment.maxAttempts} lượt làm</Badge>
            </div>
          </div>

          {/* Rules List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#0B1C30]">
              <span>{vi.proctor.rulesTitle}</span>
              <span className="text-slate-400">Học sinh cần tuân thủ</span>
            </div>

            {(assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN") && (
              <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                  <Maximize2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0B1C30]">
                    Chế độ toàn màn hình (Full Screen)
                  </p>
                  <p className="text-xs text-[#464555]">
                    Bắt buộc duy trì chế độ toàn màn hình trong suốt quá trình làm bài.
                  </p>
                </div>
              </div>
            )}

            {(assignment.blockCopyPaste || assignment.proctorMode === "LOCKDOWN") && (
              <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                  <ClipboardX className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#0B1C30]">
                    Vô hiệu hoá sao chép &amp; dán
                  </p>
                  <p className="text-xs text-[#464555]">
                    Không được sao chép (Copy), dán (Paste), cắt hoặc mở menu chuột phải.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                <MonitorOff className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0B1C30]">
                  Không chuyển tab hoặc đổi ứng dụng
                </p>
                <p className="text-xs text-[#464555]">
                  Không mở tab trình duyệt khác, không thu nhỏ cửa sổ hay đăng nhập nhiều thiết bị.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-[#F8F9FF] p-3.5 border border-slate-100">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4F46E5] shadow-sm">
                <Radio className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0B1C30]">Giám sát &amp; cảnh báo tức thì</p>
                <p className="text-xs text-[#464555]">
                  Mọi hành vi rời màn hình được ghi theo giờ máy chủ và báo ngay cho giáo viên.
                </p>
              </div>
            </div>
          </div>

          {/* Strict Violation Rules Red Box (Stitch & PLAN 6C mandatory!) */}
          <div
            data-testid="strict-rules-box"
            className={
              isStrict
                ? "rounded-2xl border-2 border-red-200 bg-[#FEF2F2] p-4 text-xs text-[#93000A] space-y-2"
                : "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2"
            }
          >
            <p className="flex items-center gap-1.5 text-sm font-bold text-[#BA1A1A]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              LUẬT XỬ LÝ VI PHẠM (ÁP DỤNG CHO BÀI THI NÀY)
            </p>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed">
              <li>
                Số lần vi phạm tối đa trước khi xử lý:{" "}
                <strong>{assignment.maxViolations} lần</strong>.
              </li>
              {assignment.violationAction === "LOCK" && (
                <li>
                  Chạm ngưỡng {assignment.maxViolations} lần →{" "}
                  <strong>BÀI THI BỊ KHOÁ NGAY LẬP TỨC</strong>. Đáp án đã làm được giữ lại, chỉ
                  giáo viên mới có quyền mở khoá để tiếp tục.
                </li>
              )}
              {assignment.violationAction === "RESTART" && (
                <li>
                  Chạm ngưỡng {assignment.maxViolations} lần →{" "}
                  <strong>HUỶ TOÀN BỘ ĐÁP ÁN &amp; BẮT BUỘC LÀM LẠI TỪ ĐẦU</strong>. Đồng hồ đếm
                  ngược KHÔNG được đặt lại.
                </li>
              )}
              {assignment.violationAction === "AUTO_SUBMIT" && (
                <li>
                  Chạm ngưỡng {assignment.maxViolations} lần →{" "}
                  <strong>HỆ THỐNG TỰ ĐỘNG NỘP BÀI NGAY</strong> với các đáp án hiện có.
                </li>
              )}
              {assignment.violationAction === "WARN" && (
                <li>
                  Mọi hành vi rời màn hình sẽ được ghi nhận vào nhật ký giám sát và báo giáo viên.
                </li>
              )}
              <li>
                Lưu ý: Đồng hồ làm bài tính theo máy chủ và vẫn tiếp tục đếm ngược trong thời gian
                bạn rời màn hình hoặc bị khoá bài.
              </li>
            </ul>
          </div>

          {/* Agreement Checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-indigo-300">
            <input
              type="checkbox"
              data-testid="rules-agree-checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#4F46E5]"
            />
            <span className="text-sm font-semibold text-[#0B1C30]">
              {vi.proctor.rulesAgree}
            </span>
          </label>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!agreed || starting}
              data-testid="start-proctored-btn"
              onClick={handleStartExam}
            >
              <Maximize2 className="h-4 w-4" />
              {starting
                ? "Đang khởi tạo ca thi…"
                : assignment.requireFullscreen || assignment.proctorMode === "LOCKDOWN"
                  ? vi.proctor.startFullscreen
                  : vi.proctor.startExam}
            </Button>

            <Button variant="secondary" className="w-full" asChild>
              <Link href="/student">
                <ArrowLeft className="h-4 w-4" /> Quay lại danh sách bài tập
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
