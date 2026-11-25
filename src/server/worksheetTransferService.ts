import crypto from "node:crypto";
import JSZip from "jszip";
import mammoth from "mammoth";
import type { FieldPlacement, FieldType, Prisma, SkillTag } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorageProvider } from "@/lib/storage";
import {
  parseFillBlankText,
  type FillBlankParseResult,
} from "@/lib/worksheet/fill-blank-parser";
import { buildDocxBuffer, type DocxParagraph } from "@/lib/worksheet/docx-builder";
import { resolveAudioExtension } from "./worksheetAudioService";

export interface ExportedWorksheetManifest {
  format: "engclass-worksheet-v1";
  exportedAt: string;
  worksheet: {
    title: string;
    instructions: string | null;
    pageCount: number;
    hasPdf: boolean;
    pdfEntry?: string;
    pages: Array<{ pageIndex: number; widthPt: number; heightPt: number }>;
    audios: Array<{
      oldId: string;
      title: string;
      mimeType: string;
      durationSec: number | null;
      order: number;
      entry: string;
    }>;
    fields: Array<{
      placement: FieldPlacement;
      type: FieldType;
      label: string;
      prompt: string | null;
      explanation: string | null;
      skillTag: SkillTag | null;
      audioOldId: string | null;
      order: number;
      points: number;
      pageIndex: number | null;
      x: number | null;
      y: number | null;
      w: number | null;
      h: number | null;
      style: unknown;
      options: unknown;
      answerKey: unknown;
      gradingOpts: unknown;
    }>;
  };
}

interface LibraryBackupManifest {
  format: "engclass-library-backup-v1";
  exportedAt: string;
  count: number;
  entries: Array<{ folder: string; title: string }>;
}

function slugifyFilename(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return clean || "worksheet";
}

/**
 * Extracts raw text from an uploaded .docx or .txt file and parses __answer__ blanks.
 */
export async function parseWordOrTextFile(
  buffer: Buffer,
  filename: string,
  opts?: { defaultPoints?: number; startNumber?: number }
): Promise<{ rawText: string; parsed: FillBlankParseResult }> {
  const lower = filename.toLowerCase();
  let rawText = "";
  if (lower.endsWith(".docx")) {
    try {
      const res = await mammoth.extractRawText({ buffer });
      rawText = res.value ?? "";
    } catch {
      throw new AppError(
        "Không thể đọc file Word (.docx). Hãy kiểm tra định dạng file không bị hỏng hoặc mật khẩu.",
        400,
        "INVALID_DOCX"
      );
    }
  } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    rawText = buffer.toString("utf8");
  } else {
    throw new AppError(
      "Chỉ hỗ trợ file Word (.docx) hoặc văn bản (.txt).",
      400,
      "UNSUPPORTED_FILE"
    );
  }

  return {
    rawText,
    parsed: parseFillBlankText(rawText, opts),
  };
}

/**
 * Builds a portable manifest + adds binary files (PDF + audios) into the given JSZip folder.
 */
async function packWorksheetIntoZip(
  worksheetId: string,
  targetZip: JSZip
): Promise<{ title: string; manifest: ExportedWorksheetManifest }> {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    include: {
      pages: { orderBy: { pageIndex: "asc" } },
      audios: { orderBy: { order: "asc" } },
      fields: { orderBy: { order: "asc" } },
    },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  const storage = getStorageProvider();
  let hasPdf = false;
  if (ws.pdfFileKey) {
    const pdf = await storage.get(ws.pdfFileKey);
    if (pdf) {
      targetZip.file("document.pdf", pdf.buffer);
      hasPdf = true;
    }
  }

  const exportedAudios: ExportedWorksheetManifest["worksheet"]["audios"] = [];
  for (let i = 0; i < ws.audios.length; i++) {
    const a = ws.audios[i]!;
    const file = await storage.get(a.fileKey);
    if (!file) continue;
    const ext = a.fileKey.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp3";
    const entry = `audio/${String(i + 1).padStart(2, "0")}-${slugifyFilename(a.title)}${ext}`;
    targetZip.file(entry, file.buffer);
    exportedAudios.push({
      oldId: a.id,
      title: a.title,
      mimeType: a.mimeType,
      durationSec: a.durationSec,
      order: a.order,
      entry,
    });
  }

  const manifest: ExportedWorksheetManifest = {
    format: "engclass-worksheet-v1",
    exportedAt: new Date().toISOString(),
    worksheet: {
      title: ws.title,
      instructions: ws.instructions,
      pageCount: hasPdf ? ws.pageCount : 0,
      hasPdf,
      pdfEntry: hasPdf ? "document.pdf" : undefined,
      pages: hasPdf
        ? ws.pages.map((p) => ({
            pageIndex: p.pageIndex,
            widthPt: p.widthPt,
            heightPt: p.heightPt,
          }))
        : [],
      audios: exportedAudios,
      fields: ws.fields.map((f) => ({
        placement: f.placement,
        type: f.type,
        label: f.label,
        prompt: f.prompt,
        explanation: f.explanation,
        skillTag: f.skillTag,
        audioOldId: f.audioId,
        order: f.order,
        points: f.points,
        pageIndex: f.pageIndex,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        style: f.style,
        options: f.options,
        answerKey: f.answerKey,
        gradingOpts: f.gradingOpts,
      })),
    },
  };

  targetZip.file("manifest.json", JSON.stringify(manifest, null, 2));
  return { title: ws.title, manifest };
}

