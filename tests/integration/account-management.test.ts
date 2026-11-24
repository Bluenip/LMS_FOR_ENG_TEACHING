import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { localizeApiError } from "@/lib/i18n/api-errors";
import { updateProfileSchema } from "@/lib/validators";
import { authorizeFileDownload } from "@/server/worksheetService";
import {
  changeOwnPassword,
  createAccount,
  deleteAccount,
  getDeletionImpact,
  getOwnProfile,
  removeOwnAvatar,
  resetPasswordFor,
  setOwnAvatar,
  updateOwnProfile,
} from "@/server/accountService";

const stamp = Date.now();
const emails = {
  studentInClass1: `acct-stu1-${stamp}@test.vn`,
  parentOfClass1: `acct-par1-${stamp}@test.vn`,
  studentInClass2: `acct-stu2-${stamp}@test.vn`,
  parentOfClass2: `acct-par2-${stamp}@test.vn`,
  tempAdmin: `acct-adm-${stamp}@test.vn`,
  lockedAdmin: `acct-ladm-${stamp}@test.vn`,
  deletableUser: `acct-del-${stamp}@test.vn`,
  profileUser: `acct-prof-${stamp}@test.vn`,
  profileUserRenamed: `acct-prof-new-${stamp}@test.vn`,
  otherPhoneUser: `acct-ph-${stamp}@test.vn`,
};
const testPhone = `+849${String(stamp).slice(-8)}`;

// Minimal valid 1x1 PNG bytes
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

let adminId = "";
let teacher1Id = "";
let teacher2Id = "";
let class1Id = "";
let class2Id = "";

let stu1Id = "";
let par1Id = "";
let stu2Id = "";
let par2Id = "";

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", isLocked: false },
  });
  adminId = admin.id;

  const cls1 = await prisma.class.findUniqueOrThrow({ where: { joinCode: "ENG12A" } });
  const cls2 = await prisma.class.findUniqueOrThrow({ where: { joinCode: "IELT65" } });
  class1Id = cls1.id;
  class2Id = cls2.id;
  teacher1Id = cls1.teacherId;
  teacher2Id = cls2.teacherId;

  const s1 = await createAccount(
    { id: teacher1Id, role: "TEACHER" },
    {
      name: "Test Student C1",
      email: emails.studentInClass1,
      role: "STUDENT",
      classId: class1Id,
      password: "initialPassword1",
    }
  );
  stu1Id = s1.user.id;

  const p1 = await createAccount(
    { id: teacher1Id, role: "TEACHER" },
    {
      name: "Test Parent C1",
      email: emails.parentOfClass1,
      role: "PARENT",
      classId: class1Id,
      studentId: stu1Id,
      password: "initialPassword1",
    }
  );
  par1Id = p1.user.id;

  const s2 = await createAccount(
    { id: teacher2Id, role: "TEACHER" },
    {
      name: "Test Student C2",
      email: emails.studentInClass2,
      role: "STUDENT",
      classId: class2Id,
      password: "initialPassword2",
    }
  );
  stu2Id = s2.user.id;

  const p2 = await createAccount(
    { id: teacher2Id, role: "TEACHER" },
    {
      name: "Test Parent C2",
      email: emails.parentOfClass2,
      role: "PARENT",
      classId: class2Id,
      studentId: stu2Id,
      password: "initialPassword2",
    }
  );
  par2Id = p2.user.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { avatarUrl: true },
  });
  const storage = getStorageProvider();
  for (const u of users) {
    if (u.avatarUrl?.startsWith("/api/files/")) {
      await storage.delete(u.avatarUrl.slice("/api/files/".length)).catch(() => undefined);
    }
  }
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(emails) } },
  });
});

