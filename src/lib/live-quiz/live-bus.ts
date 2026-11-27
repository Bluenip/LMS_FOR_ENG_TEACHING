import { createRedisSubscriber, getRedisClient, type RedisLikeClient } from "@/lib/redis";
import type { LiveQuizEvent } from "./types";

type Listener = (event: LiveQuizEvent) => void;

export interface LiveQuizBusDriver {
  subscribe(sessionId: string, listener: Listener): () => void;
  publish(event: LiveQuizEvent): void;
}

export const LIVE_QUIZ_CHANNEL_PREFIX = "pivora:livequiz:";

export class InMemoryLiveQuizBus implements LiveQuizBusDriver {
  private readonly channels = new Map<string, Set<Listener>>();

  subscribe(sessionId: string, listener: Listener): () => void {
    let set = this.channels.get(sessionId);
    if (!set) {
      set = new Set();
      this.channels.set(sessionId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.channels.delete(sessionId);
    };
  }

  publish(event: LiveQuizEvent): void {
    const set = this.channels.get(event.sessionId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // ignore a closed SSE sink
      }
    }
  }
}

/** Redis Pub/Sub fan-out across app instances; falls back to local delivery if Redis publish fails. */
export class RedisLiveQuizBus implements LiveQuizBusDriver {
  private readonly fallback = new InMemoryLiveQuizBus();
  private readonly local = new Map<string, Set<Listener>>();
  private attached = false;

  constructor(
    private readonly pub: Pick<RedisLikeClient, "publish">,
    private readonly sub: Pick<RedisLikeClient, "subscribe" | "unsubscribe" | "on">
  ) {}

  private ensureAttached() {
    if (this.attached) return;
    this.attached = true;
    this.sub.on("message", (channel, raw) => {
      if (!channel.startsWith(LIVE_QUIZ_CHANNEL_PREFIX)) return;
      const set = this.local.get(channel.slice(LIVE_QUIZ_CHANNEL_PREFIX.length));
      if (!set) return;
      let parsed: LiveQuizEvent;
      try {
        parsed = JSON.parse(raw) as LiveQuizEvent;
      } catch {
        return;
      }
      for (const listener of set) {
        try {
          listener(parsed);
        } catch {
          // ignore a closed SSE sink
        }
      }
    });
  }

  subscribe(sessionId: string, listener: Listener): () => void {
    this.ensureAttached();
    const unsubFallback = this.fallback.subscribe(sessionId, listener);
    let set = this.local.get(sessionId);
    const first = !set;
    if (!set) {
      set = new Set();
      this.local.set(sessionId, set);
    }
    set.add(listener);
    if (first) {
      void Promise.resolve(this.sub.subscribe(`${LIVE_QUIZ_CHANNEL_PREFIX}${sessionId}`)).catch(
        () => undefined
      );
    }
    return () => {
      unsubFallback();
      const cur = this.local.get(sessionId);
      cur?.delete(listener);
      if (cur && cur.size === 0) {
        this.local.delete(sessionId);
        void Promise.resolve(
          this.sub.unsubscribe(`${LIVE_QUIZ_CHANNEL_PREFIX}${sessionId}`)
        ).catch(() => undefined);
      }
    };
  }

  publish(event: LiveQuizEvent): void {
    void Promise.resolve(
      this.pub.publish(`${LIVE_QUIZ_CHANNEL_PREFIX}${event.sessionId}`, JSON.stringify(event))
    ).catch(() => this.fallback.publish(event));
  }
}

const globalBus = globalThis as unknown as { __pivoraLiveQuizBus?: LiveQuizBusDriver };

export function getLiveQuizBus(): LiveQuizBusDriver {
  if (!globalBus.__pivoraLiveQuizBus) {
    const pub = getRedisClient();
    const sub = pub ? createRedisSubscriber() : null;
    globalBus.__pivoraLiveQuizBus =
      pub && sub ? new RedisLiveQuizBus(pub, sub) : new InMemoryLiveQuizBus();
  }
  return globalBus.__pivoraLiveQuizBus;
}

export function setLiveQuizBusForTest(driver: LiveQuizBusDriver | null): void {
  globalBus.__pivoraLiveQuizBus = driver ?? undefined;
}

export function publishLiveQuizEvent(event: Omit<LiveQuizEvent, "at">): void {
  getLiveQuizBus().publish({ ...event, at: new Date().toISOString() });
}

export function subscribeLiveQuiz(sessionId: string, listener: Listener): () => void {
  return getLiveQuizBus().subscribe(sessionId, listener);
}
