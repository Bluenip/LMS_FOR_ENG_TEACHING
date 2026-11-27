import { z } from "zod";
import {
  AttendanceStatus,
  CameraSensitivity,
  FieldPlacement,
  FieldType,
  LeaderboardMode,
  LessonItemType,
  ProctorEventType,
  ProctorMode,
  Role,
  ScoreScale,
  SessionStatus,
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
  enableGamification: z.boolean().optional(),
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

export const postAttachmentInputSchema = z.object({
  key: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(0).max(20 * 1024 * 1024),
});

export const postPollInputSchema = z.object({
  question: z.string().trim().min(1, "Câu hỏi bình chọn không được để trống").max(300),
  allowMultiple: z.boolean().optional().default(false),
  closesAt: z.string().datetime().optional().nullable().or(z.literal("")),
  options: z
    .array(z.string().trim().min(1, "Lựa chọn không được để trống").max(200))
    .min(2, "Cần ít nhất 2 lựa chọn")
    .max(8, "Tối đa 8 lựa chọn"),
});

export const createPostSchema = z.object({
  content: z.string().trim().min(1, "Nội dung không được để trống").max(5000),
  attachments: z.array(postAttachmentInputSchema).max(5).optional(),
  poll: postPollInputSchema.optional().nullable(),
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
  folderId: z.string().trim().min(1).max(64).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isPublic: z.boolean().optional(),
  publicLevel: z.string().trim().max(60).optional().nullable(),
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
    orderingScoring: z.enum(["LCS", "EXACT_POS"]).optional(),
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
    topicTag: z.string().trim().max(80).optional().nullable(),
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
    options: z
      .union([z.array(fieldOptionSchema), z.record(z.unknown())])
      .optional()
      .nullable(),
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
  variantCount: z.number().int().min(1).max(24).optional().default(1),
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

const matchAnswerSchema = z.record(z.string().min(1).max(64), z.string().max(64));

const dragDropAnswerSchema = z.record(
  z.string().min(1).max(64),
  z.array(z.string().min(1).max(64)).max(50)
);

const speakingAnswerSchema = z
  .object({
    text: z.string().max(10000),
    tries: z.number().int().min(0).max(500),
    audioKey: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

const voiceAnswerSchema = z
  .object({
    fileKey: z.string().trim().min(1).max(300),
    mimeType: z.string().trim().min(1).max(100),
    durationSec: z.number().min(0).max(3600).optional(),
  })
  .strict();

const wordsearchAnswerSchema = z
  .object({
    found: z
      .array(
        z.object({
          word: z.string().trim().min(1).max(64),
          cells: z.array(z.tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)])).max(40),
        })
      )
      .max(100),
  })
  .strict();

const drawAnswerSchema = z
  .object({
    fileKey: z.string().trim().min(1).max(300),
  })
  .strict();

const codeAnswerSchema = z
  .object({
    code: z.string().max(50000),
    lastOutput: z.string().max(20000).optional(),
  })
  .strict();

export const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.array(z.number().int().min(0).max(10000)),
  z.boolean(),
  z.number(),
  photoUploadAnswerSchema,
  speakingAnswerSchema,
  voiceAnswerSchema,
  wordsearchAnswerSchema,
  drawAnswerSchema,
  codeAnswerSchema,
  trueFalseGroupAnswerSchema,
  matchAnswerSchema,
  dragDropAnswerSchema,
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
  folderId: z.string().trim().min(1).max(64).optional().nullable(),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .optional(),
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

// ===== Phase 20: Workbooks, Return Revision, Co-teachers & Classroom Feed =====
export const createWorkbookSchema = z.object({
  title: z.string().trim().min(2, "Tên workbook tối thiểu 2 ký tự").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  worksheetIds: z.array(z.string().trim().min(1)).max(100).optional().default([]),
});

export const updateWorkbookSchema = z.object({
  title: z.string().trim().min(2, "Tên workbook tối thiểu 2 ký tự").max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  worksheetIds: z.array(z.string().trim().min(1)).max(100).optional(),
});

export const assignWorkbookSchema = z.object({
  classId: z.string().trim().min(1, "Vui lòng chọn lớp học"),
  titlePrefix: z.string().trim().max(120).optional().nullable(),
  sequentialUnlock: z.boolean().optional().default(false),
  dueAt: z.string().datetime().optional().nullable().or(z.literal("")),
  timeLimitMin: z.number().int().min(1).max(600).optional().nullable(),
  maxAttempts: z.number().int().min(1).max(50).nullable().optional().default(1),
  showResult: z.nativeEnum(ShowResultMode).optional().default("AFTER_SUBMIT"),
  showAnswerKey: z.boolean().optional().default(false),
  scoreScale: z.nativeEnum(ScoreScale).optional().default("SCALE_10"),
});

export const returnSubmissionSchema = z.object({
  teacherComment: z.string().trim().max(3000).optional().nullable(),
});

export const manageClassTeacherSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  role: z.enum(["CO_TEACHER", "ASSISTANT"]).default("CO_TEACHER"),
});

