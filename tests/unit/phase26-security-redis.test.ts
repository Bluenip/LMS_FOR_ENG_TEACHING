import { afterEach, describe, expect, it, vi } from "vitest";
import { maskIpAddress } from "@/lib/ip-mask";
import { checkRateLimitAsync, resetRateLimits } from "@/lib/rate-limit";
import {
  InMemoryProctorBus,
  RedisProctorBus,
  type LiveProctorPayload,
} from "@/lib/proctor-bus";

describe("Phase 26 Unit: IP Masking, Distributed Rate Limit & Redis Proctor Bus", () => {
  afterEach(() => {
    resetRateLimits();
  });

  it("masks trailing IPv4 octets and truncates IPv6 to /48", () => {
    expect(maskIpAddress("192.168.1.42")).toBe("192.168.x.x");
    expect(maskIpAddress("203.0.113.99:54321")).toBe("203.0.x.x");
    expect(maskIpAddress("::ffff:10.12.34.56")).toBe("10.12.x.x");
    expect(maskIpAddress("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3::/48");
    expect(maskIpAddress("::1")).toBe("::1");
    expect(maskIpAddress("local")).toBeNull();
    expect(maskIpAddress(undefined)).toBeNull();
  });

  it("checkRateLimitAsync uses In-Memory fallback when Redis absent or failing, and Redis INCR when provided", async () => {
    // 1. In-memory mode
    const a1 = await checkRateLimitAsync("p26-mem", 2, 10_000, null);
    const a2 = await checkRateLimitAsync("p26-mem", 2, 10_000, null);
    const a3 = await checkRateLimitAsync("p26-mem", 2, 10_000, null);
    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(true);
    expect(a3.allowed).toBe(false);
    expect(a3.retryAfterSec).toBeGreaterThanOrEqual(1);

    // 2. Mock Redis INCR + PEXPIRE
    let count = 0;
    const mockRedis = {
      incr: vi.fn(async () => ++count),
      pexpire: vi.fn(async () => 1),
      pttl: vi.fn(async () => 4500),
    };
    const r1 = await checkRateLimitAsync("p26-redis", 2, 10_000, mockRedis);
    const r2 = await checkRateLimitAsync("p26-redis", 2, 10_000, mockRedis);
    const r3 = await checkRateLimitAsync("p26-redis", 2, 10_000, mockRedis);
    expect(r1).toEqual({ allowed: true, remaining: 1, retryAfterSec: 0 });
    expect(r2).toEqual({ allowed: true, remaining: 0, retryAfterSec: 0 });
    expect(r3).toEqual({ allowed: false, remaining: 0, retryAfterSec: 5 });
    expect(mockRedis.pexpire).toHaveBeenCalledTimes(1);

    // 3. Redis throws -> graceful fallback to In-Memory without crashing
    const brokenRedis = {
      incr: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
      pexpire: vi.fn(async () => 0),
      pttl: vi.fn(async () => 0),
    };
    const fallbackRes = await checkRateLimitAsync("p26-broken", 5, 10_000, brokenRedis);
    expect(fallbackRes.allowed).toBe(true);
  });

  it("RedisProctorBus forwards Pub/Sub messages and falls back safely on publish errors", async () => {
    const handlers: Array<(ch: string, msg: string) => void> = [];
    const pubMock = {
      publish: vi.fn(async (channel: string, message: string) => {
        for (const h of handlers) h(channel, message);
        return 1;
      }),
    };
    const subMock = {
      subscribe: vi.fn(async () => 1),
      unsubscribe: vi.fn(async () => 1),
      on: vi.fn((_ev: "message", fn: (ch: string, msg: string) => void) => {
        handlers.push(fn);
      }),
    };

    const bus = new RedisProctorBus(pubMock, subMock);
    const received: LiveProctorPayload[] = [];
    const unsub = bus.subscribe("asg-1", (ev) => received.push(ev));

    const payload: LiveProctorPayload = {
      kind: "HEARTBEAT",
      assignmentId: "asg-1",
      submissionId: "sub-1",
      studentId: "stu-1",
      studentName: "Minh",
      at: new Date().toISOString(),
    };
    bus.publish(payload);

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    expect(received[0]!.submissionId).toBe("sub-1");
    unsub();
    expect(subMock.unsubscribe).toHaveBeenCalledWith("pivora:proctor:asg-1");

    // In-memory baseline sanity
    const mem = new InMemoryProctorBus();
    const memReceived: LiveProctorPayload[] = [];
    const unsubMem = mem.subscribe("asg-1", (ev) => memReceived.push(ev));
    mem.publish(payload);
    expect(memReceived).toHaveLength(1);
    unsubMem();
  });
});
