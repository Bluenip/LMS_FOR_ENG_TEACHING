import { z } from "zod";
import {
  CameraSensitivity,
  FieldPlacement,
  FieldType,
  LeaderboardMode,
  LessonItemType,
  ProctorEventType,
  ProctorMode,
  Role,
  ScoreScale,
  ShowResultMode,
  SkillTag,
  ViolationAction,
  WorksheetSubject,
} from "@prisma/client";

// ===== Auth =====
export const registerSchema = z.object({
  name: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(100),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
  role: z.enum(["TEACHER", "STUDENT", "PARENT"]).default("STUDENT"),
});

// ===== Account provisioning (self-registration disabled) =====
const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const createAccountSchema = z.object({
  name: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(100),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  // empty = the system generates a temporary password and returns it once
  password: optionalTrimmed.pipe(z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100).optional()),
  phone: optionalTrimmed,
  classId: optionalTrimmed,
  studentId: optionalTrimmed,
  relation: optionalTrimmed,
});

export const deleteAccountSchema = z.object({ confirmEmail: z.string().trim().min(3) });

const dateOfBirthSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .superRefine((val, ctx) => {
    if (val === undefined || val === null || val === "") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ngày sinh không hợp lệ" });
      return;
    }
    const [y, m, d] = val.split("-").map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      y < 1900 ||
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ngày sinh không hợp lệ" });
      return;
    }
    const maxYmd = new Date(Date.now() + 12 * 3600 * 1000).toISOString().slice(0, 10);
    if (val > maxYmd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ngày sinh không được ở tương lai" });
    }
  })
  .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null));

const genderSchema = z
  .union([z.enum(["", "MALE", "FEMALE", "OTHER"]), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null));

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(100).optional(),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(160).optional(),
  phone: z
    .union([
      z
        .string()
        .trim()
        .max(20)
        .regex(/^[0-9+ ()-]*$/, "Số điện thoại không hợp lệ"),
      z.null(),
    ])
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
  dateOfBirth: dateOfBirthSchema,
  gender: genderSchema,
  bio: z
    .union([z.string().trim().max(300, "Giới thiệu tối đa 300 ký tự"), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
  newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự").max(100),
});

export const totpEnableSchema = z.object({
  code: z.string().trim().min(6, "Nhập mã xác thực 6 số").max(20),
});

export const totpConfirmWithPasswordSchema = z.object({
  password: z.string().min(1, "Nhập mật khẩu hiện tại"),
  code: z.string().trim().min(6, "Nhập mã xác thực 6 số hoặc mã dự phòng").max(20),
});

// ===== Class =====
export const createClassSchema = z.object({
  name: z.string().trim().min(2, "Tên lớp tối thiểu 2 ký tự").max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  requireApproval: z.boolean().optional().default(false),
});

export const updateClassSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  requireApproval: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const joinClassSchema = z.object({
  joinCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, "Mã lớp không hợp lệ")
    .max(12),
});

export const createPostSchema = z.object({
  content: z.string().trim().min(1, "Nội dung không được để trống").max(5000),
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Bình luận không được để trống").max(2000),
});

// ===== Worksheet & Fields =====
export const worksheetPassageSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().max(200),
  content: z.string().max(30000),
  order: z.number().int().min(0).max(500).default(0),
});

export const createWorksheetSchema = z.object({
  title: z.string().trim().min(2, "Tiêu đề tối thiểu 2 ký tự").max(200),
  subject: z.nativeEnum(WorksheetSubject).default("GENERAL"),
  instructions: z.string().trim().max(3000).optional().nullable(),
});

export const updateWorksheetSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  subject: z.nativeEnum(WorksheetSubject).optional(),
  instructions: z.string().trim().max(3000).optional().nullable(),
  passages: z.array(worksheetPassageSchema).max(30).optional().nullable(),
  isShared: z.boolean().optional(),
});

export const fieldOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  text: z.string().trim().max(500),
});

export const fieldStyleSchema = z
  .object({
    fontSize: z.number().min(8).max(48).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    color: z.string().max(32).optional(),
    transparentBg: z.boolean().optional(),
  })
  .optional()
  .nullable();

export const rubricCriterionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1, "Tên tiêu chí rubric không được để trống").max(200),
  description: z.string().trim().max(500).optional(),
  maxPoints: z.number().min(0).max(1000),
});

export const gradingOptsSchema = z
  .object({
    caseSensitive: z.boolean().optional(),
    ignorePunctuation: z.boolean().optional(),
    ignoreExtraSpaces: z.boolean().optional(),
    partialCredit: z.boolean().optional(),
    scoring: z.enum(["WORD_ACCURACY", "ALL_OR_NOTHING"]).optional(),
    tfScoring: z.enum(["THPT_2025", "ALL_OR_NOTHING", "EQUAL"]).optional(),
  })
  .optional()
  .nullable();