export const updateClassTeacherRoleSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(["CO_TEACHER", "ASSISTANT"]),
});

export const cloneClassSchema = z.object({
  name: z.string().trim().min(2, "Tên lớp mới tối thiểu 2 ký tự").max(120),
});

export const updatePostModerationSchema = z.object({
  pinned: z.boolean().optional(),
  commentsLocked: z.boolean().optional(),
});

export const votePostPollSchema = z.object({
  optionIds: z.array(z.string().trim().min(1)).max(8),
});

export const togglePostReactionSchema = z.object({
  emoji: z.enum(["👍", "❤️", "🎉", "💡", "👏", "😮"]),
});

// ===== Phase 21: Quick Textbook Assignments & Offline Gradebook =====
export const quickAttachmentSchema = z.object({
  key: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
});

export const quickTextbookAssignmentSchema = z.object({
  title: z.string().trim().min(2, "Tên bài giao tối thiểu 2 ký tự").max(200),
  classIds: z.array(z.string().trim().min(1)).min(1, "Vui lòng chọn ít nhất 1 lớp"),
  promptText: z.string().trim().min(1, "Vui lòng nhập yêu cầu bài tập SGK").max(5000),
  openAt: z.string().datetime().optional().nullable().or(z.literal("")),
  dueAt: z.string().datetime().optional().nullable().or(z.literal("")),
  maxScore: z.number().min(0.5).max(1000).optional().default(10),
  weight: z.number().min(0.1).max(100).optional().default(1),
  maxAttempts: z.number().int().min(1).max(50).nullable().optional().default(2),
  allowLate: z.boolean().optional().default(true),
  scoreScale: z.nativeEnum(ScoreScale).optional().default("SCALE_10"),
  subject: z.nativeEnum(WorksheetSubject).optional().default("GENERAL"),
  attachmentKeys: z.array(quickAttachmentSchema).max(10).optional().default([]),
});

export const createOfflineGradeColumnSchema = z.object({
  title: z.string().trim().min(1, "Tên cột điểm không được để trống").max(120),
  date: z.string().trim().max(64).optional().nullable(),
  maxScore: z.number().min(0.5).max(1000).optional().default(10),
  weight: z.number().min(0.1).max(100).optional().default(1),
  note: z.string().trim().max(500).optional().nullable(),
});

export const updateOfflineGradeColumnSchema = createOfflineGradeColumnSchema.partial();

export const saveOfflineGradeEntriesSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string().trim().min(1),
        score: z.number().min(0).max(1000).nullable(),
        note: z.string().trim().max(300).optional().nullable(),
      })
    )
    .min(1)
    .max(500),
});

