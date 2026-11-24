import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { decryptAppSecret, encryptAppSecret } from "@/lib/crypto-secrets";
import { generateTemporaryPassword } from "@/server/accountService";
import { logAudit } from "@/server/auditService";

export const BULK_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const BULK_IMPORT_MAX_ROWS = 500;
const EXPORT_TTL_MS = 30 * 60 * 1000;

export interface BulkImportRowError {
  code:
    | "INVALID_NAME"
    | "CLASS_AMBIGUOUS"
    | "INVALID_EMAIL"
    | "DUPLICATE_IN_FILE"
    | "EMAIL_EXISTS"
    | "EMAIL_IN_TRASH"
    | "INVALID_ROLE"
    | "PASSWORD_TOO_SHORT"
    | "CLASS_NOT_FOUND"
    | "CLASS_ONLY_FOR_STUDENT";
  message: string;
}

export interface BulkImportPreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  roleRaw: string;
  role: Role | null;
  classRaw: string;
  classId: string | null;
  className: string | null;
  hasCustomPassword: boolean;
  valid: boolean;
  errors: BulkImportRowError[];
}

interface ParsedInternalRow extends BulkImportPreviewRow {
  password: string | null;
}

export interface BulkImportPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: BulkImportPreviewRow[];
}

export interface BulkImportCommitResult {
  createdCount: number;
  enrolledCount: number;
  skippedErrorCount: number;
  generatedPasswordCount: number;
  credentialsExportId: string | null;
  errors: Array<{ rowNumber: number; email: string; errors: BulkImportRowError[] }>;
}

