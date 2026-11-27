import { describe, expect, it } from "vitest";
import {
  compareCode,
  compareEssays,
  mergeRanges,
  normalizeCodeTokens,
  normalizeEssayText,
  winnow,
} from "@/lib/plagiarism/winnowing";
import { buildOcrPrompt, buildOcrRequestBody, normalizeMathDelimiters, parseOcrQuestions } from "@/lib/ai/ocr-prompt";
import {
  buildRubricGradePrompt,
  buildRubricGradeRequestBody,
  parseRubricGrade,
  redactPii,
} from "@/lib/ai/rubric-grade-prompt";

const ORIGINAL =
  "Bảo vệ môi trường là trách nhiệm của mỗi người. Chúng ta cần giảm rác thải nhựa, trồng thêm cây xanh và tiết kiệm điện nước hằng ngày để Trái Đất luôn xanh sạch đẹp cho thế hệ mai sau.";

describe("Phase 29 Unit: Winnowing plagiarism detection", () => {
  it("normalizes Vietnamese essays: keeps diacritics, drops punctuation, keeps original offsets", () => {
    const tokens = normalizeEssayText("Trái Đất, XANH!");
    expect(tokens.map((t) => t.t)).toEqual(["trái", "đất", "xanh"]);
    expect("Trái Đất, XANH!".slice(tokens[1]!.start, tokens[1]!.end)).toBe("Đất");
  });

  it("identical / partially copied / unrelated Vietnamese essays", () => {
    expect(compareEssays(ORIGINAL, ORIGINAL).similarity).toBe(1);

    const partial =
      "Theo em, mùa hè năm nay rất nóng. " +
      "Chúng ta cần giảm rác thải nhựa, trồng thêm cây xanh và tiết kiệm điện nước hằng ngày. " +
      "Em thích đi bơi cùng bạn bè vào buổi chiều.";
    const r = compareEssays(ORIGINAL, partial);
    expect(r.similarity).toBeGreaterThan(0.3);
    expect(r.jaccard).toBeLessThan(r.containment);
    expect(r.matchedSpans.length).toBeGreaterThan(0);
    const span = r.matchedSpans[0]!;
    expect(ORIGINAL.slice(span.startA, span.endA)).toContain("giảm rác thải nhựa");
    expect(partial.slice(span.startB, span.endB)).toContain("giảm rác thải nhựa");

    const unrelated =
      "Hôm qua lớp em tổ chức đi tham quan bảo tàng lịch sử, các bạn được nghe kể về những trận đánh oai hùng của dân tộc.";
    expect(compareEssays(ORIGINAL, unrelated).similarity).toBe(0);
    // texts shorter than k words cannot be compared
    expect(compareEssays("xin chào", "xin chào").similarity).toBe(0);
  });

  it("catches copied code with renamed variables, new comments and strings", () => {
    const a = `def tong(n):
    # tinh tong
    s = 0
    for i in range(1, n + 1):
        s = s + i
    return s
print(tong(10))`;
    const b = `def sum_to(limit):
    total = 0  # khoi tao
    for k in range(1, limit + 1):
        total = total + k
    return total
print(sum_to(10))`;
    const other = `n = int(input())
if n % 2 == 0:
    print("chan")
else:
    print("le")`;
    expect(normalizeCodeTokens("x = 'abc' # hi", "python").map((t) => t.t)).toEqual(["ID", "=", "S"]);
    expect(compareCode(a, b, "python").similarity).toBe(1);
    expect(compareCode(a, other, "python").similarity).toBeLessThan(0.2);

    const js1 = "function add(a, b) { /* sum */ return a + b; } console.log(add(1, 2));";
    const js2 = "function plus(x, y) { return x + y; } // test\nconsole.log(plus(3, 4));";
    expect(compareCode(js1, js2, "javascript").similarity).toBe(1);
  });

  it("winnow keeps at least one fingerprint per window and merges ranges", () => {
    const fp = winnow([5, 3, 9, 3, 7, 8, 1, 6], 4);
    const picked = Array.from(fp.entries()).flatMap(([h, pos]) => pos.map((p) => [p, h]));
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(fp.has(1)).toBe(true);
    expect(mergeRanges([[5, 9], [0, 3], [2, 6]])).toEqual([[0, 9]]);
  });
});