// ===== Phase 22: Question Bank, Matrix Generator, Variants & Multi-class Exams =====
export const createQuestionBankItemSchema = z.object({
  subject: z.nativeEnum(WorksheetSubject).default("GENERAL"),
  type: z.nativeEnum(FieldType),
  prompt: z.string().trim().min(1, "Vui lòng nhập nội dung câu hỏi.").max(5000),
  options: z
    .union([z.array(fieldOptionSchema), z.record(z.unknown())])
    .optional()
    .nullable(),
  answerKey: z.record(z.unknown()),
  explanation: z.string().trim().max(3000).optional().nullable(),
  rubric: z.array(rubricCriterionSchema).max(20).optional().nullable(),
  skillTag: z.nativeEnum(SkillTag).optional().nullable(),
  topicTag: z.string().trim().max(80).optional().nullable(),
  level: z.string().trim().max(60).optional().nullable(),
  difficulty: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  audioKey: z.string().trim().max(300).optional().nullable(),
  imageKey: z.string().trim().max(300).optional().nullable(),
  isShared: z.boolean().optional().default(false),
});

export const updateQuestionBankItemSchema = createQuestionBankItemSchema.partial();

export const saveFieldToBankSchema = z.object({
  fieldId: z.string().trim().min(1),
  difficulty: z.number().int().min(1).max(5).optional(),
  level: z.string().trim().max(60).optional().nullable(),
  topicTag: z.string().trim().max(80).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isShared: z.boolean().optional(),
});

export const matrixRowSchema = z.object({
  subject: z.nativeEnum(WorksheetSubject).optional(),
  type: z.nativeEnum(FieldType).optional(),
  topicTag: z.string().trim().max(80).optional(),
  skillTag: z.nativeEnum(SkillTag).optional(),
  level: z.string().trim().max(60).optional(),
  difficultyMin: z.number().int().min(1).max(5).optional(),
  difficultyMax: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  count: z.number().int().min(1).max(100),
  points: z.number().min(0.25).max(100).optional(),
});

export const generateWorksheetFromMatrixSchema = z.object({
  title: z.string().trim().min(2, "Tiêu đề tối thiểu 2 ký tự").max(200),
  subject: z.nativeEnum(WorksheetSubject).default("GENERAL"),
  instructions: z.string().trim().max(3000).optional().nullable(),
  includeShared: z.boolean().optional().default(true),
  preview: z.boolean().optional().default(false),
  rows: z.array(matrixRowSchema).min(1).max(30),
});

export const createExamSessionSchema = z.object({
  title: z.string().trim().min(2, "Tên kỳ thi tối thiểu 2 ký tự").max(200),
  worksheetId: z.string().trim().min(1),
  classIds: z.array(z.string().trim().min(1)).min(1, "Vui lòng chọn ít nhất 1 lớp"),
  openAt: z.string().datetime().optional().nullable().or(z.literal("")),
  dueAt: z.string().datetime().optional().nullable().or(z.literal("")),
  timeLimitMin: z.number().int().min(1).max(600).optional().nullable(),
  maxAttempts: z.number().int().min(1).max(20).nullable().optional().default(1),
  variantCount: z.number().int().min(1).max(24).optional().default(4),
  showResult: z.nativeEnum(ShowResultMode).optional().default("AFTER_DUE"),
  showAnswerKey: z.boolean().optional().default(false),
  allowLate: z.boolean().optional().default(false),
  proctorMode: z.nativeEnum(ProctorMode).optional().default("MONITOR"),
  violationAction: z.nativeEnum(ViolationAction).optional().default("WARN"),
  maxViolations: z.number().int().min(1).max(20).optional().default(3),
  requireFullscreen: z.boolean().optional().default(false),
  blockCopyPaste: z.boolean().optional().default(true),
  requireCamera: z.boolean().optional().default(false),
  cameraEnforce: z.boolean().optional().default(false),
  cameraSnapshots: z.boolean().optional().default(true),
  requireMicMonitor: z.boolean().optional().default(false),
  scoreScale: z.nativeEnum(ScoreScale).optional().default("SCALE_10"),
  weight: z.number().min(0.5).max(10).optional().default(2),
});

// ===== Phase 23: Class Schedule, Sessions & Attendance =====
const hhmmSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải theo định dạng HH:MM");

const safeMeetingUrlSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), {
    message: "Link phòng học phải bắt đầu bằng http:// hoặc https://",
  });

