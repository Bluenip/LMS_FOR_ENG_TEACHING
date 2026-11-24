import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { POST as registerPost } from "@/app/api/auth/register/route";

const stamp = Date.now();
const emails = {
  admTeacher: `prov-teacher-${stamp}@test.vn`,
  student: `prov-student-${stamp}@test.vn`,
  parent: `prov-parent-${stamp}@test.vn`,
  blocked: `prov-blocked-${stamp}@test.vn`,
};

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
});

describe("Account provisioning (no self-registration)", () => {
  it("public registration API is disabled", async () => {
    const res = await registerPost();
    expect(res.status).toBe(403);
  });

  it("admin can create a teacher; password is generated and returned once", async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    const r = await createAccount(admin, { name: "Prov Teacher", email: emails.admTeacher, role: "TEACHER" });
    expect(r.user.role).toBe("TEACHER");
    expect(r.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);
  });

  it("teacher cannot create teacher/admin accounts", async () => {
    const cls = await prisma.class.findFirstOrThrow({ where: { joinCode: "ENG12A" } });
    const teacher = await prisma.user.findUniqueOrThrow({ where: { id: cls.teacherId } });
    await expect(
      createAccount(teacher, { name: "X", email: emails.blocked, role: "TEACHER", classId: cls.id })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("teacher creates a student (enrolled) and a parent linked to that student", async () => {
    const cls = await prisma.class.findFirstOrThrow({ where: { joinCode: "ENG12A" } });
    const teacher = await prisma.user.findUniqueOrThrow({ where: { id: cls.teacherId } });
    const s = await createAccount(teacher, {
      name: "Prov Student",
      email: emails.student,
      role: "STUDENT",
      classId: cls.id,
      password: "secret123",
    });
    expect(s.temporaryPassword).toBeNull();
    const enr = await prisma.enrollment.findUnique({
      where: { classId_studentId: { classId: cls.id, studentId: s.user.id } },
    });
    expect(enr?.status).toBe("ACTIVE");

    const p = await createAccount(teacher, {
      name: "Prov Parent",
      email: emails.parent,
      role: "PARENT",
      classId: cls.id,
      studentId: s.user.id,
    });
    const link = await prisma.parentLink.findUnique({
      where: { parentId_studentId: { parentId: p.user.id, studentId: s.user.id } },
    });
    expect(link?.verifiedAt).not.toBeNull();
  });

  it("teacher cannot link a parent to a student of another class", async () => {
    const cls = await prisma.class.findFirstOrThrow({ where: { joinCode: "ENG12A" } });
    const teacher = await prisma.user.findUniqueOrThrow({ where: { id: cls.teacherId } });
    const other = await prisma.class.findFirstOrThrow({ where: { joinCode: "IELT65" } });
    const outsider = await prisma.enrollment.findFirstOrThrow({ where: { classId: other.id, status: "ACTIVE" } });
    await expect(
      createAccount(teacher, {
        name: "Bad Parent",
        email: emails.blocked,
        role: "PARENT",
        classId: cls.id,
        studentId: outsider.studentId,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
