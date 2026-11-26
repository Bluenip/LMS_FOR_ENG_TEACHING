import type { FieldType, WorksheetSubject } from "@prisma/client";

export const WORKSHEET_SUBJECTS = [
  "ENGLISH",
  "MATH",
  "PHYSICS",
  "CHEMISTRY",
  "BIOLOGY",
  "LITERATURE",
  "HISTORY",
  "GEOGRAPHY",
  "CIVICS",
  "INFORMATICS",
  "GENERAL",
] as const satisfies readonly WorksheetSubject[];

export type SubjectProfileKey =
  | "LANGUAGE"
  | "STEM"
  | "LITERATURE"
  | "SOCIAL"
  | "INFORMATICS"
  | "GENERAL";

export interface SubjectMeta {
  id: WorksheetSubject;
  profile: SubjectProfileKey;
  labelVi: string;
  labelEn: string;
  shortVi: string;
  shortEn: string;
  descriptionVi: string;
  descriptionEn: string;
  badgeClass: string;
}

export interface SubjectProfileConfig {
  key: SubjectProfileKey;
  showAudio: boolean;
  showDictation: boolean;
  showEnglishSkills: boolean;
  showPassages: boolean;
  showMathHint: boolean;
  showDictationPreset: boolean;
  defaultQuickType: FieldType;
  primaryTools: FieldType[];
  allAvailableTools: FieldType[];
}