interface GeneratedCredentialEntry {
  name: string;
  email: string;
  role: Role;
  className: string;
  temporaryPassword: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasZipMagicBytes(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function cellToString(cell: ExcelJS.Cell): string {
  const raw = cell.value;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw).trim();
  if (typeof raw === "object") {
    if ("text" in raw && typeof raw.text === "string") return raw.text.trim();
    if ("hyperlink" in raw && typeof raw.hyperlink === "string") {
      return (raw.text ? String(raw.text) : raw.hyperlink.replace(/^mailto:/i, "")).trim();
    }
    if ("richText" in raw && Array.isArray(raw.richText)) {
      return raw.richText.map((r) => r.text ?? "").join("").trim();
    }
    if ("result" in raw && raw.result !== undefined && raw.result !== null) {
      return String(raw.result).trim();
    }
  }
  return String(cell.text ?? "").trim();
}

export function parseImportRole(raw: string): Role | null {
  const norm = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");

  if (norm === "student" || norm === "hoc sinh" || norm === "hs") return "STUDENT";
  if (norm === "teacher" || norm === "giao vien" || norm === "gv") return "TEACHER";
  if (norm === "parent" || norm === "phu huynh" || norm === "ph") return "PARENT";
  if (norm === "admin" || norm === "quan tri vien" || norm === "quan tri") return "ADMIN";
  return null;
}

export async function generateBulkImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EngClass LMS";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Tai khoan");
  sheet.columns = [
    { header: "Họ tên", key: "name", width: 28 },
    { header: "Email", key: "email", width: 32 },
    { header: "Vai trò", key: "role", width: 16 },
    { header: "Lớp (tuỳ chọn)", key: "classRef", width: 22 },
    { header: "Mật khẩu (tuỳ chọn)", key: "password", width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };

  sheet.addRow({
    name: "Nguyễn Văn An",
    email: "an.nguyen@example.com",
    role: "STUDENT",
    classRef: "ENG12A",
    password: "",
  });
  sheet.addRow({
    name: "Trần Thị Bình",
    email: "binh.tran@example.com",
    role: "TEACHER",
    classRef: "",
    password: "",
  });
  sheet.addRow({
    name: "Lê Văn Cường",
    email: "cuong.le@example.com",
    role: "PARENT",
    classRef: "",
    password: "MatKhauTuChon1",
  });

  const guide = wb.addWorksheet("Huong dan");
  guide.columns = [
    { header: "Cột", key: "col", width: 24 },
    { header: "Quy định", key: "rule", width: 72 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({ col: "Họ tên (Bắt buộc)", rule: "Từ 2 đến 100 ký tự." });
  guide.addRow({ col: "Email (Bắt buộc)", rule: "Email hợp lệ, chưa tồn tại và không nằm trong thùng rác." });
  guide.addRow({
    col: "Vai trò (Bắt buộc)",
    rule: "STUDENT (Học sinh), TEACHER (Giáo viên), PARENT (Phụ huynh), hoặc ADMIN (Quản trị viên).",
  });
  guide.addRow({
    col: "Lớp (Tuỳ chọn)",
    rule: "Chỉ dùng cho STUDENT: nhập Mã lớp (VD: ENG12A) hoặc tên lớp chính xác để thêm học sinh vào lớp ngay.",
  });
  guide.addRow({
    col: "Mật khẩu (Tuỳ chọn)",
    rule: "Tối thiểu 6 ký tự. Nếu bỏ trống, hệ thống tự sinh mật khẩu tạm (người dùng phải đổi khi đăng nhập) và xuất file Excel tải 1 lần.",
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

async function parseAndValidateWorkbook(buffer: Buffer): Promise<ParsedInternalRow[]> {
  if (!buffer || buffer.length === 0) {
    throw new AppError("Vui lòng chọn file Excel (.xlsx).", 400, "EMPTY_FILE");
  }
  if (buffer.length > BULK_IMPORT_MAX_BYTES) {
    throw new AppError("File Excel không được vượt quá 5MB.", 400, "FILE_TOO_LARGE");
  }
  if (!hasZipMagicBytes(buffer)) {
    throw new AppError("File không phải định dạng Excel (.xlsx) hợp lệ.", 400, "INVALID_EXCEL");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new AppError("File không phải định dạng Excel (.xlsx) hợp lệ.", 400, "INVALID_EXCEL");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError("File Excel không có trang tính nào.", 400, "EMPTY_EXCEL");
  }

  const rawRows: Array<{
    rowNumber: number;
    name: string;
    email: string;
    roleRaw: string;
    classRaw: string;
    password: string;
  }> = [];

  sheet.eachRow((row, rowNumber) => {
    const col1 = cellToString(row.getCell(1));
    const col2 = cellToString(row.getCell(2));
    const col3 = cellToString(row.getCell(3));
    const col4 = cellToString(row.getCell(4));
    const col5 = cellToString(row.getCell(5));

    if (!col1 && !col2 && !col3 && !col4 && !col5) return;

    if (rowNumber === 1) {
      const lower1 = col1.toLowerCase();
      const lower2 = col2.toLowerCase();
      if (
        lower1.includes("tên") ||
        lower1.includes("ten") ||
        lower1.includes("name") ||
        lower1.includes("họ") ||
        lower2 === "email"
      ) {
        return;
      }
    }

    rawRows.push({
      rowNumber,
      name: col1,
      email: col2.toLowerCase(),
      roleRaw: col3,
      classRaw: col4,
      password: col5,
    });
  });

  if (rawRows.length === 0) {
    throw new AppError("Không tìm thấy dữ liệu tài khoản nào trong file Excel.", 400, "NO_ROWS");
  }
  if (rawRows.length > BULK_IMPORT_MAX_ROWS) {
    throw new AppError(
      `Mỗi lần chỉ nhập tối đa ${BULK_IMPORT_MAX_ROWS} tài khoản.`,
      400,
      "TOO_MANY_ROWS"
    );
  }

  const allEmails = Array.from(new Set(rawRows.map((r) => r.email).filter(Boolean)));
  const [existingUsers, allClasses] = await Promise.all([
    allEmails.length > 0
      ? prisma.user.findMany({
          where: { email: { in: allEmails } },
          select: { email: true, deletedAt: true },
        })
      : Promise.resolve([]),
    prisma.class.findMany({
      where: { archived: false },
      select: { id: true, name: true, joinCode: true },
    }),
  ]);

  const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const classByCode = new Map(allClasses.map((c) => [c.joinCode.toUpperCase(), c]));
  // several active classes can share a name: matching by name is only allowed when it is unique
  const classesByName = new Map<string, typeof allClasses>();
  for (const c of allClasses) {
    const key = c.name.trim().toLowerCase();
    classesByName.set(key, [...(classesByName.get(key) ?? []), c]);
  }

  const seenEmails = new Set<string>();
  const validated: ParsedInternalRow[] = [];

  for (const r of rawRows) {
    const errors: BulkImportRowError[] = [];

    if (r.name.length < 2 || r.name.length > 100) {
      errors.push({ code: "INVALID_NAME", message: "Họ tên phải từ 2 đến 100 ký tự." });
    }

    if (!r.email || r.email.length > 160 || !EMAIL_RE.test(r.email)) {
      errors.push({ code: "INVALID_EMAIL", message: "Email không hợp lệ." });
    } else {
      if (seenEmails.has(r.email)) {
        errors.push({ code: "DUPLICATE_IN_FILE", message: "Email bị trùng trong file Excel." });
      } else {
        seenEmails.add(r.email);
      }

      const existing = existingByEmail.get(r.email);
      if (existing) {
        if (existing.deletedAt) {
          errors.push({
            code: "EMAIL_IN_TRASH",
            message: "Email thuộc tài khoản đang nằm trong thùng rác.",
          });
        } else {
          errors.push({ code: "EMAIL_EXISTS", message: "Email này đã được đăng ký." });
        }
      }
    }

    const role = parseImportRole(r.roleRaw);
    if (!role) {
      errors.push({
        code: "INVALID_ROLE",
        message: "Vai trò không hợp lệ (dùng STUDENT, TEACHER, PARENT hoặc ADMIN).",
      });
    }

    if (r.password.length > 0 && (r.password.length < 6 || r.password.length > 100)) {
      errors.push({
        code: "PASSWORD_TOO_SHORT",
        message: "Mật khẩu tuỳ chọn phải từ 6 đến 100 ký tự.",
      });
    }

    let classId: string | null = null;
    let className: string | null = null;
    if (r.classRaw.length > 0) {
      if (role && role !== "STUDENT") {
        errors.push({
          code: "CLASS_ONLY_FOR_STUDENT",
          message: "Chỉ tài khoản Học sinh mới có thể gán lớp khi nhập.",
        });
      } else {
        const byName = classesByName.get(r.classRaw.trim().toLowerCase()) ?? [];
        const matched =
          classByCode.get(r.classRaw.toUpperCase()) ?? (byName.length === 1 ? byName[0] : undefined);
        if (!matched && byName.length > 1) {
          errors.push({
            code: "CLASS_AMBIGUOUS",
            message: `Có ${byName.length} lớp cùng tên "${r.classRaw}". Hãy nhập mã lớp thay cho tên lớp.`,
          });
        } else if (!matched) {
          errors.push({
            code: "CLASS_NOT_FOUND",
            message: `Không tìm thấy lớp đang hoạt động "${r.classRaw}".`,
          });
        } else {
          classId = matched.id;
          className = matched.name;
        }
      }
    }

    validated.push({
      rowNumber: r.rowNumber,
      name: r.name,
      email: r.email,
      roleRaw: r.roleRaw,
      role,
      classRaw: r.classRaw,
      classId,
      className,
      hasCustomPassword: r.password.length > 0,
      password: r.password.length > 0 ? r.password : null,
      valid: errors.length === 0,
      errors,
    });
  }

  return validated;
}

export async function previewBulkUserImport(buffer: Buffer): Promise<BulkImportPreviewResult> {
  const rows = await parseAndValidateWorkbook(buffer);
  const validCount = rows.filter((r) => r.valid).length;
  return {
    totalRows: rows.length,
    validCount,
    errorCount: rows.length - validCount,
    // Strip raw passwords before returning preview JSON
    rows: rows.map((r) => ({
      rowNumber: r.rowNumber,
      name: r.name,
      email: r.email,
      roleRaw: r.roleRaw,
      role: r.role,
      classRaw: r.classRaw,
      classId: r.classId,
      className: r.className,
      hasCustomPassword: r.hasCustomPassword,
      valid: r.valid,
      errors: r.errors,
    })),
  };
}

async function hashInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(worker));
  }
}

export async function commitBulkUserImport(
  actor: { id: string; role: Role },
  buffer: Buffer
): Promise<BulkImportCommitResult> {
  if (actor.role !== "ADMIN") {
    throw new AppError("Chỉ quản trị viên được nhập tài khoản hàng loạt.", 403, "FORBIDDEN");
  }

  const rows = await parseAndValidateWorkbook(buffer);
  const validRows = rows.filter((r): r is ParsedInternalRow & { role: Role } => r.valid && r.role !== null);
  const errorRows = rows.filter((r) => !r.valid);

  if (validRows.length === 0) {
    throw new AppError("Không có dòng hợp lệ nào để tạo tài khoản.", 400, "NO_VALID_ROWS");
  }

  const prepared: Array<{
    row: ParsedInternalRow & { role: Role };
    temporaryPassword: string | null;
    passwordHash: string;
  }> = validRows.map((row) => ({
    row,
    temporaryPassword: row.password ? null : generateTemporaryPassword(10),
    passwordHash: "",
  }));

  await hashInBatches(prepared, 8, async (entry) => {
    const plain = entry.row.password ?? entry.temporaryPassword!;
    entry.passwordHash = await bcrypt.hash(plain, 10);
  });

  const generatedCredentials: GeneratedCredentialEntry[] = [];
  let enrolledCount = 0;
  const createdEmails: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const entry of prepared) {
      const created = await tx.user.create({
        data: {
          name: entry.row.name,
          email: entry.row.email,
          passwordHash: entry.passwordHash,
          role: entry.row.role,
          mustChangePassword: entry.temporaryPassword !== null,
        },
        select: { id: true, email: true },
      });
      createdEmails.push(created.email);

      if (entry.row.role === "STUDENT" && entry.row.classId) {
        await tx.enrollment.create({
          data: {
            classId: entry.row.classId,
            studentId: created.id,
            status: "ACTIVE",
          },
        });
        enrolledCount++;
      }

      if (entry.temporaryPassword) {
        generatedCredentials.push({
          name: entry.row.name,
          email: entry.row.email,
          role: entry.row.role,
          className: entry.row.className ?? "",
          temporaryPassword: entry.temporaryPassword,
        });
      }
    }
  }, { maxWait: 10_000, timeout: 120_000 });

  // Clean up expired one-time exports opportunistically
  const now = new Date();
  await prisma.oneTimeExport.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => undefined);

  let credentialsExportId: string | null = null;
  if (generatedCredentials.length > 0) {
    const encryptedPayload = encryptAppSecret(JSON.stringify(generatedCredentials), "export");
    const exp = await prisma.oneTimeExport.create({
      data: {
        createdById: actor.id,
        encryptedPayload,
        expiresAt: new Date(now.getTime() + EXPORT_TTL_MS),
      },
      select: { id: true },
    });
    credentialsExportId = exp.id;
  }

  await logAudit({
    actorId: actor.id,
    action: "USERS_BULK_IMPORTED",
    targetType: "SYSTEM",
    summary: `Nhập hàng loạt ${prepared.length} tài khoản từ Excel (${errorRows.length} dòng lỗi bị bỏ qua)`,
    summaryEn: `Bulk-imported ${prepared.length} account(s) from Excel (${errorRows.length} invalid row(s) skipped)`,
    meta: {
      createdCount: prepared.length,
      enrolledCount,
      skippedErrorCount: errorRows.length,
      generatedPasswordCount: generatedCredentials.length,
      sampleEmails: createdEmails.slice(0, 20),
    },
  });

  return {
    createdCount: prepared.length,
    enrolledCount,
    skippedErrorCount: errorRows.length,
    generatedPasswordCount: generatedCredentials.length,
    credentialsExportId,
    errors: errorRows.map((r) => ({
      rowNumber: r.rowNumber,
      email: r.email,
      errors: r.errors,
    })),
  };
}

