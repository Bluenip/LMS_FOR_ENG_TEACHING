import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { createWorksheet, saveWorksheetFields, updateWorksheet } from "@/server/worksheetService";
import { createAssignmentsForClasses } from "@/server/assignmentService";
import {
  autosaveSubmissionAnswers,
  startOrResumeSubmission,
  submitByStudent,
} from "@/server/submissionService";
import {
  createUserFolder,
  deleteUserFolder,
  listUserFolders,
  updateUserFolder,
} from "@/server/folderService";
import {
  createWorksheetSnapshot,
  listWorksheetVersions,
  restoreWorksheetVersion,
} from "@/server/worksheetVersionService";
import {
  cloneDiscoverWorksheet,
  getDiscoverWorksheetDetail,
  getTeacherPublicProfile,
  listContentReports,
  listDiscoverWorksheets,
  moderateContentReport,
  reportDiscoverWorksheet,
  toggleTeacherFollow,
  toggleWorksheetLike,
} from "@/server/discoverService";
import { generateWorksheetQuestionsWithAi } from "@/server/aiGeneratorService";
import {
  getPublicPracticeByToken,
  listPublicPracticeAttempts,
  submitPublicPracticeAttempt,
  toggleAssignmentPublicPractice,
} from "@/server/publicPracticeService";

const suffix = `p25_${Date.now()}`;

const BASE_ASG_DEFAULTS = {
  maxAttempts: 2,
  shuffle: false,
  showResult: "AFTER_SUBMIT" as const,
  showAnswerKey: true,
  allowLate: true,
  showLeaderboard: "OFF" as const,
  leaderboardAnon: false,
  leaderboardScoreRule: "BEST" as const,
  proctorMode: "OFF" as const,
  violationAction: "WARN" as const,
  maxViolations: 3,
  requireFullscreen: false,
  blockCopyPaste: false,
  shareProctorWithParent: false,
  requireCamera: false,
  cameraEnforce: false,
  cameraSnapshots: false,
  audioBlockPause: false,
  audioBlockSeek: false,
};
let adminId = "";
let t1Id = "";
let t2Id = "";
let stuId = "";
let classId = "";

beforeAll(async () => {
  const admin = await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } });
  if (!admin) throw new Error("Admin seed account missing");
  adminId = admin.id;

  const t1 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `T1 ${suffix}`,
      email: `t1_${suffix}@test.local`,
      role: "TEACHER",
      password: "password123",
    }
  );
  const t2 = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `T2 ${suffix}`,
      email: `t2_${suffix}@test.local`,
      role: "TEACHER",
      password: "password123",
    }
  );
  const stu = await createAccount(
    { id: adminId, role: "ADMIN" },
    {
      name: `Stu ${suffix}`,
      email: `stu_${suffix}@test.local`,
      role: "STUDENT",
      password: "password123",
    }
  );
  t1Id = t1.user.id;
  t2Id = t2.user.id;
  stuId = stu.user.id;

  const cls = await createClass(t1Id, { name: `Class ${suffix}` });
  classId = cls.id;
  await prisma.enrollment.create({
    data: { classId, studentId: stuId, status: "ACTIVE" },
  });
});