export const SUBJECT_METADATA: Record<WorksheetSubject, SubjectMeta> = {
  ENGLISH: {
    id: "ENGLISH",
    profile: "LANGUAGE",
    labelVi: "Tiếng Anh / Ngoại ngữ",
    labelEn: "English / Foreign Language",
    shortVi: "Tiếng Anh",
    shortEn: "English",
    descriptionVi: "File nghe MP3, chép chính tả, điền từ, đoạn đọc & gắn 6 kỹ năng",
    descriptionEn: "Audio tracks, dictation, gap-fill, reading passages & 6 skill tags",
    badgeClass: "bg-[#EEF2FF] text-[#3525CD]",
  },
  MATH: {
    id: "MATH",
    profile: "STEM",
    labelVi: "Toán học",
    labelEn: "Mathematics",
    shortVi: "Toán",
    shortEn: "Math",
    descriptionVi: "Công thức LaTeX, trắc nghiệm, Đúng/Sai 4 ý THPT 2025, điền số & nộp ảnh vở",
    descriptionEn: "LaTeX formulas, MCQ, 4-part True/False (THPT 2025), numeric & notebook photo",
    badgeClass: "bg-[#E0F2FE] text-[#0369A1]",
  },
  PHYSICS: {
    id: "PHYSICS",
    profile: "STEM",
    labelVi: "Vật lý",
    labelEn: "Physics",
    shortVi: "Vật lý",
    shortEn: "Physics",
    descriptionVi: "Công thức LaTeX, trắc nghiệm, Đúng/Sai 4 ý, điền số (±sai số) & chụp bài giải",
    descriptionEn: "LaTeX formulas, MCQ, 4-part True/False, numeric (±tolerance) & solution photo",
    badgeClass: "bg-[#E0F2FE] text-[#0369A1]",
  },
  CHEMISTRY: {
    id: "CHEMISTRY",
    profile: "STEM",
    labelVi: "Hoá học",
    labelEn: "Chemistry",
    shortVi: "Hoá học",
    shortEn: "Chemistry",
    descriptionVi: "Phương trình LaTeX, trắc nghiệm, Đúng/Sai 4 ý, tính số mol/khối lượng & nộp ảnh",
    descriptionEn: "Chemical formulas, MCQ, 4-part True/False, numeric & photo upload",
    badgeClass: "bg-[#DCFCE7] text-[#15803D]",
  },
  BIOLOGY: {
    id: "BIOLOGY",
    profile: "STEM",
    labelVi: "Sinh học",
    labelEn: "Biology",
    shortVi: "Sinh học",
    shortEn: "Biology",
    descriptionVi: "Trắc nghiệm, Đúng/Sai 4 ý, điền số, tự luận ngắn & nộp ảnh sơ đồ",
    descriptionEn: "MCQ, 4-part True/False, numeric, short answer & diagram upload",
    badgeClass: "bg-[#DCFCE7] text-[#15803D]",
  },
  LITERATURE: {
    id: "LITERATURE",
    profile: "LITERATURE",
    labelVi: "Ngữ văn",
    labelEn: "Literature",
    shortVi: "Ngữ văn",
    shortEn: "Literature",
    descriptionVi: "Ngữ liệu đọc hiểu dùng chung, viết đoạn / bài tự luận & chụp ảnh bài viết tay",
    descriptionEn: "Shared reading passages, essay writing & handwritten essay photo upload",
    badgeClass: "bg-[#FFEDD5] text-[#EA580C]",
  },
  HISTORY: {
    id: "HISTORY",
    profile: "SOCIAL",
    labelVi: "Lịch sử",
    labelEn: "History",
    shortVi: "Lịch sử",
    shortEn: "History",
    descriptionVi: "Trắc nghiệm, Đúng/Sai 4 ý theo nguồn tư liệu, đoạn ngữ liệu & tự luận",
    descriptionEn: "MCQ, 4-part True/False, source passages & essay",
    badgeClass: "bg-amber-50 text-amber-800",
  },
  GEOGRAPHY: {
    id: "GEOGRAPHY",
    profile: "SOCIAL",
    labelVi: "Địa lý",
    labelEn: "Geography",
    shortVi: "Địa lý",
    shortEn: "Geography",
    descriptionVi: "Trắc nghiệm, Đúng/Sai 4 ý, điền số số liệu / biểu đồ & tự luận",
    descriptionEn: "MCQ, 4-part True/False, numeric data/chart & essay",
    badgeClass: "bg-amber-50 text-amber-800",
  },
  CIVICS: {
    id: "CIVICS",
    profile: "SOCIAL",
    labelVi: "GDCD / GDKT&PL",
    labelEn: "Civics & Economics",
    shortVi: "GDCD / KTPL",
    shortEn: "Civics",
    descriptionVi: "Tình huống ngữ liệu, trắc nghiệm, Đúng/Sai 4 ý & phân tích tự luận",
    descriptionEn: "Case passages, MCQ, 4-part True/False & essay analysis",
    badgeClass: "bg-[#EDE9FE] text-[#6D28D9]",
  },
  INFORMATICS: {
    id: "INFORMATICS",
    profile: "INFORMATICS",
    labelVi: "Tin học",
    labelEn: "Informatics / CS",
    shortVi: "Tin học",
    shortEn: "Informatics",
    descriptionVi: "Trắc nghiệm, Đúng/Sai 4 ý, điền kết quả chạy lệnh, LaTeX & nộp ảnh bài làm",
    descriptionEn: "MCQ, 4-part True/False, output short answer, LaTeX & photo upload",
    badgeClass: "bg-[#EDE9FE] text-[#6D28D9]",
  },
  GENERAL: {
    id: "GENERAL",
    profile: "GENERAL",
    labelVi: "Môn khác / Tổng hợp",
    labelEn: "Other / General",
    shortVi: "Tổng hợp",
    shortEn: "General",
    descriptionVi: "Đầy đủ toàn bộ công cụ (PDF, audio, LaTeX, trắc nghiệm, Đúng/Sai 4 ý, nộp ảnh)",
    descriptionEn: "All tools enabled (PDF, audio, LaTeX, MCQ, 4-part T/F, photo upload)",
    badgeClass: "bg-slate-100 text-slate-600",
  },
};

const ALL_TOOLS: FieldType[] = [
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_GROUP",
  "TEXT",
  "NUMBER",
  "TRUE_FALSE",
  "DROPDOWN",
  "MULTI_SELECT",
  "CHECKBOX",
  "ESSAY",
  "PHOTO_UPLOAD",
  "DICTATION",
  "MATCH",
  "DRAG_DROP",
  "SPEAKING",
  "VOICE_ANSWER",
  "HIGHLIGHT",
  "ORDERING",
  "WORDSEARCH",
  "DRAW",
  "CODE",
];

const NON_LANGUAGE_TOOLS: FieldType[] = ALL_TOOLS.filter(
  (t) => t !== "DICTATION" && t !== "SPEAKING"
);

