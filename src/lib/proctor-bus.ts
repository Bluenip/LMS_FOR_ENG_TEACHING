import type { ProctorEventType, SubmissionStatus, ViolationAction } from "@prisma/client";
import { createRedisSubscriber, getRedisClient, type RedisLikeClient } from "@/lib/redis";

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

export interface ProctorBusDriver {
  subscribe(assignmentId: string, listener: Listener): () => void;
  publish(payload: LiveProctorPayload): void;
}

const CHANNEL_PREFIX = "pivora:proctor:";

export class InMemoryProctorBus implements ProctorBusDriver {
  private readonly channels = new Map<string, Set<Listener>>();

  subscribe(assignmentId: string, listener: Listener): () => void {
    let set = this.channels.get(assignmentId);
    if (!set) {
      set = new Set<Listener>();
      this.channels.set(assignmentId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.channels.delete(assignmentId);
      }
    };
  }

  publish(payload: LiveProctorPayload): void {
    const set = this.channels.get(payload.assignmentId);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        // ignore disconnected stream listener error
      }
    }
  }
}

export class RedisProctorBus implements ProctorBusDriver {
  private readonly fallback = new InMemoryProctorBus();
  private readonly localChannels = new Map<string, Set<Listener>>();
  private attached = false;

  constructor(
    private readonly pub: Pick<RedisLikeClient, "publish">,
    private readonly sub: Pick<RedisLikeClient, "subscribe" | "unsubscribe" | "on">
  ) {}

  private ensureAttached() {
    if (this.attached) return;
    this.attached = true;
    this.sub.on("message", (channel, raw) => {
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      const assignmentId = channel.slice(CHANNEL_PREFIX.length);
      const set = this.localChannels.get(assignmentId);
      if (!set || set.size === 0) return;
      try {
        const parsed = JSON.parse(raw) as LiveProctorPayload;
        for (const listener of set) {
          try {
            listener(parsed);
          } catch {
            // ignore broken SSE sink
          }
        }
      } catch {
        // ignore malformed pubsub JSON
      }
    });
  }

  subscribe(assignmentId: string, listener: Listener): () => void {
    this.ensureAttached();
    const unsubFallback = this.fallback.subscribe(assignmentId, listener);
    let set = this.localChannels.get(assignmentId);
    const firstSubscriber = !set;
    if (!set) {
      set = new Set<Listener>();
      this.localChannels.set(assignmentId, set);
    }
    set.add(listener);

    if (firstSubscriber) {
      void Promise.resolve(this.sub.subscribe(`${CHANNEL_PREFIX}${assignmentId}`)).catch(() => {
        // Fallback already active locally
      });
    }

    return () => {
      unsubFallback();
      const cur = this.localChannels.get(assignmentId);
      cur?.delete(listener);
      if (cur && cur.size === 0) {
        this.localChannels.delete(assignmentId);
        void Promise.resolve(this.sub.unsubscribe(`${CHANNEL_PREFIX}${assignmentId}`)).catch(
          () => undefined
        );
      }
    };
  }

  publish(payload: LiveProctorPayload): void {
    void Promise.resolve(
      this.pub.publish(`${CHANNEL_PREFIX}${payload.assignmentId}`, JSON.stringify(payload))
    ).catch(() => {
      this.fallback.publish(payload);
    });
  }
}

const globalBus = globalThis as unknown as {
  __pivoraProctorBusDriver?: ProctorBusDriver;
};

export function getProctorBusDriver(): ProctorBusDriver {
  if (!globalBus.__pivoraProctorBusDriver) {
    const pub = getRedisClient();
    const sub = pub ? createRedisSubscriber() : null;
    globalBus.__pivoraProctorBusDriver =
      pub && sub ? new RedisProctorBus(pub, sub) : new InMemoryProctorBus();
  }
  return globalBus.__pivoraProctorBusDriver;
}

export function setProctorBusDriverForTest(driver: ProctorBusDriver | null): void {
  globalBus.__pivoraProctorBusDriver = driver ?? undefined;
}

export function subscribeAssignmentLive(assignmentId: string, listener: Listener): () => void {
  return getProctorBusDriver().subscribe(assignmentId, listener);
}

export function publishAssignmentLive(payload: LiveProctorPayload): void {
  getProctorBusDriver().publish(payload);
}