/**
 * One-time download of temporary passwords generated during bulk import.
 * Atomic claim prevents double download and immediately wipes the encrypted payload from DB.
 */
export async function claimBulkImportCredentialsExcel(
  actor: { id: string; role: Role },
  exportId: string
): Promise<Buffer> {
  if (actor.role !== "ADMIN") {
    throw new AppError("Chỉ quản trị viên được tải file mật khẩu tạm.", 403, "FORBIDDEN");
  }

  const record = await prisma.oneTimeExport.findUnique({
    where: { id: exportId },
    select: {
      id: true,
      createdById: true,
      encryptedPayload: true,
      downloadedAt: true,
      expiresAt: true,
    },
  });

  if (!record) {
    throw new AppError("Không tìm thấy file mật khẩu tạm.", 404, "NOT_FOUND");
  }
  if (record.createdById !== actor.id) {
    throw new AppError("Bạn không có quyền tải file mật khẩu tạm này.", 403, "FORBIDDEN");
  }

  const now = new Date();
  const claimed = await prisma.oneTimeExport.updateMany({
    where: {
      id: exportId,
      createdById: actor.id,
      downloadedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      downloadedAt: now,
      encryptedPayload: "",
    },
  });

  if (claimed.count === 0) {
    throw new AppError(
      "File mật khẩu tạm đã được tải trước đó hoặc đã hết hạn.",
      410,
      "EXPORT_ALREADY_USED"
    );
  }

  const decrypted = decryptAppSecret(record.encryptedPayload, "export");
  const credentials = JSON.parse(decrypted) as GeneratedCredentialEntry[];

  const wb = new ExcelJS.Workbook();
  wb.creator = "EngClass LMS";
  wb.created = now;
  const sheet = wb.addWorksheet("Mat khau tam");
  sheet.columns = [
    { header: "Họ tên", key: "name", width: 28 },
    { header: "Email", key: "email", width: 32 },
    { header: "Vai trò", key: "role", width: 16 },
    { header: "Lớp", key: "className", width: 28 },
    { header: "Mật khẩu tạm (đổi khi đăng nhập)", key: "temporaryPassword", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };

  for (const item of credentials) {
    sheet.addRow(item);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
