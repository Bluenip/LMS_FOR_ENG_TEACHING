import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  createAssignmentsForClasses,
  updateAssignment,
  type CreateAssignmentInput,
} from "@/server/assignmentService";
import { createWorksheet, saveWorksheetFields } from "@/server/worksheetService";
import { getStudentAssignmentPayload, startOrResumeSubmission } from "@/server/submissionService";
import {
  getLiveProctoringSnapshot,
  isHeuristicProctorEvent,
  recordProctorEvent,
} from "@/server/proctorService";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const stamp = Date.now();
const prefix = `p18-${stamp}`;
const emails: string[] = [];

let adminId = "";
let teacherId = "";
let student1Id = "";
let student2Id = "";
let classId = "";
let worksheetId = "";

function baseAssignment(
  overrides: Partial<CreateAssignmentInput> & Pick<CreateAssignmentInput, "title">
): CreateAssignmentInput {
  return {
    worksheetId,
    classIds: [classId],
    maxAttempts: 3,
    shuffle: false,
    shuffleOptions: false,
    showResult: "AFTER_SUBMIT",
    showAnswerKey: false,
    allowLate: false,
    showLeaderboard: "OFF",
    leaderboardAnon: false,
    leaderboardScoreRule: "BEST",
    proctorMode: "MONITOR",
    violationAction: "LOCK",
    maxViolations: 1,
    requireFullscreen: false,
    blockCopyPaste: true,
    shareProctorWithParent: false,
    requireCamera: true,
    cameraEnforce: true,
    cameraSnapshots: false,
    cameraSensitivity: "MEDIUM",
    cameraCountLookAway: false,
    requireMicMonitor: false,
    audioBlockPause: false,
    audioBlockSeek: false,
    ...overrides,
  };
}

async function makeUser(tag: string, role: "TEACHER" | "STUDENT") {
  const email = `${prefix}-${tag}@test.vn`;
  emails.push(email);
  const res = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: `${prefix} ${tag}`, email, role, password: "Password12345" }
  );
  return res.user.id;
}

