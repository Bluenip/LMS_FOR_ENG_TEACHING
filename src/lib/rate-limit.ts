import { getRedisClient, type RedisLikeClient } from "@/lib/redis";

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Sliding-window in-memory rate limiter for auth endpoints (login/register).
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, entry);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - entry.timestamps.length),
    retryAfterSec: 0,
  };
}

/**
 * Distributed fixed-window rate limiter backed by Redis (`INCR` + `PEXPIRE`) when `REDIS_URL` is configured,
 * transparently falling back to `checkRateLimit` when running single-node or if Redis errors.
 */
export async function checkRateLimitAsync(
  key: string,
  maxRequests: number,
  windowMs: number,
  redisOverride?: Pick<RedisLikeClient, "incr" | "pexpire" | "pttl"> | null
): Promise<RateLimitResult> {
  const redis = redisOverride !== undefined ? redisOverride : getRedisClient();
  if (!redis) {
    return checkRateLimit(key, maxRequests, windowMs);
  }

  const redisKey = `pivora:rl:${key}`;
  try {
    const count = await redis.incr(redisKey);
    let ttlMs = windowMs;
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    } else {
      const currentTtl = await redis.pttl(redisKey);
      if (currentTtl > 0) {
        ttlMs = currentTtl;
      } else {
        await redis.pexpire(redisKey, windowMs);
      }
    }

    if (count > maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)),
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - count),
      retryAfterSec: 0,
    };
  } catch {
    return checkRateLimit(key, maxRequests, windowMs);
  }
}

export function resetRateLimits(): void {
  store.clear();
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "local";
}
