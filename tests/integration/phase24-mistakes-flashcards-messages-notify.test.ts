import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { createWorksheet, saveWorksheetFields } from "@/server/worksheetService";
import {
  autosaveSubmissionAnswers,
  startOrResumeSubmission,
  submitByStudent,
} from "@/server/submissionService";
import { listReviewableMistakesForStudent } from "@/server/mistakeReviewService";
import {
  extractFlashcardsFromWorksheet,
  getDeckReviewQueue,
  submitFlashcardReview,
} from "@/server/flashcardService";
import {
  getStudentGamificationSummary,
} from "@/server/gamificationService";
import {
  getParentThreadMessages,
  openOrCreateParentThread,
  sendParentThreadMessage,
} from "@/server/parentMessageService";
import {
  sendEmailNotification,
  sendPushToUser,
  setExternalNotifyTestHooks,
  subscribeUserPush,
  updateUserNotificationPreferences,
} from "@/server/externalNotifyService";
import { runWeeklyParentReports } from "@/server/weeklyReportService";

const suffix = `p24_${Date.now()}`;
let adminId = "";
let t1Id = "";
let t2Id = "";
let stu1Id = "";
let p1Id = "";
let outsiderParentId = "";
let class1Id = "";
let wsId = "";

beforeAll(async () => {
  const admin = await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } });
  adminId = admin!.id;

  const [t1, t2, s1, p1, pOut] = await Promise.all([
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `GV1 ${suffix}`, email: `t1_${suffix}@test.vn`, password: "password123", role: "TEACHER" }
    ),
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `GV2 ${suffix}`, email: `t2_${suffix}@test.vn`, password: "password123", role: "TEACHER" }
    ),
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `HS1 ${suffix}`, email: `s1_${suffix}@test.vn`, password: "password123", role: "STUDENT" }
    ),
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `PH1 ${suffix}`, email: `p1_${suffix}@test.vn`, password: "password123", role: "PARENT" }
    ),
    createAccount(
      { id: adminId, role: "ADMIN" },
      { name: `PH Out ${suffix}`, email: `pout_${suffix}@test.vn`, password: "password123", role: "PARENT" }
    ),
  ]);

  t1Id = t1.user.id;
  t2Id = t2.user.id;
  stu1Id = s1.user.id;
  p1Id = p1.user.id;
  outsiderParentId = pOut.user.id;

  await prisma.parentLink.create({
    data: { parentId: p1Id, studentId: stu1Id, relation: "Bố", verifiedAt: new Date() },
  });

  const c1 = await createClass(t1Id, { name: `Class P24 ${suffix}` });
  class1Id = c1.id;
  await prisma.enrollment.create({
    data: { classId: class1Id, studentId: stu1Id, status: "ACTIVE" },
  });

  const ws = await createWorksheet(t1Id, { title: `WS P24 ${suffix}`, subject: "ENGLISH" });
  wsId = ws.id;
  await saveWorksheetFields(wsId, [
    {
      label: "1",
      type: "MULTIPLE_CHOICE",
      placement: "ANSWER_SHEET",
      order: 0,
      points: 5,
      prompt: "Choose the synonym of resilient:",
      options: [
        { id: "A", text: "fragile" },
        { id: "B", text: "adaptable" },
      ],
      answerKey: { correct: "B" },
      explanation: "Resilient means able to recover quickly.",
      skillTag: "VOCABULARY",
    },
  ]);
});

afterAll(async () => {
  setExternalNotifyTestHooks({});
  await prisma.weeklyReportSent.deleteMany({ where: { parentId: p1Id } });
  await prisma.notification.deleteMany({ where: { userId: { in: [p1Id, t1Id, stu1Id] } } });
  await prisma.flashcardDeck.deleteMany({ where: { ownerId: { in: [t1Id, stu1Id] } } });
  await prisma.worksheet.deleteMany({ where: { id: wsId } });
  await prisma.class.deleteMany({ where: { id: class1Id } });
  await prisma.user.deleteMany({
    where: { id: { in: [t1Id, t2Id, stu1Id, p1Id, outsiderParentId] } },
  });
});