afterAll(async () => {
  await prisma.publicAttempt.deleteMany({ where: { assignment: { classId } } });
  await prisma.aiUsageLog.deleteMany({ where: { userId: { in: [t1Id, t2Id] } } });
  await prisma.contentReport.deleteMany({ where: { reporterId: { in: [t1Id, t2Id, stuId] } } });
  await prisma.teacherFollow.deleteMany({
    where: { OR: [{ followerId: { in: [t1Id, t2Id] } }, { teacherId: { in: [t1Id, t2Id] } }] },
  });
  await prisma.worksheetLike.deleteMany({ where: { userId: { in: [t1Id, t2Id] } } });
  await prisma.submission.deleteMany({ where: { assignment: { classId } } });
  await prisma.assignment.deleteMany({ where: { classId } });
  await prisma.worksheet.deleteMany({ where: { ownerId: { in: [t1Id, t2Id] } } });
  await prisma.libraryFolder.deleteMany({ where: { ownerId: { in: [t1Id, t2Id] } } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.user.deleteMany({ where: { id: { in: [t1Id, t2Id, stuId] } } });
});

describe("Phase 25 Integration: Folders, Versions, Discover, AI Generator & Public Practice", () => {
  it("supports hierarchical LibraryFolders with cycle rejection and safe delete", async () => {
    const root = await createUserFolder(t1Id, { kind: "WORKSHEET", name: `Root ${suffix}` });
    const child = await createUserFolder(t1Id, {
      kind: "WORKSHEET",
      name: `Child ${suffix}`,
      parentId: root.id,
    });

    await expect(
      updateUserFolder(t1Id, root.id, { parentId: child.id })
    ).rejects.toMatchObject({ statusCode: 400 });

    const ws = await createWorksheet(t1Id, { title: `Folder WS ${suffix}`, subject: "ENGLISH" });
    await updateWorksheet(ws.id, { folderId: child.id, tags: ["unit1", "grammar"] });

    const listed = await listUserFolders(t1Id, "WORKSHEET");
    expect(listed.tree).toHaveLength(1);
    expect(listed.tree[0]!.children[0]!.worksheetCount).toBe(1);

    await deleteUserFolder(t1Id, child.id);
    const refreshedWs = await prisma.worksheet.findUniqueOrThrow({ where: { id: ws.id } });
    expect(refreshedWs.folderId).toBeNull();
  });

  it("auto-snapshots on assignment and creates a safe clone when restoring a submitted worksheet", async () => {
    const ws = await createWorksheet(t1Id, { title: `Versioned WS ${suffix}`, subject: "ENGLISH" });
    await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        prompt: "Original Q1",
        order: 0,
        points: 2,
        answerKey: { accepted: ["alpha"] },
      },
    ]);

    const manualSnap = await createWorksheetSnapshot(ws.id, t1Id, "Before edits");
    expect(manualSnap.versionNo).toBe(1);

    // Assigning triggers automatic snapshot v2
    const [asg] = await createAssignmentsForClasses(t1Id, false, {
      ...BASE_ASG_DEFAULTS,
      worksheetId: ws.id,
      classIds: [classId],
      title: `Asg Version ${suffix}`,
    });
    expect(asg).toBeTruthy();

    // Update worksheet in place when zero submissions
    await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        prompt: "Edited Q1",
        order: 0,
        points: 2,
        answerKey: { accepted: ["beta"] },
      },
    ]);

    const beforeSubRestore = await restoreWorksheetVersion(ws.id, manualSnap.id, t1Id);
    expect(beforeSubRestore.mode).toBe("IN_PLACE");

    // Student starts & submits an attempt
    const sub = await startOrResumeSubmission(asg!.id, stuId, {});
    const fieldId = (await prisma.field.findFirstOrThrow({ where: { worksheetId: ws.id } })).id;
    await autosaveSubmissionAnswers(sub.submission.id, stuId, {
      attemptVersion: sub.submission.attemptVersion,
      answers: [{ fieldId, value: "alpha" }],
    });
    await submitByStudent(sub.submission.id, stuId);

    // Restoring v1 after submission MUST clone cleanly without breaking submission foreign key
    const afterSubRestore = await restoreWorksheetVersion(ws.id, manualSnap.id, t1Id);
    expect(afterSubRestore.mode).toBe("CLONED");
    expect(afterSubRestore.worksheetId).not.toBe(ws.id);

    const versionMeta = await listWorksheetVersions(ws.id);
    expect(versionMeta.hasSubmissions).toBe(true);
    expect(versionMeta.versions.length).toBeGreaterThanOrEqual(2);
  });

  it("handles Discover publishing, liking, zero-key preview, cloning, following, and admin moderation", async () => {
    const ws = await createWorksheet(t1Id, { title: `Public Discover ${suffix}`, subject: "ENGLISH" });
    await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "MULTIPLE_CHOICE",
        label: "1",
        prompt: "Pick A",
        order: 0,
        points: 1,
        options: [
          { id: "A", text: "Option A" },
          { id: "B", text: "Option B" },
        ],
        answerKey: { correct: "A" },
      },
    ]);
    await updateWorksheet(ws.id, {
      isPublic: true,
      publicLevel: "B2",
      tags: ["reading", "b2"],
    });

    const list = await listDiscoverWorksheets({ q: suffix, publicLevel: "B2", viewerId: t2Id });
    expect(list.some((w) => w.id === ws.id)).toBe(true);

    const detail = await getDiscoverWorksheetDetail(ws.id, t2Id);
    expect(detail.fields).toHaveLength(1);
    expect(detail.fields[0]!).not.toHaveProperty("answerKey");

    const likeRes = await toggleWorksheetLike(ws.id, t2Id);
    expect(likeRes).toEqual({ liked: true, likeCount: 1 });

    const cloned = await cloneDiscoverWorksheet(ws.id, { id: t2Id, role: "TEACHER" });
    expect(cloned.ownerId).toBe(t2Id);
    const clonedFieldCount = await prisma.field.count({ where: { worksheetId: cloned.id } });
    expect(clonedFieldCount).toBe(1);

    await expect(toggleTeacherFollow(t1Id, t1Id)).rejects.toMatchObject({ statusCode: 400 });
    const followRes = await toggleTeacherFollow(t1Id, t2Id);
    expect(followRes).toEqual({ following: true, followersCount: 1 });

    const profile = await getTeacherPublicProfile(t1Id, t2Id);
    expect(profile.following).toBe(true);
    expect(profile.teacher.followersCount).toBe(1);

    const report = await reportDiscoverWorksheet(ws.id, t2Id, "Nội dung cần kiểm duyệt lại");
    const openReports = await listContentReports("OPEN");
    expect(openReports.some((r) => r.id === report.id)).toBe(true);

    await moderateContentReport(report.id, adminId, "HIDE");
    const listAfterHide = await listDiscoverWorksheets({ q: suffix, viewerId: t2Id });
    expect(listAfterHide.some((w) => w.id === ws.id)).toBe(false);

    await moderateContentReport(report.id, adminId, "RESTORE");
    const listAfterRestore = await listDiscoverWorksheets({ q: suffix, viewerId: t2Id });
    expect(listAfterRestore.some((w) => w.id === ws.id)).toBe(true);
  });

  it("enforces AI daily quota and stores sanitized drafts with mocked Gemini response", async () => {
    const prevLimit = process.env.AI_DAILY_LIMIT_PER_TEACHER;
    process.env.AI_DAILY_LIMIT_PER_TEACHER = "2";
    try {
      const fakeFetch = async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        {
                          type: "MULTIPLE_CHOICE",
                          prompt: "AI Sample Q1",
                          points: 1,
                          options: [
                            { id: "A", text: "One" },
                            { id: "B", text: "Two" },
                          ],
                          answerKey: { correct: "A" },
                        },
                      ]),
                    },
                  ],
                },
              },
            ],
            usageMetadata: { totalTokenCount: 120 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const gen1 = await generateWorksheetQuestionsWithAi(
        { id: t2Id, role: "TEACHER" },
        {
          sourceText: "Sample biology paragraph about mitochondria.",
          subject: "BIOLOGY",
          count: 1,
          types: ["MULTIPLE_CHOICE"],
          level: "B1",
        },
        { fetchImpl: fakeFetch as typeof fetch, apiKeyOverride: "fake-key" }
      );
      expect(gen1.questions).toHaveLength(1);
      expect(gen1.quota.used).toBe(1);
      expect(gen1.quota.remaining).toBe(1);

      await generateWorksheetQuestionsWithAi(
        { id: t2Id, role: "TEACHER" },
        {
          sourceText: "Second sample biology paragraph about cells.",
          subject: "BIOLOGY",
          count: 1,
          types: ["MULTIPLE_CHOICE"],
        },
        { fetchImpl: fakeFetch as typeof fetch, apiKeyOverride: "fake-key" }
      );

      // Third attempt hits daily limit 429
      await expect(
        generateWorksheetQuestionsWithAi(
          { id: t2Id, role: "TEACHER" },
          {
            sourceText: "Third call exceeds quota.",
            subject: "BIOLOGY",
            count: 1,
            types: ["MULTIPLE_CHOICE"],
          },
          { fetchImpl: fakeFetch as typeof fetch, apiKeyOverride: "fake-key" }
        )
      ).rejects.toMatchObject({ statusCode: 429, code: "AI_QUOTA_EXCEEDED" });
    } finally {
      if (prevLimit === undefined) delete process.env.AI_DAILY_LIMIT_PER_TEACHER;
      else process.env.AI_DAILY_LIMIT_PER_TEACHER = prevLimit;
    }
  });

  it("supports guest public practice links without leaking answerKey or polluting Submission", async () => {
    const ws = await createWorksheet(t1Id, { title: `Public Practice WS ${suffix}`, subject: "ENGLISH" });
    await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        prompt: "Capital of France?",
        order: 0,
        points: 5,
        answerKey: { accepted: ["Paris"] },
      },
    ]);
    const [asg] = await createAssignmentsForClasses(t1Id, false, {
      ...BASE_ASG_DEFAULTS,
      worksheetId: ws.id,
      classIds: [classId],
      title: `Guest Practice Asg ${suffix}`,
      maxAttempts: 1,
      showAnswerKey: false,
    });

    const enabled = await toggleAssignmentPublicPractice(asg!.id, true);
    expect(enabled.allowPublicPractice).toBe(true);
    expect(enabled.publicShareToken).toBeTruthy();
    const token = enabled.publicShareToken!;

    const guestPayload = await getPublicPracticeByToken(token);
    expect(guestPayload.worksheet.fields[0]!).not.toHaveProperty("answerKey");

    const fieldId = guestPayload.worksheet.fields[0]!.id;
    const beforeSubCount = await prisma.submission.count({ where: { assignmentId: asg!.id } });
    const submitted = await submitPublicPracticeAttempt(token, {
      guestName: "Guest Tester",
      answers: [{ fieldId, value: "Paris" }],
    });
    const afterSubCount = await prisma.submission.count({ where: { assignmentId: asg!.id } });

    expect(submitted.autoScore).toBe(5);
    expect(submitted.maxScore).toBe(5);
    expect(afterSubCount).toBe(beforeSubCount);

    const stats = await listPublicPracticeAttempts(asg!.id);
    expect(stats.count).toBe(1);
    expect(stats.avgScore).toBe(5);

    // Turning off public link blocks guest access cleanly
    await toggleAssignmentPublicPractice(asg!.id, false);
    await expect(getPublicPracticeByToken(token)).rejects.toMatchObject({ statusCode: 404 });
  });
});
