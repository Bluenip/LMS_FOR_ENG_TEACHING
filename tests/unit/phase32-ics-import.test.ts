import { describe, expect, it } from "vitest";
import { buildIcsCalendar, escapeIcsText, foldIcsLine, formatIcsDate } from "@/lib/calendar/ics-generator";
import { exportAnkiCsv, parseAikenText, parseAnkiCsv, parseMoodleXml, parseQuizizzCsv } from "@/lib/import/standard-exam-parsers";

describe("Phase 32 Unit: iCalendar & standard exam importers", () => {
  it("builds RFC 5545 calendars: escaping, UTC dates, CRLF and 75-octet folding", () => {
    expect(escapeIcsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    expect(formatIcsDate(new Date("2026-11-27T07:30:00.000Z"))).toBe("20261127T073000Z");
    const long = `SUMMARY:${"Ôn tập ngữ pháp tiếng Anh lớp 12 ".repeat(5)}`;
    const folded = foldIcsLine(long);
    for (const physical of folded.split("\r\n")) expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);

    const ics = buildIcsCalendar(
      [
        {
          uid: "session-1@pivora",
          start: new Date("2026-12-01T12:00:00Z"),
          end: new Date("2026-12-01T13:30:00Z"),
          summary: "English 12A1, buổi 5",
          description: "Phòng 201; mang sách",
          stamp: new Date("2026-11-27T00:00:00Z"),
        },
      ],
      { name: "Lịch Pivora" }
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261201T120000Z\r\nDTEND:20261201T133000Z");
    expect(ics).toContain("SUMMARY:English 12A1\\, buổi 5");
    expect(ics).toContain("DESCRIPTION:Phòng 201\\; mang sách");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.includes("\n") && !/[^\r]\n/.test(ics)).toBe(true);
  });

  it("parses Aiken with warnings for broken blocks", () => {
    const res = parseAikenText(`What is 2+2?
A. 3
B. 4
ANSWER: B

Capital of Vietnam?
A) Hanoi
B) Hue
C) Da Nang
ANSWER: A

Broken question
A. only one
ANSWER: C`);
    expect(res.questions).toHaveLength(2);
    expect(res.questions[0]).toMatchObject({ type: "MULTIPLE_CHOICE", answerKey: { correct: "B" } });
    expect(res.questions[1]!.options).toHaveLength(3);
    expect(res.warnings).toHaveLength(1);
  });

  it("parses Moodle XML and refuses DTD / entity expansion (XXE, billion laughs)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/Unit 1</text></category></question>
  <question type="multichoice">
    <name><text>Q1</text></name>
    <questiontext format="html"><text><![CDATA[<p>Choose the <b>past</b> form of "go"</p>]]></text></questiontext>
    <defaultgrade>2</defaultgrade>
    <answer fraction="0"><text>goed</text></answer>
    <answer fraction="100"><text>went</text></answer>
  </question>
  <question type="truefalse">
    <questiontext><text>The sun is a star.</text></questiontext>
    <answer fraction="100"><text>true</text></answer>
    <answer fraction="0"><text>false</text></answer>
  </question>
  <question type="shortanswer">
    <questiontext><text>5 x 3 = ?</text></questiontext>
    <answer fraction="100"><text>15</text></answer>
  </question>
  <question type="essay"><questiontext><text>Describe your city.</text></questiontext></question>
  <question type="matching"><questiontext><text>unsupported</text></questiontext></question>
</quiz>`;
    const res = parseMoodleXml(xml);
    expect(res.questions.map((q) => q.type)).toEqual(["MULTIPLE_CHOICE", "TRUE_FALSE", "TEXT", "ESSAY"]);
    expect(res.questions[0]).toMatchObject({ prompt: 'Choose the past form of "go"', answerKey: { correct: "B" }, points: 2 });
    expect(res.questions[1]!.answerKey).toEqual({ correct: true });
    expect(res.warnings).toHaveLength(1);

    const xxe = `<?xml version="1.0"?><!DOCTYPE quiz [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><quiz><question type="essay"><questiontext><text>&xxe;</text></questiontext></question></quiz>`;
    expect(() => parseMoodleXml(xxe)).toThrow("XML_DTD_NOT_ALLOWED");
    const lol = `<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><quiz/>`;
    expect(() => parseMoodleXml(lol)).toThrow("XML_DTD_NOT_ALLOWED");
    // an undeclared entity reference is kept as plain text, never resolved
    const raw = parseMoodleXml(`<quiz><question type="essay"><questiontext><text>a &secret; b</text></questiontext></question></quiz>`);
    expect(raw.questions[0]!.prompt).toBe("a &secret; b");
  });

  it("parses Quizizz CSV and Anki notes, and exports Anki", () => {
    const csv = `Question Text,Question Type,Option 1,Option 2,Option 3,Option 4,Option 5,Correct Answer,Time in seconds
"Which is a fruit, not a vegetable?",Multiple Choice,Carrot,Apple,Potato,,,2,30
Fill: 2+2=,Fill-in-the-Blank,4,four,,,,,30
Bad row,Multiple Choice,Only,,,,,,30`;
    const q = parseQuizizzCsv(csv);
    expect(q.questions[0]).toMatchObject({ prompt: "Which is a fruit, not a vegetable?", answerKey: { correct: "B" } });
    expect(q.questions[1]).toMatchObject({ type: "TEXT", answerKey: { accepted: ["4", "four"] } });
    expect(q.warnings).toHaveLength(1);

    const anki = parseAnkiCsv("#separator:tab\n#html:true\napple\tquả táo\n<b>dog</b>\tcon chó\nlonely\t\n");
    expect(anki.cards).toEqual([
      { front: "apple", back: "quả táo" },
      { front: "dog", back: "con chó" },
    ]);
    expect(anki.warnings).toHaveLength(1);
    const out = exportAnkiCsv([{ front: "cat\tx", back: "con mèo\nnhỏ" }]);
    expect(out).toBe("#separator:tab\n#html:false\ncat x\tcon mèo nhỏ\n");
    expect(parseAnkiCsv(out).cards[0]).toEqual({ front: "cat x", back: "con mèo nhỏ" });
  });
});
