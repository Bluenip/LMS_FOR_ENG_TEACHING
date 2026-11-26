import type { ProctorMode, ViolationAction } from "@prisma/client";

export function describeProctorRuleSummary(
  assignment: {
    proctorMode: ProctorMode;
    violationAction: ViolationAction;
    maxViolations: number;
    requireCamera?: boolean;
    requireMicMonitor?: boolean;
  },
  tr: (viText: string, enText: string) => string = (v) => v
): string | null {
  const parts: string[] = [];
  if (assignment.proctorMode === "SEB") {
    parts.push(tr("Bắt buộc dùng Safe Exam Browser (SEB)", "Safe Exam Browser (SEB) required"));
  } else if (assignment.proctorMode !== "OFF") {
    switch (assignment.violationAction) {
      case "LOCK":
        parts.push(
          tr(
            `Rời tab ${assignment.maxViolations} lần → khoá bài`,
            `Leave tab ${assignment.maxViolations}× → locked`
          )
        );
        break;
      case "RESTART":
        parts.push(
          tr(
            `Vi phạm ${assignment.maxViolations} lần → làm lại từ đầu`,
            `${assignment.maxViolations} violation(s) → start over`
          )
        );
        break;
      case "AUTO_SUBMIT":
        parts.push(
          tr(
            `Vi phạm ${assignment.maxViolations} lần → tự nộp bài`,
            `${assignment.maxViolations} violation(s) → auto submit`
          )
        );
        break;
      case "WARN":
      default:
        parts.push(
          tr(
            "Ghi nhận vi phạm & cảnh báo giáo viên trực tiếp",
            "Violations logged & teacher alerted live"
          )
        );
        break;
    }
  }
  if (assignment.requireCamera) {
    parts.push(tr("Bắt buộc bật camera AI", "AI camera required"));
  }
  if (assignment.requireMicMonitor) {
    parts.push(tr("Giám sát tiếng nói (Mic RAM)", "Voice monitor (Mic RAM)"));
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}
