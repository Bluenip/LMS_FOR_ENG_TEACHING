import type { ProctorMode, ViolationAction } from "@prisma/client";

export function describeProctorRuleSummary(assignment: {
  proctorMode: ProctorMode;
  violationAction: ViolationAction;
  maxViolations: number;
}): string | null {
  if (assignment.proctorMode === "OFF") return null;
  if (assignment.proctorMode === "SEB") {
    return "Bắt buộc dùng Safe Exam Browser (SEB)";
  }
  switch (assignment.violationAction) {
    case "LOCK":
      return `Rời tab ${assignment.maxViolations} lần → khoá bài`;
    case "RESTART":
      return `Vi phạm ${assignment.maxViolations} lần → làm lại từ đầu`;
    case "AUTO_SUBMIT":
      return `Vi phạm ${assignment.maxViolations} lần → tự nộp bài`;
    case "WARN":
    default:
      return "Ghi nhận vi phạm & cảnh báo giáo viên trực tiếp";
  }
}