describe("Password reset (resetPasswordFor)", () => {
  it("admin can reset any account's password, flagging mustChangePassword and passwordChangedAt", async () => {
    const before = Date.now() - 1000;
    const res = await resetPasswordFor({ id: adminId, role: "ADMIN" }, stu1Id);

    expect(res.user.email).toBe(emails.studentInClass1);
    expect(res.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: stu1Id } });
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.passwordChangedAt).not.toBeNull();
    expect(updated.passwordChangedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(await bcrypt.compare(res.temporaryPassword, updated.passwordHash)).toBe(true);
    expect(await bcrypt.compare("initialPassword1", updated.passwordHash)).toBe(false);
  });

  it("teacher can reset passwords for students and linked parents in their own class", async () => {
    const stuReset = await resetPasswordFor({ id: teacher1Id, role: "TEACHER" }, stu1Id);
    expect(stuReset.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);

    const parReset = await resetPasswordFor({ id: teacher1Id, role: "TEACHER" }, par1Id);
    expect(parReset.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    const updatedPar = await prisma.user.findUniqueOrThrow({ where: { id: par1Id } });
    expect(updatedPar.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(parReset.temporaryPassword, updatedPar.passwordHash)).toBe(true);
  });

  it("teacher CANNOT reset passwords of students/parents from another class or teachers/admins", async () => {
    await expect(
      resetPasswordFor({ id: teacher1Id, role: "TEACHER" }, stu2Id)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      resetPasswordFor({ id: teacher1Id, role: "TEACHER" }, par2Id)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      resetPasswordFor({ id: teacher1Id, role: "TEACHER" }, teacher2Id)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      resetPasswordFor({ id: teacher1Id, role: "TEACHER" }, adminId)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("students and parents cannot reset passwords; unknown user returns 404", async () => {
    await expect(
      resetPasswordFor({ id: stu1Id, role: "STUDENT" }, stu1Id)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      resetPasswordFor({ id: par1Id, role: "PARENT" }, stu1Id)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      resetPasswordFor({ id: adminId, role: "ADMIN" }, "non-existent-user-id")
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("Account deletion (getDeletionImpact & deleteAccount)", () => {
  it("returns deletion impact counts for a user", async () => {
    const impact = await getDeletionImpact(stu1Id);
    expect(impact.email).toBe(emails.studentInClass1);
    expect(impact._count.enrollments).toBe(1);
    expect(impact._count.parentLinksAsChild).toBe(1);
    expect(impact._count.classesTaught).toBe(0);
  });

  it("rejects non-admin deletion, self-deletion, and mismatched confirmation email", async () => {
    await expect(
      deleteAccount({ id: teacher1Id, role: "TEACHER" }, stu1Id, emails.studentInClass1)
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      deleteAccount({ id: adminId, role: "ADMIN" }, adminId, "admin@engclass.vn")
    ).rejects.toMatchObject({ statusCode: 400, code: "SELF_DELETE" });

    await expect(
      deleteAccount({ id: adminId, role: "ADMIN" }, stu1Id, "wrong@test.vn")
    ).rejects.toMatchObject({ statusCode: 400, code: "CONFIRM_MISMATCH" });
  });

  it("prevents deleting the last active admin, but allows deleting a second admin", async () => {
    const activeAdmins = await prisma.user.findMany({
      where: { role: "ADMIN", isLocked: false },
      select: { id: true, email: true },
    });

    // Create a locked admin actor to test LAST_ADMIN protection without touching existing admins
    const lockedAdmin = await prisma.user.create({
      data: {
        name: "Locked Admin",
        email: emails.lockedAdmin,
        role: "ADMIN",
        isLocked: true,
        passwordHash: await bcrypt.hash("secret1234", 10),
      },
    });

    if (activeAdmins.length === 1) {
      await expect(
        deleteAccount(
          { id: lockedAdmin.id, role: "ADMIN" },
          activeAdmins[0]!.id,
          activeAdmins[0]!.email
        )
      ).rejects.toMatchObject({ statusCode: 400, code: "LAST_ADMIN" });
    }

    // Creating a second active admin allows deleting that second admin cleanly
    const secondAdmin = await createAccount(
      { id: adminId, role: "ADMIN" },
      { name: "Temp Admin", email: emails.tempAdmin, role: "ADMIN", password: "tempPassword1" }
    );
    const delRes = await deleteAccount(
      { id: adminId, role: "ADMIN" },
      secondAdmin.user.id,
      emails.tempAdmin
    );
    expect(delRes.ok).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: secondAdmin.user.id } })).toBeNull();
  });

  it("deletes account with case-insensitive email match, cascades links, and removes avatar file", async () => {
    const created = await createAccount(
      { id: teacher1Id, role: "TEACHER" },
      {
        name: "Deletable Student",
        email: emails.deletableUser,
        role: "STUDENT",
        classId: class1Id,
        password: "delPassword1",
      }
    );

    const avatar = await setOwnAvatar(created.user.id, VALID_PNG);
    expect(avatar.avatarUrl).toMatch(/^\/api\/files\/avatars\//);
    const avatarKey = avatar.avatarUrl!.slice("/api/files/".length);
    const storage = getStorageProvider();
    expect(await storage.exists(avatarKey)).toBe(true);

    const res = await deleteAccount(
      { id: adminId, role: "ADMIN" },
      created.user.id,
      `  ${emails.deletableUser.toUpperCase()}  `
    );
    expect(res.ok).toBe(true);

    expect(await prisma.user.findUnique({ where: { id: created.user.id } })).toBeNull();
    expect(
      await prisma.enrollment.findUnique({
        where: { classId_studentId: { classId: class1Id, studentId: created.user.id } },
      })
    ).toBeNull();
    expect(await storage.exists(avatarKey)).toBe(false);
  });
});

describe("Own profile, password change, and avatar management", () => {
  it("enforces password change rules and clears mustChangePassword", async () => {
    const created = await createAccount(
      { id: adminId, role: "ADMIN" },
      { name: "Profile User", email: emails.profileUser, role: "STUDENT" }
    );
    const tempPw = created.temporaryPassword!;
    expect(tempPw).toBeTruthy();

    // Wrong current password rejected
    await expect(
      changeOwnPassword(created.user.id, "wrong-password", "newStrongPass99")
    ).rejects.toMatchObject({ statusCode: 400, code: "WRONG_PASSWORD" });

    // Same password rejected
    await expect(
      changeOwnPassword(created.user.id, tempPw, tempPw)
    ).rejects.toMatchObject({ statusCode: 400, code: "SAME_PASSWORD" });

    // Valid password change updates hash, clears mustChangePassword, sets passwordChangedAt
    const ok = await changeOwnPassword(created.user.id, tempPw, "newStrongPass99");
    expect(ok.ok).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } });
    expect(updated.mustChangePassword).toBe(false);
    expect(updated.passwordChangedAt).not.toBeNull();
    expect(await bcrypt.compare("newStrongPass99", updated.passwordHash)).toBe(true);
  });

  it("updates profile, rejects duplicate phone, validates/replaces/removes avatars, and authorizes avatar download", async () => {
    const profileUser = await prisma.user.findUniqueOrThrow({
      where: { email: emails.profileUser },
    });
    const otherUser = await createAccount(
      { id: adminId, role: "ADMIN" },
      {
        name: "Other Phone User",
        email: emails.otherPhoneUser,
        role: "STUDENT",
        password: "otherPassword1",
        phone: testPhone,
      }
    );
    expect(otherUser.user.id).toBeTruthy();

    // Duplicate phone rejected
    await expect(
      updateOwnProfile(profileUser.id, { phone: testPhone })
    ).rejects.toMatchObject({ statusCode: 409, code: "PHONE_EXISTS" });

    // Duplicate email rejected
    await expect(
      updateOwnProfile(profileUser.id, { email: emails.otherPhoneUser })
    ).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_EXISTS" });

    // Valid email, dateOfBirth, gender, and bio persist and serialize cleanly
    const prof = await updateOwnProfile(profileUser.id, {
      name: "Updated Name",
      email: `  ${emails.profileUserRenamed.toUpperCase()}  `,
      phone: "",
      dateOfBirth: "2006-05-14",
      gender: "FEMALE",
      bio: "Mục tiêu IELTS 7.5",
    });
    expect(prof.name).toBe("Updated Name");
    expect(prof.email).toBe(emails.profileUserRenamed);
    expect(prof.phone).toBeNull();
    expect(prof.dateOfBirth).toBe("2006-05-14");
    expect(prof.gender).toBe("FEMALE");
    expect(prof.bio).toBe("Mục tiêu IELTS 7.5");

    const fetched = await getOwnProfile(profileUser.id);
    expect(fetched.email).toBe(emails.profileUserRenamed);
    expect(fetched.dateOfBirth).toBe("2006-05-14");
    expect(fetched.gender).toBe("FEMALE");
    expect(fetched.bio).toBe("Mục tiêu IELTS 7.5");

    // Clearing optional personal fields works cleanly
    const cleared = await updateOwnProfile(profileUser.id, {
      dateOfBirth: null,
      gender: null,
      bio: null,
    });
    expect(cleared.dateOfBirth).toBeNull();
    expect(cleared.gender).toBeNull();
    expect(cleared.bio).toBeNull();

    // Validator rejects invalid calendar dates and future dates
    expect(updateProfileSchema.safeParse({ dateOfBirth: "2025-02-30" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ dateOfBirth: "2099-01-01" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ dateOfBirth: "2008-11-24", gender: "MALE" }).success).toBe(true);

    // Invalid image bytes rejected
    await expect(
      setOwnAvatar(profileUser.id, Buffer.from("not an image"))
    ).rejects.toMatchObject({ statusCode: 400, code: "AVATAR_INVALID_TYPE" });

    // Oversized image (>2MB) rejected
    await expect(
      setOwnAvatar(profileUser.id, Buffer.alloc(2 * 1024 * 1024 + 1, 0xff))
    ).rejects.toMatchObject({ statusCode: 400, code: "AVATAR_TOO_LARGE" });

    // Valid PNG uploads, is authorized for signed-in users, and replaces previous file cleanly
    const first = await setOwnAvatar(profileUser.id, VALID_PNG);
    const firstKey = first.avatarUrl!.slice("/api/files/".length);
    const storage = getStorageProvider();
    expect(await storage.exists(firstKey)).toBe(true);
    expect(await authorizeFileDownload(stu1Id, "STUDENT", firstKey)).toBe(true);

    const second = await setOwnAvatar(profileUser.id, VALID_PNG);
    const secondKey = second.avatarUrl!.slice("/api/files/".length);
    expect(secondKey).not.toBe(firstKey);
    expect(await storage.exists(firstKey)).toBe(false);
    expect(await storage.exists(secondKey)).toBe(true);

    // Removing avatar clears DB field and removes file
    await removeOwnAvatar(profileUser.id);
    const afterRemove = await prisma.user.findUniqueOrThrow({ where: { id: profileUser.id } });
    expect(afterRemove.avatarUrl).toBeNull();
    expect(await storage.exists(secondKey)).toBe(false);
  });

  it("localizes account management errors into English", () => {
    expect(
      localizeApiError("Không thể tự xoá tài khoản của chính bạn.", "SELF_DELETE", "en")
    ).toBe("You cannot delete your own account.");
    expect(
      localizeApiError("Email xác nhận không khớp.", "CONFIRM_MISMATCH", "en")
    ).toBe("Confirmation email does not match.");
    expect(
      localizeApiError("Mật khẩu hiện tại không đúng.", "WRONG_PASSWORD", "en")
    ).toBe("Current password is incorrect.");
    expect(
      localizeApiError(
        "Bạn chỉ đặt lại được mật khẩu cho học sinh / phụ huynh trong lớp của mình.",
        "FORBIDDEN",
        "en"
      )
    ).toBe("You can only reset passwords for students and parents in your own classes.");
  });
});
