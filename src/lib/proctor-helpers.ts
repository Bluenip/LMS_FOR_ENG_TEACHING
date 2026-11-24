import type { ProctorMode, ViolationAction } from "@prisma/client";

export function describeProctorRuleSummary(assignment: {
  proctorMode: ProctorMode;
  violationAction: ViolationAction;
  maxViolations: number;
}, tr: (viText: string, enText: string) => string = (v) => v): string | null {
  if (assignment.proctorMode === "OFF") return null;
  if (assignment.proctorMode === "SEB") {
    return tr("Bắt buộc dùng Safe Exam Browser (SEB)", "Safe Exam Browser (SEB) required");
  }
  switch (assignment.violationAction) {
    case "LOCK":
      return tr(
        `Rời tab ${assignment.maxViolations} lần → khoá bài`,
        `Leave tab ${assignment.maxViolations}× → locked`
      );
    case "RESTART":
      return tr(
        `Vi phạm ${assignment.maxViolations} lần → làm lại từ đầu`,
        `${assignment.maxViolations} violation(s) → start over`
      );
    case "AUTO_SUBMIT":
      return tr(
        `Vi phạm ${assignment.maxViolations} lần → tự nộp bài`,
        `${assignment.maxViolations} violation(s) → auto submit`
      );
    case "WARN":
    default:
      return tr(
        "Ghi nhận vi phạm & cảnh báo giáo viên trực tiếp",
        "Violations logged & teacher alerted live"
      );
  }
}