export const createScheduleRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    title: z.string().trim().max(150).optional().nullable(),
    meetingUrl: safeMeetingUrlSchema,
    effectiveFrom: z.string().datetime().optional().nullable().or(z.literal("")),
    effectiveTo: z.string().datetime().optional().nullable().or(z.literal("")),
    generateWeeks: z.number().int().min(1).max(26).optional().default(12),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "Giờ kết thúc phải sau giờ bắt đầu.",
    path: ["endTime"],
  });

export const createMakeupSessionSchema = z
  .object({
    title: z.string().trim().min(2, "Tên buổi học tối thiểu 2 ký tự").max(200),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    isMakeup: z.boolean().optional().default(true),
    meetingUrl: safeMeetingUrlSchema,
    notes: z.string().trim().max(3000).optional().nullable(),
    lessonIds: z.array(z.string().trim().min(1)).max(50).optional().default([]),
    assignmentIds: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "Thời gian kết thúc phải sau thời gian bắt đầu.",
    path: ["endsAt"],
  });

export const updateClassSessionSchema = z.object({
  title: z.string().trim().min(2, "Tên buổi học tối thiểu 2 ký tự").max(200).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  meetingUrl: safeMeetingUrlSchema,
  notes: z.string().trim().max(3000).optional().nullable(),
  lessonIds: z.array(z.string().trim().min(1)).max(50).optional(),
  assignmentIds: z.array(z.string().trim().min(1)).max(50).optional(),
});

export const saveAttendanceSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().trim().min(1),
        status: z.nativeEnum(AttendanceStatus),
        note: z.string().trim().max(400).optional().nullable(),
      })
    )
    .min(1, "Danh sách điểm danh không được trống.")
    .max(500),
});

// ===== Phase 24: Flashcards SRS, Parent Messaging & Multi-channel Notifications =====
export const createFlashcardInputSchema = z.object({
  front: z.string().trim().min(1, "Mặt trước thẻ không được để trống").max(500),
  back: z.string().trim().min(1, "Mặt sau thẻ không được để trống").max(1000),
  phonetic: z.string().trim().max(120).optional().nullable(),
  example: z.string().trim().max(600).optional().nullable(),
});

export const createFlashcardDeckSchema = z.object({
  title: z.string().trim().min(2, "Tên bộ thẻ tối thiểu 2 ký tự").max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  classId: z.string().trim().min(1).optional().nullable(),
  cards: z.array(createFlashcardInputSchema).min(1, "Bộ thẻ cần ít nhất 1 thẻ").max(300),
});

export const extractFlashcardsSchema = z.object({
  worksheetId: z.string().trim().min(1),
  classId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(2).max(200).optional(),
});

export const submitFlashcardReviewSchema = z.object({
  flashcardId: z.string().trim().min(1),
  quality: z.union([z.literal(0), z.literal(3), z.literal(4), z.literal(5)]),
});

export const openParentThreadSchema = z.object({
  classId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
  parentId: z.string().trim().min(1).optional(),
});

export const sendParentMessageSchema = z.object({
  content: z.string().trim().min(1, "Nội dung tin nhắn không được để trống").max(2000),
});

export const updateNotificationPreferenceSchema = z.object({
  emailEnabled: z.boolean().optional(),
  emailAssignmentNew: z.boolean().optional(),
  emailDueReminder: z.boolean().optional(),
  emailWeeklyReport: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().url().max(1000),
  keys: z.object({
    p256dh: z.string().trim().min(10).max(500),
    auth: z.string().trim().min(6).max(300),
  }),
});

// ===== Phase 25: Folders, Worksheet Versions, Discover, AI Generator & Public Practice =====
export const createFolderSchema = z.object({
  kind: z.enum(["WORKSHEET", "LESSON"]).default("WORKSHEET"),
  name: z.string().trim().min(1, "Tên thư mục không được để trống").max(100),
  parentId: z.string().trim().min(1).optional().nullable(),
  color: z.string().trim().max(32).optional().nullable(),
});

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().trim().min(1).optional().nullable(),
  color: z.string().trim().max(32).optional().nullable(),
});

export const createWorksheetVersionSchema = z.object({
  note: z.string().trim().max(300).optional().nullable(),
});