export async function exportWorksheetAsZip(worksheetId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const zip = new JSZip();
  const { title } = await packWorksheetIntoZip(worksheetId, zip);
  const arr = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return {
    buffer: Buffer.from(arr),
    filename: `${slugifyFilename(title)}.engclass.zip`,
  };
}

export async function exportWorksheetAsJson(worksheetId: string): Promise<{
  manifest: ExportedWorksheetManifest;
  filename: string;
}> {
  const zip = new JSZip();
  const { title, manifest } = await packWorksheetIntoZip(worksheetId, zip);
  return {
    manifest,
    filename: `${slugifyFilename(title)}.engclass.json`,
  };
}

/** Library backup .zip; `ids` limits it to some of the owner's worksheets (others are ignored). */
export async function exportAllTeacherWorksheetsZip(ownerId: string, ids?: string[]): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const worksheets = await prisma.worksheet.findMany({
    where: { ownerId, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
  });

  if (worksheets.length === 0) {
    throw new AppError("Bạn chưa có phiếu bài tập nào để sao lưu.", 400, "EMPTY_LIBRARY");
  }

  const rootZip = new JSZip();
  const entries: Array<{ folder: string; title: string }> = [];

  for (let i = 0; i < worksheets.length; i++) {
    const ws = worksheets[i]!;
    const folderName = `worksheets/${String(i + 1).padStart(2, "0")}-${slugifyFilename(ws.title)}`;
    const subFolder = rootZip.folder(folderName);
    if (!subFolder) continue;
    await packWorksheetIntoZip(ws.id, subFolder);
    entries.push({ folder: folderName, title: ws.title });
  }

  const backupManifest: LibraryBackupManifest = {
    format: "engclass-library-backup-v1",
    exportedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  rootZip.file("backup-manifest.json", JSON.stringify(backupManifest, null, 2));

  const dateTag = new Date().toISOString().slice(0, 10);
  const arr = await rootZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return {
    buffer: Buffer.from(arr),
    filename: `pivora-backup-${dateTag}.zip`,
  };
}

/**
 * Exports a worksheet as a clean Word (.docx) document.
 * - includeAnswers = true: emits __answer__ inline (re-importable!) + full Answer Key section.
 * - includeAnswers = false: clean printable student handout with blanks.
 */
export async function exportWorksheetAsDocx(
  worksheetId: string,
  includeAnswers: boolean
): Promise<{ buffer: Buffer; filename: string }> {
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    include: {
      fields: { orderBy: { order: "asc" } },
      audios: { orderBy: { order: "asc" } },
    },
  });
  if (!ws) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }

  const paragraphs: DocxParagraph[] = [{ text: ws.title, heading: true }];
  if (ws.instructions) {
    paragraphs.push({ text: ws.instructions, italic: true });
  }
  if (ws.audios.length > 0) {
    paragraphs.push({
      text: `File nghe đi kèm: ${ws.audios.map((a) => a.title).join(", ")}`,
      italic: true,
    });
  }
  paragraphs.push({ text: "" });

  const answerLines: string[] = [];

  for (const f of ws.fields) {
    const key = (f.answerKey && typeof f.answerKey === "object"
      ? f.answerKey
      : {}) as Record<string, unknown>;

    if (f.type === "TEXT") {
      const accepted = Array.isArray(key.accepted)
        ? (key.accepted as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      const inlineKey = accepted.length > 0 ? `__${accepted.join("/")}__` : "________";
      const basePrompt = f.prompt?.trim() || "________";
      const rendered = includeAnswers
        ? basePrompt.includes("____ [")
          ? basePrompt.replace(/____ \[[^\]]+\] ____/, inlineKey)
          : basePrompt.includes("________")
            ? basePrompt.replace("________", inlineKey)
            : `${basePrompt} ${inlineKey}`
        : basePrompt;
      paragraphs.push({ text: `Câu ${f.label}: ${rendered}` });
      answerLines.push(`Câu ${f.label}: ${accepted.join(" / ")}`);
    } else if (f.type === "DICTATION") {
      const transcript = typeof key.transcript === "string" ? key.transcript : "";
      paragraphs.push({
        text: `Câu ${f.label} (Chép chính tả — ${f.points}đ): ${f.prompt?.trim() || "Nghe và chép lại"}`,
        bold: true,
      });
      if (includeAnswers && transcript) {
        paragraphs.push({ text: `Transcript: ${transcript}`, italic: true });
      } else {
        paragraphs.push({ text: "____________________________________________________________" });
      }
      answerLines.push(`Câu ${f.label} (Transcript): ${transcript}`);
    } else if (f.type === "MULTIPLE_CHOICE" || f.type === "MULTI_SELECT" || f.type === "DROPDOWN") {
      paragraphs.push({
        text: `Câu ${f.label}: ${f.prompt?.trim() || ""}`,
        bold: true,
      });
      const opts = Array.isArray(f.options)
        ? (f.options as Array<{ id: string; text: string }>)
        : [];
      if (opts.length > 0) {
        paragraphs.push({
          text: opts
            .map((o) => (o.text && o.text !== o.id ? `${o.id}. ${o.text}` : o.id))
            .join("    "),
        });
      }
      const correct = Array.isArray(key.correct)
        ? (key.correct as string[]).join(", ")
        : String(key.correct ?? "");
      answerLines.push(`Câu ${f.label}: ${correct}`);
    } else if (f.type === "TRUE_FALSE") {
      paragraphs.push({ text: `Câu ${f.label} (Đúng / Sai): ${f.prompt?.trim() || ""}` });
      answerLines.push(`Câu ${f.label}: ${key.correct === true ? "Đúng" : "Sai"}`);
    } else if (f.type === "NUMBER") {
      paragraphs.push({ text: `Câu ${f.label}: ${f.prompt?.trim() || "________"}` });
      answerLines.push(`Câu ${f.label}: ${String(key.value ?? "")}`);
    } else if (f.type === "ESSAY") {
      paragraphs.push({
        text: `Câu ${f.label} (Tự luận — ${f.points}đ): ${f.prompt?.trim() || ""}`,
        bold: true,
      });
      if (includeAnswers && key.rubric) {
        paragraphs.push({ text: `Gợi ý chấm: ${String(key.rubric)}`, italic: true });
      }
    } else {
      paragraphs.push({ text: `Câu ${f.label}: ${f.prompt?.trim() || ""}` });
    }
  }

  if (includeAnswers && answerLines.length > 0) {
    paragraphs.push({ text: "" });
    paragraphs.push({ text: "ĐÁP ÁN THAM KHẢO", heading: true });
    for (const line of answerLines) {
      paragraphs.push({ text: line });
    }
  }

  const buffer = await buildDocxBuffer(paragraphs);
  const suffix = includeAnswers ? "co-dap-an" : "de-hoc-sinh";
  return {
    buffer,
    filename: `${slugifyFilename(ws.title)}-${suffix}.docx`,
  };
}