describe("Phase 29 Unit: OCR & rubric grading prompts are PII-free", () => {
  it("OCR prompt forces JSON, LaTeX and ignores names; parsing keeps only supported types", () => {
    const prompt = buildOcrPrompt("MATH");
    expect(prompt).toContain("STRICT JSON");
    expect(prompt).toContain("$...$");
    const body = buildOcrRequestBody(
      Array.from({ length: 7 }, () => ({ mimeType: "image/png" as const, data: "AAAA" })),
      "MATH"
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0]!.parts).toHaveLength(1 + 5); // capped at 5 images

    const raw = JSON.stringify([
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Giải \\(x^2 = 4\\)",
        options: [
          { id: "A", text: "\\(x=2\\)" },
          { id: "B", text: "$x=\\pm 2$" },
        ],
        answerKey: { correct: "B" },
      },
      { type: "WORDSEARCH", prompt: "not allowed", options: { words: ["CAT"] } },
      { type: "ESSAY", prompt: "Viết đoạn văn \\[E=mc^2\\]" },
    ]);
    const qs = parseOcrQuestions(raw);
    expect(qs.map((q) => q.type)).toEqual(["MULTIPLE_CHOICE", "ESSAY"]);
    expect(qs[0]!.prompt).toBe("Giải $x^2 = 4$");
    expect((qs[0]!.options as Array<{ text: string }>)[0]!.text).toBe("$x=2$");
    expect(qs[1]!.prompt).toBe("Viết đoạn văn $$E=mc^2$$");
    expect(normalizeMathDelimiters("a \\(b\\) c")).toBe("a $b$ c");
  });

  it("redacts the student's name (with or without diacritics) and e-mails from answers", () => {
    const text = "Em là Nguyễn Văn Hùng (nguyen van hung). Mail: hung.nv@school.edu.vn. Bạn Hùng hay giúp em.";
    const red = redactPii(text, ["Nguyễn Văn Hùng", "hung.nv@school.edu.vn"]);
    expect(red).not.toMatch(/Nguyễn|Hùng|nguyen van hung|hung\.nv/i);
    expect(red).toContain("[ẩn]");
    // short common words are not destroyed
    expect(redactPii("Văn học rất hay", ["Văn"])).toBe("[ẩn] học rất hay");
    expect(redactPii("Em học Văn", ["An"])).toBe("Em học Văn");
  });

  it("grading prompt contains only question, key, rubric and the anonymised answer", () => {
    const rubric = [
      { id: "c1", title: "Nội dung", maxPoints: 2 },
      { id: "c2", title: "Diễn đạt", maxPoints: 1 },
    ];
    const answer = redactPii("Em tên Trần Thị Mai. Môi trường rất quan trọng.", ["Trần Thị Mai", "mai.tt@test.vn"]);
    const ctx = {
      questionType: "ESSAY" as const,
      questionPrompt: "Viết về môi trường",
      maxPoints: 3,
      modelAnswer: "Nêu được 2 giải pháp",
      rubric,
      answerText: answer,
      locale: "vi" as const,
    };
    const prompt = buildRubricGradePrompt(ctx);
    for (const pii of ["Trần", "Mai", "mai.tt@test.vn", "12A1"]) {
      expect(prompt).not.toContain(pii);
    }
    expect(prompt).toContain('id="c1"');
    expect(JSON.stringify(buildRubricGradeRequestBody(ctx))).not.toContain("Trần Thị Mai");
  });

  it("parseRubricGrade clamps rubric scores and totals, falls back to an overall score", () => {
    const rubric = [
      { id: "c1", title: "A", maxPoints: 2 },
      { id: "c2", title: "B", maxPoints: 1 },
    ];
    const parsed = parseRubricGrade(
      '```json\n{"rubricScores":{"c1":5,"c2":0.6},"score":99,"comment":"Tốt"}\n```',
      rubric,
      3
    );
    expect(parsed).toEqual({ score: 2.5, rubricScores: { c1: 2, c2: 0.5 }, comment: "Tốt" });
    expect(parseRubricGrade('{"score": 7.3, "comment": "ok"}', [], 5)).toEqual({ score: 5, rubricScores: null, comment: "ok" });
    expect(parseRubricGrade("not json", [], 5)).toBeNull();
  });
});
