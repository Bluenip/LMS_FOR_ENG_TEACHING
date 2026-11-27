import { describe, expect, it } from "vitest";
import { CalcError, evaluate } from "@/lib/exam-tools/calculator";
import { PERIODIC_TABLE, findElement } from "@/lib/exam-tools/periodic-table";
import { assignPeerReviewers } from "@/lib/peer-review/matcher";

describe("Phase 31 Unit: calculator, periodic table & peer-review matcher", () => {
  it("evaluates scientific expressions with precedence, unary minus and angle modes", () => {
    expect(evaluate("2+3*4")).toBe(14);
    expect(evaluate("(2+3)*4")).toBe(20);
    expect(evaluate("2^3^2")).toBe(512); // right associative
    expect(evaluate("-2^2")).toBe(-4);
    expect(evaluate("2(3+1)")).toBe(8);
    expect(evaluate("sqrt(16)+5!")).toBe(124);
    expect(evaluate("sin(30)")).toBe(0.5);
    expect(evaluate("sin(pi/2)", "RAD")).toBe(1);
    expect(evaluate("cos(90)")).toBe(0);
    expect(evaluate("log(1000)+ln(e)")).toBe(4);
    expect(evaluate("3,5 × 2")).toBe(7);
    expect(evaluate("1.5e3/3")).toBe(500);
  });

  it("rejects malicious or invalid input without evaluating code", () => {
    for (const bad of ["alert(1)", "process.exit()", "constructor", "1;2", "Math.max(1)", "`x`", "a=1", "this"]) {
      expect(() => evaluate(bad)).toThrow(CalcError);
    }
    expect(() => evaluate("(1+2")).toThrow(CalcError);
    expect(() => evaluate("1/0")).toThrow(CalcError);
    expect(() => evaluate("1".repeat(300))).toThrow(CalcError);
  });

  it("periodic table has 118 consecutive elements and is searchable in VI/EN", () => {
    expect(PERIODIC_TABLE).toHaveLength(118);
    PERIODIC_TABLE.forEach((e, i) => expect(e.number).toBe(i + 1));
    expect(findElement("fe")[0]).toMatchObject({ nameVi: "Sắt", mass: 55.845, group: 8, period: 4 });
    expect(findElement("Lưu huỳnh")[0]!.symbol).toBe("S");
    expect(findElement("79")[0]!.nameEn).toBe("Gold");
    expect(findElement("La")[0]!.group).toBeNull();
  });

  it("peer review matching is a derangement with balanced load", () => {
    const subs = Array.from({ length: 7 }, (_, i) => ({ submissionId: `sub${i}`, studentId: `stu${i}` }));
    for (let seed = 0; seed < 20; seed++) {
      let x = seed + 1;
      const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const pairs = assignPeerReviewers(subs, 2, rng);
      expect(pairs).toHaveLength(14);
      const ownerOf = new Map(subs.map((s) => [s.submissionId, s.studentId]));
      for (const p of pairs) expect(ownerOf.get(p.submissionId)).not.toBe(p.reviewerId);
      const perSub = new Map<string, number>();
      const perReviewer = new Map<string, number>();
      for (const p of pairs) {
        perSub.set(p.submissionId, (perSub.get(p.submissionId) ?? 0) + 1);
        perReviewer.set(p.reviewerId, (perReviewer.get(p.reviewerId) ?? 0) + 1);
      }
      expect(new Set(perSub.values())).toEqual(new Set([2]));
      expect(new Set(perReviewer.values())).toEqual(new Set([2]));
      expect(new Set(pairs.map((p) => `${p.reviewerId}:${p.submissionId}`)).size).toBe(14);
    }
    expect(assignPeerReviewers(subs.slice(0, 2), 5)).toHaveLength(2); // capped at n-1
    expect(assignPeerReviewers(subs.slice(0, 1), 1)).toEqual([]);
  });
});