describe("Phase 24 integration: Mistake leak prevention, Flashcard SRS, ParentThread IDOR & Encrypted Push/Email", () => {
  it("prevents mistake answer leaks when showResult=NEVER or retakes remain, and unlocks after finalized", async () => {
    const fields = await prisma.field.findMany({ where: { worksheetId: wsId } });
    const fieldId = fields[0]!.id;

    // 1. Secret assignment (showAnswerKey=true, maxAttempts=2 -> student still has 1 retake!)
    const retakableAsg = await prisma.assignment.create({
      data: {
        classId: class1Id,
        worksheetId: wsId,
        title: `Retakable P24 ${suffix}`,
        maxAttempts: 2,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: true,
      },
    });
    const st1 = await startOrResumeSubmission(retakableAsg.id, stu1Id, {});
    await autosaveSubmissionAnswers(st1.submission.id, stu1Id, {
      attemptVersion: st1.submission.attemptVersion,
      answers: [{ fieldId, value: "A" }],
    });
    await submitByStudent(st1.submission.id, stu1Id);

    // Must NOT reveal wrong answer while attempts remain!
    const mistakesBeforeClose = await listReviewableMistakesForStudent(stu1Id);
    expect(mistakesBeforeClose.some((m) => m.assignmentId === retakableAsg.id)).toBe(false);

    // 2. Finalized closed assignment -> MUST reveal mistake AND trigger streak gamification
    const closedAsg = await prisma.assignment.create({
      data: {
        classId: class1Id,
        worksheetId: wsId,
        title: `Closed P24 ${suffix}`,
        maxAttempts: 1,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: true,
      },
    });
    const st2 = await startOrResumeSubmission(closedAsg.id, stu1Id, {});
    await autosaveSubmissionAnswers(st2.submission.id, stu1Id, {
      attemptVersion: st2.submission.attemptVersion,
      answers: [{ fieldId, value: "A" }],
    });
    await submitByStudent(st2.submission.id, stu1Id);

    const mistakesAfter = await listReviewableMistakesForStudent(stu1Id);
    const hit = mistakesAfter.find((m) => m.assignmentId === closedAsg.id);
    expect(hit).toBeTruthy();
    expect(hit?.explanation).toContain("recover quickly");

    const gamif = await getStudentGamificationSummary(stu1Id);
    expect(gamif.enabled).toBe(true);
    expect(gamif.streak?.currentStreak).toBeGreaterThanOrEqual(1);
    expect(gamif.badges.some((b) => b.code === "FIRST_SUBMIT")).toBe(true);
  });

  it("extracts flashcard deck from worksheet and persists SM-2 SRS reviews", async () => {
    const deck = await extractFlashcardsFromWorksheet(t1Id, false, {
      worksheetId: wsId,
      classId: class1Id,
      title: `Deck P24 ${suffix}`,
    });
    expect(deck.cards).toHaveLength(1);

    const qBefore = await getDeckReviewQueue(deck.id, stu1Id, "STUDENT");
    expect(qBefore.dueCards).toHaveLength(1);

    const rev = await submitFlashcardReview(
      deck.id,
      deck.cards[0]!.id,
      stu1Id,
      "STUDENT",
      4
    );
    expect(rev.intervalDays).toBe(1);
    expect(rev.repetitions).toBe(1);

    const qAfter = await getDeckReviewQueue(deck.id, stu1Id, "STUDENT");
    expect(qAfter.dueCards).toHaveLength(0);
  });

  it("enforces strict ParentThread anti-IDOR between unrelated parents & teachers", async () => {
    // Outsider parent CANNOT open thread for stu1
    await expect(
      openOrCreateParentThread({ id: outsiderParentId, role: "PARENT" }, { classId: class1Id, studentId: stu1Id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Unrelated teacher CANNOT open thread for class1
    await expect(
      openOrCreateParentThread({ id: t2Id, role: "TEACHER" }, { classId: class1Id, studentId: stu1Id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Verified parent opens thread & sends message -> teacher sees it & can reply
    const thread = await openOrCreateParentThread(
      { id: p1Id, role: "PARENT" },
      { classId: class1Id, studentId: stu1Id }
    );
    await sendParentThreadMessage({ id: p1Id, role: "PARENT" }, thread.id, "Xin chào giáo viên P24");

    // Outsider teacher blocked from reading
    await expect(
      getParentThreadMessages({ id: t2Id, role: "TEACHER" }, thread.id)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const msgs = await getParentThreadMessages({ id: t1Id, role: "TEACHER" }, thread.id);
    expect(msgs.messages).toHaveLength(1);
    expect(msgs.messages[0]!.content).toBe("Xin chào giáo viên P24");
  });

  it("encrypts Web Push keys at rest, auto-prunes 410 Gone, respects email prefs, and deduplicates weekly report", async () => {
    const pushCalls: Array<{ endpoint: string; p256dh: string; payload: string }> = [];
    const emailCalls: Array<{ to: string; subject: string }> = [];

    // Test 410 Gone auto-cleanup
    setExternalNotifyTestHooks({
      pushSender: {
        async sendNotification(sub, payload) {
          pushCalls.push({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, payload });
          if (sub.endpoint.includes("expired")) {
            throw Object.assign(new Error("Gone"), { statusCode: 410 });
          }
        },
      },
      emailSender: {
        async sendMail(mail) {
          emailCalls.push({ to: mail.to, subject: mail.subject });
        },
      },
    });

    await subscribeUserPush(p1Id, {
      endpoint: `https://push.example.com/ok-${suffix}`,
      keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg", auth: "tBHItJI5svbpez7KI4CCXg" },
    });
    await subscribeUserPush(p1Id, {
      endpoint: `https://push.example.com/expired-${suffix}`,
      keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg", auth: "tBHItJI5svbpez7KI4CCXg" },
    });

    // Keys stored in DB must be AES-256-GCM envelopes, never plaintext!
    const storedSubs = await prisma.pushSubscription.findMany({ where: { userId: p1Id } });
    expect(storedSubs.every((s) => s.p256dhEncrypted.startsWith("v1:"))).toBe(true);

    const pushRes = await sendPushToUser(p1Id, { title: "Test", body: "Hello Push" });
    expect(pushRes.sent).toBe(1);
    expect(pushCalls).toHaveLength(2);
    // Expired endpoint deleted automatically
    const remainingSubs = await prisma.pushSubscription.findMany({ where: { userId: p1Id } });
    expect(remainingSubs).toHaveLength(1);

    // Email respects preference opt-out
    await updateUserNotificationPreferences(p1Id, { emailWeeklyReport: true });
    const sunday19h = new Date("2026-11-29T12:15:00.000Z"); // Sunday 19:15 +07:00
    const rep1 = await runWeeklyParentReports({ now: sunday19h });
    expect(rep1.ran).toBe(true);
    expect(emailCalls.some((e) => e.to === `p1_${suffix}@test.vn`)).toBe(true);

    // Second call for same weekKey must deduplicate without duplicate send
    const countBefore = emailCalls.length;
    await runWeeklyParentReports({ now: sunday19h });
    expect(emailCalls).toHaveLength(countBefore);

    // Opt-out blocks future emails
    await updateUserNotificationPreferences(p1Id, { emailEnabled: false });
    const blocked = await sendEmailNotification({
      userId: p1Id,
      toEmail: `p1_${suffix}@test.vn`,
      subject: "Should skip",
      text: "skip",
    });
    expect(blocked.sent).toBe(false);
  });
});
