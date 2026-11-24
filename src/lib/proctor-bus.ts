import type { ProctorEventType, SubmissionStatus, ViolationAction } from "@prisma/client";

export interface LiveProctorPayload {
  kind:
    | "PROCTOR_EVENT"
    | "SUBMISSION_LOCKED"
    | "SUBMISSION_RESTARTED"
    | "SUBMISSION_SUBMITTED"
    | "SUBMISSION_UNLOCKED"
    | "SUBMISSION_STARTED"
    | "HEARTBEAT"
    | "TEACHER_REMINDER";
  assignmentId: string;
  submissionId: string;
  studentId: string;
  studentName: string;
  eventType?: ProctorEventType;
  durationMs?: number | null;
  violationCount?: number;
  maxViolations?: number;
  actionTaken?: ViolationAction | null;
  clearedAnswersCount?: number;
  status?: SubmissionStatus;
  answeredCount?: number;
  totalQuestions?: number;
  message?: string;
  at: string;
}

type Listener = (event: LiveProctorPayload) => void;

// Persist bus across HMR reloads in Next.js dev mode
const globalBus = globalThis as unknown as {
  __engclassProctorBus?: Map<string, Set<Listener>>;
};

function getChannels(): Map<string, Set<Listener>> {
  if (!globalBus.__engclassProctorBus) {
    globalBus.__engclassProctorBus = new Map<string, Set<Listener>>();
  }
  return globalBus.__engclassProctorBus;
}

export function subscribeAssignmentLive(assignmentId: string, listener: Listener): () => void {
  const channels = getChannels();
  let set = channels.get(assignmentId);
  if (!set) {
    set = new Set<Listener>();
    channels.set(assignmentId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      channels.delete(assignmentId);
    }
  };
}

export function publishAssignmentLive(payload: LiveProctorPayload): void {
  const set = getChannels().get(payload.assignmentId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(payload);
    } catch {
      // ignore disconnected stream listener error
    }
  }
}
