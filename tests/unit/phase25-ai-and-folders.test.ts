import { describe, expect, it } from "vitest";
import { buildFolderTree, wouldCreateFolderCycle } from "@/lib/folders/tree";
import {
  buildGeminiQuestionPrompt,
  parseAndSanitizeAiQuestions,
} from "@/lib/ai/gemini-prompt";

describe("Phase 25 Unit: Library Folder Tree & Cycle Prevention", () => {
  const sampleFolders = [
    { id: "rootA", parentId: null, name: "Ngữ pháp" },
    { id: "childB", parentId: "rootA", name: "Thì" },
    { id: "grandC", parentId: "childB", name: "Quá khứ đơn" },
    { id: "rootZ", parentId: null, name: "Đọc hiểu" },
  ];

  it("detects self-parenting and transitive cycles cleanly", () => {
    expect(wouldCreateFolderCycle(sampleFolders, "rootA", "rootA")).toBe(true);
    expect(wouldCreateFolderCycle(sampleFolders, "rootA", "childB")).toBe(true);
    expect(wouldCreateFolderCycle(sampleFolders, "rootA", "grandC")).toBe(true);
    expect(wouldCreateFolderCycle(sampleFolders, "rootA", "rootZ")).toBe(false);
    expect(wouldCreateFolderCycle(sampleFolders, "childB", null)).toBe(false);
  });

  it("builds deterministic nested tree sorted alphabetically", () => {
    const tree = buildFolderTree(sampleFolders);
    expect(tree.map((n) => n.name)).toEqual(["Đọc hiểu", "Ngữ pháp"]);
    const grammar = tree.find((n) => n.id === "rootA");
    expect(grammar?.children).toHaveLength(1);
    expect(grammar?.children[0]?.id).toBe("childB");
    expect(grammar?.children[0]?.children[0]?.id).toBe("grandC");
  });
});

describe("Phase 25 Unit: Gemini Question Prompt & Sanitizer", () => {
  it("builds structured prompt with count, subject, level and source material", () => {
    const prompt = buildGeminiQuestionPrompt({
      sourceText: "Photosynthesis converts sunlight into glucose.",
      subject: "BIOLOGY",
      count: 4,
      types: ["MULTIPLE_CHOICE", "TRUE_FALSE_GROUP"],
      level: "B1",
    });

    expect(prompt).toContain("subject=BIOLOGY");
    expect(prompt).toContain("level=B1");
    expect(prompt).toContain("Generate exactly 4 questions");
    expect(prompt).toContain("MULTIPLE_CHOICE, TRUE_FALSE_GROUP");
    expect(prompt).toContain("Photosynthesis converts sunlight into glucose.");
  });

  it("parses and sanitizes all 5 supported question types inside markdown fences", () => {
    const raw = [
      "Here is the generated JSON:",
      "```json",
      JSON.stringify([
        {
          type: "MULTIPLE_CHOICE",
          prompt: "What does photosynthesis produce?",
          points: 1,
          options: [
            { id: "a", text: "Glucose" },
            { id: "b", text: "Nitrogen" },
          ],
          answerKey: { correct: "Z" }, // invalid option -> falls back to first option A
          explanation: "Plants produce glucose and oxygen.",
          topicTag: "Biology",
        },
        {
          type: "TRUE_FALSE_GROUP",
          prompt: "Evaluate each statement:",
          points: 2,
          options: [
            { id: "a", text: "Chlorophyll absorbs light." },
            { id: "b", text: "Sunlight is unnecessary." },
          ],
          answerKey: { correct: { a: true, b: false } },
        },
        {
          type: "TEXT",
          prompt: "Fill the pigment name:",
          options: null,
          answerKey: { accepted: ["chlorophyll", ""] },
        },
        {
          type: "WORDSEARCH",
          prompt: "Find biology terms:",
          options: { words: ["PLANT", "LEAF", "A"], rows: 9, cols: 9 },
        },
        {
          type: "ESSAY",
          prompt: "Explain why leaves look green.",
          points: 3,
        },
        {
          // malformed entry missing prompt -> safely dropped
          type: "TEXT",
          prompt: "",
          answerKey: { accepted: ["ignored"] },
        },
      ]),
      "```",
    ].join("\n");

    const parsed = parseAndSanitizeAiQuestions(raw);
    expect(parsed).toHaveLength(5);

    expect(parsed[0]!.type).toBe("MULTIPLE_CHOICE");
    expect(parsed[0]!.answerKey).toEqual({ correct: "A" });

    expect(parsed[1]!.type).toBe("TRUE_FALSE_GROUP");
    expect(parsed[1]!.answerKey).toEqual({ correct: { a: true, b: false } });

    expect(parsed[2]!.type).toBe("TEXT");
    expect(parsed[2]!.answerKey).toEqual({ accepted: ["chlorophyll"] });

    expect(parsed[3]!.type).toBe("WORDSEARCH");
    const wsOpts = parsed[3]!.options as { grid: string[][]; words: string[] };
    expect(wsOpts.grid).toHaveLength(9);
    expect(wsOpts.words).toContain("PLANT");

    expect(parsed[4]!.type).toBe("ESSAY");
    expect(parsed[4]!.points).toBe(3);
  });

  it("returns empty array cleanly on garbage non-JSON text", () => {
    expect(parseAndSanitizeAiQuestions("Sorry, I cannot comply.")).toEqual([]);
  });
});