export const SUBJECT_PROFILES: Record<SubjectProfileKey, SubjectProfileConfig> = {
  LANGUAGE: {
    key: "LANGUAGE",
    showAudio: true,
    showDictation: true,
    showEnglishSkills: true,
    showPassages: true,
    showMathHint: false,
    showDictationPreset: true,
    defaultQuickType: "TEXT",
    primaryTools: [
      "MULTIPLE_CHOICE",
      "TEXT",
      "DROPDOWN",
      "TRUE_FALSE",
      "DICTATION",
      "ESSAY",
    ],
    allAvailableTools: ALL_TOOLS.filter((t) => t !== "CODE" && t !== "DRAW"),
  },
  STEM: {
    key: "STEM",
    showAudio: false,
    showDictation: false,
    showEnglishSkills: false,
    showPassages: false,
    showMathHint: true,
    showDictationPreset: false,
    defaultQuickType: "MULTIPLE_CHOICE",
    primaryTools: [
      "MULTIPLE_CHOICE",
      "TRUE_FALSE_GROUP",
      "NUMBER",
      "TEXT",
      "PHOTO_UPLOAD",
      "DRAW",
      "ESSAY",
    ],
    allAvailableTools: NON_LANGUAGE_TOOLS.filter((t) => t !== "CODE"),
  },
  LITERATURE: {
    key: "LITERATURE",
    showAudio: false,
    showDictation: false,
    showEnglishSkills: false,
    showPassages: true,
    showMathHint: false,
    showDictationPreset: false,
    defaultQuickType: "ESSAY",
    primaryTools: [
      "ESSAY",
      "HIGHLIGHT",
      "ORDERING",
      "PHOTO_UPLOAD",
      "TEXT",
      "MULTIPLE_CHOICE",
      "TRUE_FALSE",
    ],
    allAvailableTools: NON_LANGUAGE_TOOLS.filter((t) => t !== "CODE"),
  },
  SOCIAL: {
    key: "SOCIAL",
    showAudio: false,
    showDictation: false,
    showEnglishSkills: false,
    showPassages: true,
    showMathHint: false,
    showDictationPreset: false,
    defaultQuickType: "MULTIPLE_CHOICE",
    primaryTools: [
      "MULTIPLE_CHOICE",
      "TRUE_FALSE_GROUP",
      "TRUE_FALSE",
      "MATCH",
      "ORDERING",
      "TEXT",
      "ESSAY",
      "PHOTO_UPLOAD",
    ],
    allAvailableTools: NON_LANGUAGE_TOOLS.filter((t) => t !== "CODE"),
  },
  INFORMATICS: {
    key: "INFORMATICS",
    showAudio: false,
    showDictation: false,
    showEnglishSkills: false,
    showPassages: false,
    showMathHint: true,
    showDictationPreset: false,
    defaultQuickType: "MULTIPLE_CHOICE",
    primaryTools: [
      "MULTIPLE_CHOICE",
      "TRUE_FALSE_GROUP",
      "CODE",
      "ORDERING",
      "MATCH",
      "TEXT",
      "NUMBER",
      "ESSAY",
      "PHOTO_UPLOAD",
    ],
    allAvailableTools: NON_LANGUAGE_TOOLS,
  },
  GENERAL: {
    key: "GENERAL",
    showAudio: true,
    showDictation: true,
    showEnglishSkills: true,
    showPassages: true,
    showMathHint: true,
    showDictationPreset: true,
    defaultQuickType: "MULTIPLE_CHOICE",
    primaryTools: ALL_TOOLS,
    allAvailableTools: ALL_TOOLS,
  },
};

export function isValidSubject(value: unknown): value is WorksheetSubject {
  return typeof value === "string" && (WORKSHEET_SUBJECTS as readonly string[]).includes(value);
}

export function normalizeSubject(value: unknown): WorksheetSubject {
  return isValidSubject(value) ? value : "GENERAL";
}

export function getSubjectMeta(subject?: WorksheetSubject | string | null): SubjectMeta {
  return SUBJECT_METADATA[normalizeSubject(subject)];
}

export function getSubjectProfile(subject?: WorksheetSubject | string | null): SubjectProfileConfig {
  const meta = getSubjectMeta(subject);
  return SUBJECT_PROFILES[meta.profile];
}
