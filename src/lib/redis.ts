import Redis from "ioredis";

export interface RedisLikeClient {
  publish(channel: string, message: string): Promise<number | unknown>;
  subscribe(channel: string): Promise<number | unknown>;
  unsubscribe(channel: string): Promise<number | unknown>;
  on(event: "message", listener: (channel: string, message: string) => void): unknown;
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
}

const globalRedis = globalThis as unknown as {
  __pivoraRedisClient?: Redis | null;
};

/**
 * Returns the shared lazy Redis client if `REDIS_URL` is configured, or `null` in single-node/In-Memory mode.
 */
export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!globalRedis.__pivoraRedisClient) {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });
    client.on("error", () => {
      // Silently swallow transient Redis connection errors; callers fall back to In-Memory
    });
    globalRedis.__pivoraRedisClient = client;
  }
  return globalRedis.__pivoraRedisClient;
}

/**
 * Creates a dedicated Redis connection for Pub/Sub subscribe loops (ioredis requires separate connections).
 */
export function createRedisSubscriber(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const sub = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 300, 2000);
    },
  });
  sub.on("error", () => {
    // Fallback handles dropped subscriber gracefully
  });
  return sub;
}
