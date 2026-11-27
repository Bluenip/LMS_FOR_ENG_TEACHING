import { describe, expect, it } from "vitest";
import { computeLiveQuizPoints, liveQuizRatioToScore } from "@/lib/live-quiz/scoring";
import {
  generateLiveQuizPin,
  randomLiveQuizPin,
  sanitizeLiveQuestionForPlayer,
} from "@/lib/live-quiz/pin";
import { InMemoryLiveQuizBus, RedisLiveQuizBus } from "@/lib/live-quiz/live-bus";
import type { LiveQuizEvent, LiveQuizSnapshotQuestion } from "@/lib/live-quiz/types";

describe("Phase 27 Unit: Live Quiz scoring, PIN & sanitizing", () => {
  it("computeLiveQuizPoints: 0 when wrong, 500–1000 by speed, +50/streak capped at 5", () => {
    expect(computeLiveQuizPoints({ isCorrect: false, responseMs: 100, limitMs: 30000, streak: 4 })).toBe(0);
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: 0, limitMs: 30000, streak: 0 })).toBe(1000);
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: 15000, limitMs: 30000, streak: 0 })).toBe(750);
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: 30000, limitMs: 30000, streak: 0 })).toBe(500);
    // late answers never go below the 500 base, negative times never exceed 1000
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: 99999, limitMs: 30000, streak: 0 })).toBe(500);
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: -50, limitMs: 30000, streak: 0 })).toBe(1000);
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: 30000, limitMs: 30000, streak: 2 })).toBe(600);
    expect(computeLiveQuizPoints({ isCorrect: true, responseMs: 30000, limitMs: 30000, streak: 12 })).toBe(750);
  });

  it("liveQuizRatioToScore maps correct ratio onto the gradebook scale", () => {
    expect(liveQuizRatioToScore(3, 4, 10)).toBe(7.5);
    expect(liveQuizRatioToScore(2, 3, 10)).toBe(6.67);
    expect(liveQuizRatioToScore(5, 0, 10)).toBe(0);
    expect(liveQuizRatioToScore(9, 4, 10)).toBe(10);
  });

  it("generateLiveQuizPin produces 6 digits and retries on collisions", async () => {
    expect(randomLiveQuizPin(() => 0)).toBe("100000");
    expect(randomLiveQuizPin(() => 0.999999)).toBe("999999");

    const taken = new Set(["100000", "550000"]);
    const seq = [0, 0.5, 0.25];
    let i = 0;
    const pin = await generateLiveQuizPin(async (p) => taken.has(p), { random: () => seq[i++]! });
    expect(pin).toBe("325000");
    expect(pin).toMatch(/^\d{6}$/);

    await expect(
      generateLiveQuizPin(async () => true, { random: () => 0.1, maxAttempts: 3 })
    ).rejects.toThrow("LIVE_QUIZ_PIN_EXHAUSTED");
  });

  it("sanitizeLiveQuestionForPlayer never exposes the answer key or grading options", () => {
    const q: LiveQuizSnapshotQuestion = {
      id: "q1",
      type: "MULTIPLE_CHOICE",
      prompt: "2 + 2 = ?",
      options: [
        { id: "A", text: "3" },
        { id: "B", text: "4" },
      ],
      imageKey: null,
      timeLimitSec: 20,
      answerKey: { correct: "B" },
      gradingOpts: { caseSensitive: true },
    };
    const safe = sanitizeLiveQuestionForPlayer(q);
    expect(Object.keys(safe).sort()).toEqual(["id", "imageKey", "options", "prompt", "timeLimitSec", "type"]);
    expect(JSON.stringify(safe)).not.toContain("correct");
    expect(JSON.stringify(safe)).not.toContain("caseSensitive");
  });

  it("InMemoryLiveQuizBus delivers per session; RedisLiveQuizBus falls back locally when publish fails", async () => {
    const bus = new InMemoryLiveQuizBus();
    const got: LiveQuizEvent[] = [];
    const off = bus.subscribe("s1", (e) => got.push(e));
    bus.publish({ kind: "LOBBY_UPDATE", sessionId: "s1", at: "t", participantCount: 2 });
    bus.publish({ kind: "LOBBY_UPDATE", sessionId: "s2", at: "t" });
    off();
    bus.publish({ kind: "SESSION_END", sessionId: "s1", at: "t" });
    expect(got).toHaveLength(1);
    expect(got[0]!.participantCount).toBe(2);

    const subscribed: string[] = [];
    const redisBus = new RedisLiveQuizBus(
      { publish: async () => Promise.reject(new Error("down")) },
      {
        subscribe: async (c: string) => {
          subscribed.push(c);
          return 1;
        },
        unsubscribe: async () => 1,
        on: () => undefined,
      }
    );
    const received: LiveQuizEvent[] = [];
    redisBus.subscribe("abc", (e) => received.push(e));
    redisBus.publish({ kind: "QUESTION_START", sessionId: "abc", at: "t", questionIndex: 0 });
    await new Promise((r) => setTimeout(r, 10));
    expect(subscribed).toEqual(["pivora:livequiz:abc"]);
    expect(received.map((e) => e.kind)).toEqual(["QUESTION_START"]);
  });
});
