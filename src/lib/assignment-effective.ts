export interface BaseAssignmentTiming {
  dueAt: Date | null;
  timeLimitMin: number | null;
  maxAttempts: number | null;
}

export interface StudentAssignmentOverrideLike {
  extraAttempts: number;
  dueAt: Date | null;
  timeLimitMin: number | null;
}

export interface EffectiveAssignmentTiming {
  dueAt: Date | null;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  hasOverride: boolean;
}

/**
 * Resolves effective deadline, attempt cap, and time limit for one student
 * after applying an optional per-student AssignmentOverride.
 */
export function resolveEffectiveAssignment(
  assignment: BaseAssignmentTiming,
  override?: StudentAssignmentOverrideLike | null
): EffectiveAssignmentTiming {
  const extraAttempts = Math.max(0, Math.floor(override?.extraAttempts ?? 0));
  const maxAttempts =
    assignment.maxAttempts === null
      ? null
      : assignment.maxAttempts + extraAttempts;
  const dueAt = override?.dueAt ?? assignment.dueAt;
  const timeLimitMin = override?.timeLimitMin ?? assignment.timeLimitMin;
  const hasOverride = Boolean(
    override &&
      (extraAttempts > 0 || override.dueAt !== null || override.timeLimitMin !== null)
  );
  return {
    dueAt,
    timeLimitMin,
    maxAttempts,
    hasOverride,
  };
}
