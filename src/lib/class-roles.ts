export type ClassRoleValue = "OWNER" | "CO_TEACHER" | "ASSISTANT";

export const CLASS_ROLE_RANK: Record<ClassRoleValue, number> = {
  OWNER: 3,
  CO_TEACHER: 2,
  ASSISTANT: 1,
};

export type ClassAction =
  | "DELETE_CLASS"
  | "ARCHIVE_CLASS"
  | "TRANSFER_OWNER"
  | "MANAGE_TEACHERS"
  | "EDIT_CLASS"
  | "MANAGE_STUDENTS"
  | "ASSIGN_WORK"
  | "MANAGE_LESSONS"
  | "CLONE_CLASS"
  | "POST_MODERATE"
  | "GRADE"
  | "VIEW_REPORTS"
  | "LIVE_MONITOR"
  | "ATTENDANCE";

const ACTION_MIN_ROLE: Record<ClassAction, ClassRoleValue> = {
  DELETE_CLASS: "OWNER",
  ARCHIVE_CLASS: "OWNER",
  TRANSFER_OWNER: "OWNER",
  MANAGE_TEACHERS: "OWNER",
  EDIT_CLASS: "CO_TEACHER",
  MANAGE_STUDENTS: "CO_TEACHER",
  ASSIGN_WORK: "CO_TEACHER",
  MANAGE_LESSONS: "CO_TEACHER",
  CLONE_CLASS: "CO_TEACHER",
  POST_MODERATE: "CO_TEACHER",
  GRADE: "ASSISTANT",
  VIEW_REPORTS: "ASSISTANT",
  LIVE_MONITOR: "ASSISTANT",
  ATTENDANCE: "ASSISTANT",
};

/** Returns true if actual class role meets or exceeds the required class role hierarchy. */
export function hasMinClassRole(
  actual: ClassRoleValue | null | undefined,
  required: ClassRoleValue
): boolean {
  if (!actual) return false;
  return CLASS_ROLE_RANK[actual] >= CLASS_ROLE_RANK[required];
}

/** Checks whether an actor with given ClassRole (or platform admin) may perform a class action. */
export function canPerformClassAction(
  role: ClassRoleValue | null | undefined,
  action: ClassAction,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  return hasMinClassRole(role, ACTION_MIN_ROLE[action]);
}