export const reportWorksheetSchema = z.object({
  reason: z.string().trim().min(5, "Vui lòng mô tả lý do báo cáo (tối thiểu 5 ký tự)").max(1000),
});

export const moderateReportSchema = z.object({
  reportId: z.string().trim().min(1),
  action: z.enum(["HIDE", "DISMISS", "RESTORE"]),
});

export const aiGenerateQuestionsSchema = z.object({
  sourceText: z.string().trim().min(10, "Vui lòng nhập nội dung nguồn (tối thiểu 10 ký tự)").max(12000),
  subject: z.nativeEnum(WorksheetSubject).default("ENGLISH"),
  count: z.number().int().min(1).max(15).default(5),
  types: z
    .array(z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE_GROUP", "TEXT", "WORDSEARCH", "ESSAY"]))
    .min(1)
    .max(5)
    .default(["MULTIPLE_CHOICE"]),
  level: z.string().trim().max(60).optional().nullable(),
});

export const togglePublicPracticeSchema = z.object({
  enabled: z.boolean(),
});

export const submitPublicPracticeSchema = z.object({
  guestName: z.string().trim().min(1, "Vui lòng nhập họ tên để làm bài").max(120),
  answers: z.array(
    z.object({
      fieldId: z.string().trim().min(1),
      value: z.unknown(),
    })
  ),
});

// ===== Phase 26: Password Reset & Security Scaling =====
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ."),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, "Liên kết đặt lại mật khẩu không hợp lệ."),
  newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự").max(200),
});

// ===== Phase 27: Live Quiz, Exit Ticket & Behavior Points =====
export const createLiveQuizSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("WORKSHEET"),
    worksheetId: z.string().trim().min(1),
    classId: z.string().trim().min(1).optional().nullable(),
    mode: z.enum(["HOST_PACED", "SELF_PACED"]).default("HOST_PACED"),
    questionLimitSec: z.number().int().min(5).max(300).default(30),
    title: z.string().trim().max(200).optional().nullable(),
  }),
  z.object({
    kind: z.literal("EXIT_TICKET"),
    classId: z.string().trim().min(1).optional().nullable(),
    title: z.string().trim().min(1, "Vui lòng nhập tiêu đề").max(200),
    type: z.enum(["MULTIPLE_CHOICE", "TEXT"]),
    prompt: z.string().trim().min(1, "Vui lòng nhập câu hỏi").max(2000),
    options: z.array(z.string().trim().max(300)).max(6).optional(),
    correctIndex: z.number().int().min(0).max(5).optional().nullable(),
    acceptedAnswers: z.array(z.string().trim().max(300)).max(20).optional(),
    questionLimitSec: z.number().int().min(5).max(300).default(60),
  }),
]);

export const liveQuizControlSchema = z.object({
  action: z.enum(["OPEN", "CLOSE", "NEXT", "FINISH"]),
});

export const joinLiveQuizSchema = z.object({
  pin: z.string().trim().regex(/^\d{6}$/, "Mã PIN gồm 6 chữ số."),
  displayName: z.string().trim().max(40).optional().nullable(),
});

export const liveQuizAnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(200),
  answer: z.unknown(),
});

export const liveQuizExportGradeSchema = z.object({
  columnTitle: z.string().trim().max(120).optional().nullable(),
  maxScore: z.number().positive().max(1000).default(10),
});

export const behaviorPresetSchema = z.object({
  label: z.string().trim().min(1, "Vui lòng nhập tên mẫu").max(60),
  delta: z
    .number()
    .int()
    .min(-10)
    .max(10)
    .refine((v) => v !== 0, "Số điểm cộng/trừ không hợp lệ."),
  icon: z.string().trim().max(8).optional().nullable(),
});

export const awardBehaviorPointsSchema = z.object({
  studentIds: z.array(z.string().trim().min(1)).min(1).max(200),
  delta: z.number().int().min(-10).max(10).optional(),
  reason: z.string().trim().max(200).optional(),
  sessionId: z.string().trim().min(1).optional().nullable(),
  presetId: z.string().trim().min(1).optional().nullable(),
});
