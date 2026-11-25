import JSZip from "jszip";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface DocxParagraph {
  text: string;
  bold?: boolean;
  heading?: boolean;
  italic?: boolean;
}

/**
 * Generates a valid, standards-compliant OOXML Word (.docx) Buffer with zero native deps.
 * Opens cleanly in Microsoft Word, Google Docs, and LibreOffice Writer, and round-trips
 * seamlessly through `mammoth.extractRawText()`.
 */
export async function buildDocxBuffer(paragraphs: DocxParagraph[]): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );

  const bodyXml = paragraphs
    .map((p) => {
      const rPrParts: string[] = [];
      if (p.bold || p.heading) rPrParts.push("<w:b/>");
      if (p.italic) rPrParts.push("<w:i/>");
      if (p.heading) rPrParts.push('<w:sz w:val="32"/>');
      else rPrParts.push('<w:sz w:val="24"/>');
      const rPr = `<w:rPr>${rPrParts.join("")}</w:rPr>`;
      const text = escapeXml(p.text);
      return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join("\n    ");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  const arr = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(arr);
}

/**
 * Generates a ready-to-edit sample Word (.docx) template illustrating the __answer__
 * and __ans1/ans2__ fill-in-the-blank syntax.
 */
export async function buildSampleFillBlankDocx(): Promise<Buffer> {
  return buildDocxBuffer([
    { text: "BÀI TẬP ĐIỀN TỪ MẪU (Pivora)", heading: true },
    {
      text: "Hướng dẫn: Bọc phần đáp án cần điền trong hai dấu gạch dưới liên tiếp ở đầu và cuối. Nếu có nhiều đáp án đúng thì ngăn cách bằng dấu /.",
      italic: true,
    },
    { text: "" },
    { text: "Câu 1: How many __planets are there in the universe/stars are there in the universe__?" },
    { text: "Câu 2: She __has lived/'s lived__ in London since 2018." },
    { text: "Câu 3: If it __rains__ tomorrow, we __will stay/'ll stay__ at home." },
    { text: "Câu 4: The book __was written__ by a famous Vietnamese author in 1995." },
    { text: "Câu 5: I am looking forward to __hearing__ from you soon." },
  ]);
}