export const fieldItemSchema = z
  .object({
    id: z.string().trim().min(1).max(64).optional(),
    placement: z.nativeEnum(FieldPlacement),
    type: z.nativeEnum(FieldType),
    label: z.string().trim().min(1).max(40),
    prompt: z.string().trim().max(2000).optional().nullable(),
    explanation: z.string().trim().max(2000).optional().nullable(),
    skillTag: z.nativeEnum(SkillTag).optional().nullable(),
    passageId: z.string().trim().min(1).max(64).optional().nullable(),
    audioId: z.string().trim().min(1).max(64).optional().nullable(),
    imageKey: z.string().trim().max(300).optional().nullable(),
    order: z.number().int().min(0),
    points: z.number().min(0).max(1000).default(1),
    pageIndex: z.number().int().min(0).optional().nullable(),
    x: z.number().min(0).max(1).optional().nullable(),
    y: z.number().min(0).max(1).optional().nullable(),
    w: z.number().min(0.005).max(1).optional().nullable(),
    h: z.number().min(0.005).max(1).optional().nullable(),
    style: fieldStyleSchema,
    options: z.array(fieldOptionSchema).optional().nullable(),
    answerKey: z.record(z.unknown()),
    gradingOpts: gradingOptsSchema,
    rubric: z.array(rubricCriterionSchema).max(20).optional().nullable(),
  })
  .superRefine((field, ctx) => {
    if (field.placement === "OVERLAY") {
      if (
        field.pageIndex === null ||
        field.pageIndex === undefined ||
        field.x === null ||
        field.x === undefined ||
        field.y === null ||
        field.y === undefined ||
        field.w === null ||
        field.w === undefined ||
        field.h === null ||
        field.h === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ô Overlay bắt buộc có toạ độ chuẩn hoá (pageIndex, x, y, w, h).",
        });
      }
    }
  });

export const saveWorksheetFieldsSchema = z.object({
  fields: z.array(fieldItemSchema).max(500),
});

export const updateWorksheetAudioSchema = z.object({
  title: z.string().trim().min(1, "Tên file nghe không được để trống").max(200).optional(),
  order: z.number().int().min(0).optional(),
  durationSec: z.number().int().min(0).max(86400).optional().nullable(),
});

// ===== Assignment =====
export const createAssignmentSchema = z.object({
  worksheetId: z.string().min(1),
  classIds: z.array(z.string().min(1)).min(1, "Vui lòng chọn ít nhất 1 lớp"),
  title: z.string().trim().min(2, "Tên bài giao tối thiểu 2 ký tự").max(200),
  openAt: z.string().datetime().optional().nullable().or(z.literal("")),
  dueAt: z.string().datetime().optional().nullable().or(z.literal("")),
  timeLimitMin: z.number().int().min(1).max(600).optional().nullable(),
  maxAttempts: z.number().int().min(1).max(50).nullable().default(1),
  shuffle: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showResult: z.nativeEnum(ShowResultMode).default("AFTER_SUBMIT"),
  showAnswerKey: z.boolean().default(false),
  allowLate: z.boolean().default(false),
  showLeaderboard: z.nativeEnum(LeaderboardMode).default("AFTER_DUE"),
  leaderboardAnon: z.boolean().default(false),
  leaderboardScoreRule: z.enum(["BEST", "LAST"]).default("BEST"),
  proctorMode: z.nativeEnum(ProctorMode).default("OFF"),
  violationAction: z.nativeEnum(ViolationAction).default("WARN"),
  maxViolations: z.number().int().min(1).max(20).default(3),
  requireFullscreen: z.boolean().default(false),
  blockCopyPaste: z.boolean().default(false),
  sebConfigKeyHash: z.string().trim().max(256).optional().nullable(),
  shareProctorWithParent: z.boolean().default(false),
  requireCamera: z.boolean().default(false),
  cameraEnforce: z.boolean().default(false),
  cameraSnapshots: z.boolean().default(true),
  cameraSensitivity: z.nativeEnum(CameraSensitivity).default("MEDIUM"),
  cameraCountLookAway: z.boolean().default(false),
  requireMicMonitor: z.boolean().default(false),
  audioMaxPlays: z.number().int().min(1).max(20).optional().nullable(),
  audioBlockPause: z.boolean().default(false),
  audioBlockSeek: z.boolean().default(false),
  oneQuestionPerPage: z.boolean().default(false),
  remindBeforeDue: z.boolean().default(true),
  scoreScale: z.nativeEnum(ScoreScale).default("SCALE_10"),
  weight: z.number().min(0.5).max(10).default(1),
  targetStudentIds: z.array(z.string().trim().min(1).max(64)).max(500).optional().nullable(),
});

/** Editing an assignment after it was given: same settings, but worksheet and class are fixed. */
export const updateAssignmentSchema = createAssignmentSchema.omit({ worksheetId: true, classIds: true });
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const upsertAssignmentOverrideSchema = z.object({
  studentId: z.string().trim().min(1),
  extraAttempts: z.number().int().min(0).max(50).default(0),
  dueAt: z.string().datetime().optional().nullable().or(z.literal("")),
  timeLimitMin: z.number().int().min(1).max(600).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const createCommentPresetSchema = z.object({
  content: z.string().trim().min(1, "Nội dung nhận xét mẫu không được để trống").max(500),
  category: z.string().trim().max(60).optional().nullable(),
});

export const photoAnnotationItemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum(["pen", "rect", "circle", "check", "cross", "text"]),
  color: z.string().trim().min(3).max(32),
  strokeWidth: z.number().min(0.5).max(32),
  points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).max(2000).optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  w: z.number().min(0).max(1).optional(),
  h: z.number().min(0).max(1).optional(),
  text: z.string().trim().max(500).optional(),
});