beforeAll(async () => {
  adminId = (
    await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN", deletedAt: null, isLocked: false },
    })
  ).id;
  teacherId = await makeUser("t1", "TEACHER");
  student1Id = await makeUser("s1", "STUDENT");
  student2Id = await makeUser("s2", "STUDENT");

  const cls = await createClass(teacherId, { name: `${prefix} Class` });
  classId = cls.id;
  await prisma.enrollment.createMany({
    data: [
      { classId, studentId: student1Id, status: "ACTIVE" },
      { classId, studentId: student2Id, status: "ACTIVE" },
    ],
  });

  const ws = await createWorksheet(teacherId, { title: `${prefix} WS`, subject: "ENGLISH" });
  worksheetId = ws.id;
  await saveWorksheetFields(ws.id, [
    {
      placement: "ANSWER_SHEET",
      type: "TEXT",
      label: "1",
      order: 0,
      points: 1,
      answerKey: { accepted: ["ok"] },
    },
  ]);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [teacherId] } } });
  await prisma.notification.deleteMany({
    where: { userId: { in: [teacherId, student1Id, student2Id] } },
  });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 18 Integration: Camera Sensitivity, Look-Away Enforcement, Mic & Mobile Events", () => {
  it("classifies CAMERA_GAZE_AWAY, MIC_VOICE, MOBILE_APP_SWITCH as heuristic and enforces CAMERA_LOOK_AWAY only when cameraCountLookAway is true", async () => {
    expect(
      isHeuristicProctorEvent("CAMERA_GAZE_AWAY", {
        proctorMode: "LOCKDOWN",
        requireCamera: true,
        cameraEnforce: true,
        cameraCountLookAway: true,
      })
    ).toBe(true);
    expect(
      isHeuristicProctorEvent("MIC_VOICE", {
        proctorMode: "LOCKDOWN",
        requireCamera: true,
        cameraEnforce: true,
        cameraCountLookAway: true,
      })
    ).toBe(true);
    expect(
      isHeuristicProctorEvent("MOBILE_APP_SWITCH", {
        proctorMode: "LOCKDOWN",
        requireCamera: true,
        cameraEnforce: true,
        cameraCountLookAway: true,
      })
    ).toBe(true);

    // CAMERA_LOOK_AWAY: false -> heuristic; true (with cameraEnforce) -> enforced
    expect(
      isHeuristicProctorEvent("CAMERA_LOOK_AWAY", {
        proctorMode: "MONITOR",
        requireCamera: true,
        cameraEnforce: true,
        cameraCountLookAway: false,
      })
    ).toBe(true);
    expect(
      isHeuristicProctorEvent("CAMERA_LOOK_AWAY", {
        proctorMode: "MONITOR",
        requireCamera: true,
        cameraEnforce: true,
        cameraCountLookAway: true,
      })
    ).toBe(false);
  });

  it("persists cameraSensitivity/cameraCountLookAway/requireMicMonitor across create, update, payload and live snapshot", async () => {
    const [asg] = await createAssignmentsForClasses(
      teacherId,
      false,
      baseAssignment({
        title: `${prefix} Flag-only LookAway`,
        cameraSensitivity: "HIGH",
        cameraCountLookAway: false,
        requireMicMonitor: true,
      })
    );
    expect(asg).toBeTruthy();

    const payload1 = await getStudentAssignmentPayload(asg!.id, student1Id);
    expect(payload1.assignment.cameraSensitivity).toBe("HIGH");
    expect(payload1.assignment.cameraCountLookAway).toBe(false);
    expect(payload1.assignment.requireMicMonitor).toBe(true);

    const started1 = await startOrResumeSubmission(asg!.id, student1Id, {
      rulesAccepted: true,
      cameraConsent: true,
    });
    const sub1Id = started1.submission.id;

    // Look-away + mic + gaze + mobile switch should NOT lock student1 when cameraCountLookAway = false
    const evLook1 = await recordProctorEvent(sub1Id, student1Id, {
      type: "CAMERA_LOOK_AWAY",
      durationMs: 2500,
    });
    expect(evLook1.violationCount).toBe(0);
    expect(evLook1.locked).toBe(false);

    const evMic = await recordProctorEvent(sub1Id, student1Id, {
      type: "MIC_VOICE",
      durationMs: 2600,
      meta: { peakRms: 0.22 },
    });
    expect(evMic.violationCount).toBe(0);

    const evMobile = await recordProctorEvent(sub1Id, student1Id, {
      type: "MOBILE_APP_SWITCH",
      meta: { reason: "pagehide" },
    });
    expect(evMobile.violationCount).toBe(0);

    // Live snapshot shows recently left for MOBILE_APP_SWITCH and new assignment flags
    const live = await getLiveProctoringSnapshot(asg!.id);
    expect(live.assignment.cameraSensitivity).toBe("HIGH");
    expect(live.assignment.cameraCountLookAway).toBe(false);
    expect(live.assignment.requireMicMonitor).toBe(true);
    const s1Card = live.students.find((s) => s.studentId === student1Id);
    expect(s1Card?.liveStatus).toBe("LEFT_TAB");

    // Toggle cameraCountLookAway = true and update sensitivity to LOW
    const updatedInputs = baseAssignment({
      title: `${prefix} Flag-only LookAway`,
      cameraSensitivity: "LOW",
      cameraCountLookAway: true,
      requireMicMonitor: true,
    });
    const { worksheetId: _w, classIds: _c, ...updateFields } = updatedInputs;
    void _w;
    void _c;
    await updateAssignment(
      asg!.id,
      {
        ...updateFields,
        shuffleOptions: false,
        oneQuestionPerPage: false,
      },
      teacherId
    );
    const payloadUpdated = await getStudentAssignmentPayload(asg!.id, student2Id);
    expect(payloadUpdated.assignment.cameraSensitivity).toBe("LOW");
    expect(payloadUpdated.assignment.cameraCountLookAway).toBe(true);

    // Now CAMERA_LOOK_AWAY enforces LOCK for student2
    const started2 = await startOrResumeSubmission(asg!.id, student2Id, {
      rulesAccepted: true,
      cameraConsent: true,
    });
    const evLook2 = await recordProctorEvent(started2.submission.id, student2Id, {
      type: "CAMERA_LOOK_AWAY",
      durationMs: 4200,
    });
    expect(evLook2.violationCount).toBe(1);
    expect(evLook2.locked).toBe(true);
  });
});