/**
 * Restores a single ExportedWorksheetManifest (plus optional zip files) into the database
 * owned by `ownerId`.
 */
async function restoreManifestForOwner(
  ownerId: string,
  manifest: ExportedWorksheetManifest,
  zip?: JSZip,
  folderPrefix = ""
) {
  if (manifest.format !== "engclass-worksheet-v1" || !manifest.worksheet?.title) {
    throw new AppError("File backup không đúng định dạng Pivora.", 400, "INVALID_MANIFEST");
  }

  const storage = getStorageProvider();
  const data = manifest.worksheet;

  const created = await prisma.worksheet.create({
    data: {
      ownerId,
      title: data.title.slice(0, 200),
      instructions: data.instructions ?? null,
    },
  });

  // Restore PDF if bundled in zip
  if (zip && data.hasPdf && data.pdfEntry) {
    const pdfZipObj = zip.file(folderPrefix + data.pdfEntry);
    if (pdfZipObj) {
      const pdfBuf = Buffer.from(await pdfZipObj.async("nodebuffer"));
      const pdfFileKey = `worksheets/${created.id}/${crypto.randomUUID()}.pdf`;
      await storage.put(pdfFileKey, pdfBuf, "application/pdf");
      await prisma.worksheet.update({
        where: { id: created.id },
        data: {
          pdfFileKey,
          pageCount: data.pages.length || data.pageCount || 0,
          pages: {
            create: data.pages.map((p) => ({
              pageIndex: p.pageIndex,
              widthPt: p.widthPt,
              heightPt: p.heightPt,
            })),
          },
        },
      });
    }
  }

  // Restore audio tracks & keep oldId -> newId map
  const audioIdMap = new Map<string, string>();
  if (zip && Array.isArray(data.audios)) {
    for (let i = 0; i < data.audios.length; i++) {
      const a = data.audios[i]!;
      const audioZipObj = zip.file(folderPrefix + a.entry);
      if (!audioZipObj) continue;
      const audioBuf = Buffer.from(await audioZipObj.async("nodebuffer"));
      const { ext, mime } = resolveAudioExtension(a.mimeType || "audio/mpeg", a.entry);
      const fileKey = `worksheets/${created.id}/audio/${crypto.randomUUID()}${ext}`;
      await storage.put(fileKey, audioBuf, mime);
      const createdAudio = await prisma.worksheetAudio.create({
        data: {
          worksheetId: created.id,
          title: a.title.slice(0, 200),
          fileKey,
          mimeType: mime,
          sizeBytes: audioBuf.length,
          durationSec: a.durationSec ?? null,
          order: a.order ?? i,
        },
      });
      audioIdMap.set(a.oldId, createdAudio.id);
    }
  }

  // Restore all fields
  if (Array.isArray(data.fields) && data.fields.length > 0) {
    await prisma.field.createMany({
      data: data.fields.map((f, idx) => ({
        worksheetId: created.id,
        placement: f.placement,
        type: f.type,
        label: f.label || String(idx + 1),
        prompt: f.prompt ?? null,
        explanation: f.explanation ?? null,
        skillTag: f.skillTag ?? null,
        audioId: f.audioOldId ? audioIdMap.get(f.audioOldId) ?? null : null,
        order: f.order ?? idx,
        points: Number(f.points) || 1,
        pageIndex: f.placement === "OVERLAY" ? (f.pageIndex ?? 0) : null,
        x: f.placement === "OVERLAY" ? (f.x ?? 0) : null,
        y: f.placement === "OVERLAY" ? (f.y ?? 0) : null,
        w: f.placement === "OVERLAY" ? (f.w ?? 0.15) : null,
        h: f.placement === "OVERLAY" ? (f.h ?? 0.04) : null,
        style: (f.style ?? undefined) as Prisma.InputJsonValue | undefined,
        options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
        answerKey: (f.answerKey ?? {}) as Prisma.InputJsonValue,
        gradingOpts: (f.gradingOpts ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  return prisma.worksheet.findUniqueOrThrow({
    where: { id: created.id },
    include: {
      _count: { select: { fields: true, audios: true, assignments: true } },
    },
  });
}

/**
 * Imports a backup bundle (.zip / .engclass.zip / .json) OR a Word/text fill-in-the-blank file
 * (.docx / .txt) into the teacher's library.
 */
export async function importWorksheetFile(
  ownerId: string,
  buffer: Buffer,
  filename: string,
  opts?: { title?: string; defaultPoints?: number }
) {
  const lower = filename.toLowerCase();

  // Case 1: Word .docx or plain text -> auto-create fill-in-the-blank worksheet
  if (lower.endsWith(".docx") || lower.endsWith(".txt")) {
    const { parsed } = await parseWordOrTextFile(buffer, filename, {
      defaultPoints: opts?.defaultPoints ?? 1,
    });
    if (parsed.fields.length === 0) {
      throw new AppError(
        "Không tìm thấy câu điền từ nào có dấu __đáp án__ trong file.",
        400,
        "NO_BLANKS_FOUND"
      );
    }
    const cleanTitle =
      opts?.title?.trim() ||
      filename.replace(/\.(docx|txt)$/i, "").trim() ||
      "Bài tập điền từ từ Word";

    const created = await prisma.worksheet.create({
      data: {
        ownerId,
        title: cleanTitle.slice(0, 200),
        instructions: "Điền từ hoặc cụm từ thích hợp vào chỗ trống.",
        fields: {
          create: parsed.fields.map((f, idx) => ({
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: f.label,
            prompt: f.prompt,
            order: idx,
            points: f.points,
            answerKey: { accepted: f.accepted } as Prisma.InputJsonValue,
            gradingOpts: {
              caseSensitive: false,
              ignorePunctuation: true,
              ignoreExtraSpaces: true,
            } as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        _count: { select: { fields: true, audios: true, assignments: true } },
      },
    });
    return { worksheets: [created], importedFrom: "WORD" as const };
  }

  // Case 2: JSON single manifest
  if (lower.endsWith(".json")) {
    let manifest: ExportedWorksheetManifest;
    try {
      manifest = JSON.parse(buffer.toString("utf8")) as ExportedWorksheetManifest;
    } catch {
      throw new AppError("File JSON không hợp lệ.", 400, "INVALID_JSON");
    }
    const ws = await restoreManifestForOwner(ownerId, manifest);
    return { worksheets: [ws], importedFrom: "JSON" as const };
  }

  // Case 3: ZIP bundle (single .engclass.zip OR full library backup .zip)
  if (lower.endsWith(".zip")) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new AppError("File ZIP không hợp lệ hoặc bị hỏng.", 400, "INVALID_ZIP");
    }

    const backupFile = zip.file("backup-manifest.json");
    if (backupFile) {
      const backup = JSON.parse(await backupFile.async("string")) as LibraryBackupManifest;
      if (backup.format !== "engclass-library-backup-v1" || !Array.isArray(backup.entries)) {
        throw new AppError("File backup thư viện không đúng định dạng Pivora.", 400, "INVALID_BACKUP");
      }
      const restored = [];
      for (const entry of backup.entries) {
        const prefix = entry.folder.endsWith("/") ? entry.folder : `${entry.folder}/`;
        const mFile = zip.file(`${prefix}manifest.json`);
        if (!mFile) continue;
        const manifest = JSON.parse(await mFile.async("string")) as ExportedWorksheetManifest;
        const ws = await restoreManifestForOwner(ownerId, manifest, zip, prefix);
        restored.push(ws);
      }
      if (restored.length === 0) {
        throw new AppError("Không tìm thấy phiếu bài tập nào trong file backup.", 400, "EMPTY_BACKUP");
      }
      return { worksheets: restored, importedFrom: "BACKUP_ZIP" as const };
    }

    const singleManifestFile = zip.file("manifest.json");
    if (!singleManifestFile) {
      throw new AppError(
        "File ZIP không phải gói backup Pivora (thiếu manifest.json).",
        400,
        "MISSING_MANIFEST"
      );
    }
    const manifest = JSON.parse(await singleManifestFile.async("string")) as ExportedWorksheetManifest;
    const ws = await restoreManifestForOwner(ownerId, manifest, zip, "");
    return { worksheets: [ws], importedFrom: "ZIP" as const };
  }

  throw new AppError(
    "Định dạng file không được hỗ trợ. Hãy dùng .engclass.zip, .zip, .json, .docx hoặc .txt.",
    400,
    "UNSUPPORTED_IMPORT"
  );
}

/**
 * Clones a shared (or own) worksheet — including PDF, audio tracks, and fields — into another
 * teacher's library so colleagues can reuse and customize it independently!
 */
export async function cloneWorksheetForTeacher(
  sourceWorksheetId: string,
  targetOwnerId: string,
  opts?: { isAdmin?: boolean }
) {
  const source = await prisma.worksheet.findUnique({
    where: { id: sourceWorksheetId },
    select: { id: true, ownerId: true, isShared: true },
  });
  if (!source) {
    throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
  }
  if (source.ownerId !== targetOwnerId && !source.isShared && !opts?.isAdmin) {
    throw new AppError(
      "Phiếu bài tập này chưa được giáo viên chia sẻ.",
      403,
      "FORBIDDEN"
    );
  }

  const zip = new JSZip();
  const { manifest } = await packWorksheetIntoZip(sourceWorksheetId, zip);
  manifest.worksheet.title =
    source.ownerId === targetOwnerId
      ? `${manifest.worksheet.title} (Bản sao)`
      : manifest.worksheet.title;
  return restoreManifestForOwner(targetOwnerId, manifest, zip, "");
}