export const savePhotoAnnotationsSchema = z.object({
  fieldId: z.string().trim().min(1),
  annotations: z.record(z.string().trim().min(1).max(300), z.array(photoAnnotationItemSchema).max(500)),
});

// ===== Submission & Grading =====
export const startSubmissionSchema = z.object({
  rulesAccepted: z.boolean().optional(),
  cameraConsent: z.boolean().optional(),
  attemptToken: z.string().max(128).optional(),
});

const uploadedAnswerFileSchema = z.object({
  key: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().min(0).max(20 * 1024 * 1024).optional(),
});

const photoUploadAnswerSchema = z
  .object({
    files: z.array(uploadedAnswerFileSchema).max(15),
    note: z.string().max(5000).optional(),
  })
  .strict();

const trueFalseGroupAnswerSchema = z.record(z.string().min(1).max(32), z.boolean().nullable());

export const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean(),
  z.number(),
  photoUploadAnswerSchema,
  trueFalseGroupAnswerSchema,
  z.null(),
]);

export const autosaveAnswersSchema = z.object({
  attemptVersion: z.number().int().min(0),
  attemptToken: z.string().max(128).optional(),
  answers: z.array(
    z.object({
      fieldId: z.string().min(1),
      value: answerValueSchema,
    })
  ),
});

export const submitSubmissionSchema = z.object({
  attemptVersion: z.number().int().min(0).optional(),
  attemptToken: z.string().max(128).optional(),
  answers: z
    .array(
      z.object({
        fieldId: z.string().min(1),
        value: answerValueSchema,
      })
    )
    .optional(),
});

export const rubricScoresSchema = z
  .record(z.string().min(1).max(64), z.number().min(0).max(1000))
  .optional()
  .nullable();

export const manualGradeSchema = z.object({
  teacherComment: z.string().trim().max(3000).optional().nullable(),
  flagged: z.boolean().optional(),
  grades: z.array(
    z.object({
      fieldId: z.string().min(1),
      score: z.number().min(0).max(1000),
      isCorrect: z.boolean().optional().nullable(),
      teacherNote: z.string().trim().max(1000).optional().nullable(),
      rubricScores: rubricScoresSchema,
    })
  ),
});

export const singleFieldGradeSchema = z.object({
  fieldId: z.string().min(1),
  score: z.number().min(0).max(1000),
  isCorrect: z.boolean().optional().nullable(),
  teacherNote: z.string().trim().max(1000).optional().nullable(),
  rubricScores: rubricScoresSchema,
});

// ===== Proctoring =====
export const proctorEventSchema = z.object({
  type: z.nativeEnum(ProctorEventType),
  durationMs: z.number().int().min(0).max(86400000).optional().nullable(),
  clientAt: z.string().optional(),
  attemptToken: z.string().max(128).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const proctorTeacherActionSchema = z.object({
  action: z.enum(["UNLOCK", "LOCK", "FORCE_SUBMIT", "REMIND", "FLAG", "UNFLAG"]),
  message: z.string().trim().max(500).optional(),
});

// ===== Parent =====
export const redeemParentInviteSchema = z.object({
  code: z.string().trim().toUpperCase().min(6).max(16),
  relation: z.string().trim().max(50).optional().default("Phụ huynh"),
});

// ===== Lesson =====
export const createLessonSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

/** Exact set of classes that should show a library lesson. */
export const lessonClassesSchema = z.object({
  classIds: z.array(z.string().trim().min(1).max(64)).max(500),
});

/** Library lessons to show in a class (from the class page). */
export const addLessonsToClassSchema = z.object({
  lessonIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
});

export const createLessonItemSchema = z.object({
  title: z.string().trim().min(2).max(200),
  type: z.nativeEnum(LessonItemType),
  url: z.string().trim().url("URL không hợp lệ").optional().nullable().or(z.literal("")),
  fileKey: z.string().trim().max(500).optional().nullable(),
  driveFileId: z.string().trim().max(200).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

// ===== Admin =====
export const adminUpdateUserSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  isLocked: z.boolean().optional(),
});

export const adminParentLinkSchema = z.object({
  parentId: z.string().min(1),
  studentId: z.string().min(1),
  relation: z.string().trim().max(50).optional().default("Phụ huynh"),
});

export const transferOwnershipSchema = z.object({
  toUserId: z.string().trim().min(1, "Vui lòng chọn giáo viên nhận."),
  transferAll: z.boolean().optional().default(false),
  classIds: z.array(z.string().trim().min(1)).max(500).optional().default([]),
  worksheetIds: z.array(z.string().trim().min(1)).max(500).optional().default([]),
});
