import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export interface LeaderboardEntryDTO {
  rank: number;
  studentId: string;
  displayName: string;
  isCurrentUser: boolean;
  score: number;
  maxScore: number;
  scoreScale10: number;
  durationMs: number;
  submittedAt: string | null;
  correctCount: number;
  totalQuestions: number;
  trend: number | null;
}

export interface AssignmentLeaderboardResponse {
  mode: "ASSIGNMENT";
  assignmentId: string;
  assignmentTitle: string;
  classId: string;
  className: string;
  visible: boolean;
  hiddenReason?: string;
  anonymized: boolean;
  scoreRule: "BEST" | "LAST";
  totalStudentsInClass: number;
  entries: LeaderboardEntryDTO[];
  currentUserEntry: LeaderboardEntryDTO | null;
}

export interface ClassLeaderboardResponse {
  mode: "CLASS";
  visible?: boolean;
  hiddenReason?: string;
  anonymized?: boolean;
  classId: string;
  className: string;
  includeMissingAsZero: boolean;
  assignmentCount: number;
  totalStudentsInClass: number;
  entries: LeaderboardEntryDTO[];
  currentUserEntry: LeaderboardEntryDTO | null;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds per PLAN.md 6A
const globalCache = globalThis as unknown as {
  __engclassLeaderboardCache?: Map<string, CacheEntry<unknown>>;
};

function getCache(): Map<string, CacheEntry<unknown>> {
  if (!globalCache.__engclassLeaderboardCache) {
    globalCache.__engclassLeaderboardCache = new Map();
  }
  return globalCache.__engclassLeaderboardCache;
}

export function invalidateLeaderboardCache(classId?: string): void {
  const cache = getCache();
  if (!classId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(classId)) {
      cache.delete(key);
    }
  }
}

interface RawAssignmentRankRow {
  studentId: string;
  studentName: string;
  totalScore: number;
  maxScore: number;
  durationMs: number;
  submittedAt: Date;
  correctCount: bigint;
  totalQuestions: bigint;
  rank: bigint;
}

interface RawClassRankRow {
  studentId: string;
  studentName: string;
  avgScale10: number;
  completedCount: bigint;
  totalDurationMs: number;
  rank: bigint;
}

async function queryAssignmentRawRanks(
  assignmentId: string,
  scoreRule: "BEST" | "LAST"
): Promise<RawAssignmentRankRow[]> {
  if (scoreRule === "LAST") {
    return prisma.$queryRaw<RawAssignmentRankRow[]>(Prisma.sql`
      WITH chosen AS (
        SELECT DISTINCT ON (s."studentId")
          s."id" AS "submissionId",
          s."studentId",
          COALESCE(s."totalScore", s."autoScore", 0)::double precision AS "totalScore",
          s."maxScore"::double precision AS "maxScore",
          GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s."submittedAt", NOW()) - s."startedAt")) * 1000)::double precision AS "durationMs",
          COALESCE(s."submittedAt", NOW()) AS "submittedAt"
        FROM "Submission" s
        WHERE s."assignmentId" = ${assignmentId}
          AND s."status" IN ('SUBMITTED', 'GRADED')
          AND s."flagged" = false
          AND EXISTS (
            SELECT 1 FROM "Enrollment" e
            INNER JOIN "Assignment" a2 ON a2."classId" = e."classId"
            WHERE a2."id" = ${assignmentId} AND e."studentId" = s."studentId" AND e."status" = 'ACTIVE'
          )
        ORDER BY s."studentId", s."attemptNo" DESC
      ),
      counts AS (
        SELECT
          a."submissionId",
          COUNT(*) FILTER (WHERE a."isCorrect" = true) AS "correctCount"
        FROM "Answer" a
        GROUP BY a."submissionId"
      ),
      field_total AS (
        SELECT COUNT(*) AS "totalQuestions"
        FROM "Field" f
        INNER JOIN "Assignment" asg ON asg."worksheetId" = f."worksheetId"
        WHERE asg."id" = ${assignmentId}
      )
      SELECT
        c."studentId",
        u."name" AS "studentName",
        c."totalScore",
        c."maxScore",
        c."durationMs",
        c."submittedAt",
        COALESCE(cnt."correctCount", 0) AS "correctCount",
        ft."totalQuestions",
        RANK() OVER (
          ORDER BY c."totalScore" DESC, c."durationMs" ASC, c."submittedAt" ASC
        ) AS "rank"
      FROM chosen c
      INNER JOIN "User" u ON u."id" = c."studentId"
      LEFT JOIN counts cnt ON cnt."submissionId" = c."submissionId"
      CROSS JOIN field_total ft
      ORDER BY "rank" ASC, u."name" ASC
    `);
  }

  // Default: BEST score attempt per student (highest totalScore, then shortest duration, then earliest submittedAt)
  return prisma.$queryRaw<RawAssignmentRankRow[]>(Prisma.sql`
    WITH chosen AS (
      SELECT DISTINCT ON (s."studentId")
        s."id" AS "submissionId",
        s."studentId",
        COALESCE(s."totalScore", s."autoScore", 0)::double precision AS "totalScore",
        s."maxScore"::double precision AS "maxScore",
        GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s."submittedAt", NOW()) - s."startedAt")) * 1000)::double precision AS "durationMs",
        COALESCE(s."submittedAt", NOW()) AS "submittedAt"
      FROM "Submission" s
      WHERE s."assignmentId" = ${assignmentId}
        AND s."status" IN ('SUBMITTED', 'GRADED')
        AND s."flagged" = false
        AND EXISTS (
          SELECT 1 FROM "Enrollment" e
          INNER JOIN "Assignment" a2 ON a2."classId" = e."classId"
          WHERE a2."id" = ${assignmentId} AND e."studentId" = s."studentId" AND e."status" = 'ACTIVE'
        )
      ORDER BY
        s."studentId",
        COALESCE(s."totalScore", s."autoScore", 0) DESC,
        GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s."submittedAt", NOW()) - s."startedAt")) * 1000) ASC,
        s."submittedAt" ASC
    ),
    counts AS (
      SELECT
        a."submissionId",
        COUNT(*) FILTER (WHERE a."isCorrect" = true) AS "correctCount"
      FROM "Answer" a
      GROUP BY a."submissionId"
    ),
    field_total AS (
      SELECT COUNT(*) AS "totalQuestions"
      FROM "Field" f
      INNER JOIN "Assignment" asg ON asg."worksheetId" = f."worksheetId"
      WHERE asg."id" = ${assignmentId}
    )
    SELECT
      c."studentId",
      u."name" AS "studentName",
      c."totalScore",
      c."maxScore",
      c."durationMs",
      c."submittedAt",
      COALESCE(cnt."correctCount", 0) AS "correctCount",
      ft."totalQuestions",
      RANK() OVER (
        ORDER BY c."totalScore" DESC, c."durationMs" ASC, c."submittedAt" ASC
      ) AS "rank"
    FROM chosen c
    INNER JOIN "User" u ON u."id" = c."studentId"
    LEFT JOIN counts cnt ON cnt."submissionId" = c."submissionId"
    CROSS JOIN field_total ft
    ORDER BY "rank" ASC, u."name" ASC
  `);
}

export async function getAssignmentLeaderboard(params: {
  assignmentId: string;
  viewerId: string;
  isTeacher: boolean;
  scoreRuleOverride?: "BEST" | "LAST";
}): Promise<AssignmentLeaderboardResponse> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  }

  const scoreRule: "BEST" | "LAST" =
    params.scoreRuleOverride ??
    (assignment.leaderboardScoreRule === "LAST" ? "LAST" : "BEST");

  // Enforce showLeaderboard server-side for students!
  if (!params.isTeacher) {
    if (assignment.showLeaderboard === "OFF") {
      return {
        mode: "ASSIGNMENT",
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        classId: assignment.class.id,
        className: assignment.class.name,
        visible: false,
        hiddenReason: "Giáo viên đã tắt bảng xếp hạng cho bài tập này.",
        anonymized: assignment.leaderboardAnon,
        scoreRule,
        totalStudentsInClass: assignment.class._count.enrollments,
        entries: [],
        currentUserEntry: null,
      };
    }
    if (assignment.showLeaderboard === "AFTER_DUE") {
      if (!assignment.dueAt || new Date() < assignment.dueAt) {
        return {
          mode: "ASSIGNMENT",
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          classId: assignment.class.id,
          className: assignment.class.name,
          visible: false,
          hiddenReason: "Bảng xếp hạng sẽ hiển thị sau khi hết hạn nộp bài.",
          anonymized: assignment.leaderboardAnon,
          scoreRule,
          totalStudentsInClass: assignment.class._count.enrollments,
          entries: [],
          currentUserEntry: null,
        };
      }
    }
    if (assignment.showLeaderboard === "AFTER_SUBMIT") {
      const hasSubmitted = await prisma.submission.findFirst({
        where: {
          assignmentId: assignment.id,
          studentId: params.viewerId,
          status: { in: ["SUBMITTED", "GRADED"] },
        },
        select: { id: true },
      });
      if (!hasSubmitted) {
        return {
          mode: "ASSIGNMENT",
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          classId: assignment.class.id,
          className: assignment.class.name,
          visible: false,
          hiddenReason: "Hãy nộp bài trước để xem bảng xếp hạng.",
          anonymized: assignment.leaderboardAnon,
          scoreRule,
          totalStudentsInClass: assignment.class._count.enrollments,
          entries: [],
          currentUserEntry: null,
        };
      }
    }
  }

  // Fetch cached raw SQL rows (keyed by classId + assignmentId + scoreRule)
  const cacheKey = `asg:${assignment.classId}:${assignment.id}:${scoreRule}`;
  const cache = getCache();
  const now = Date.now();
  let rows: RawAssignmentRankRow[];
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    rows = cached.value as RawAssignmentRankRow[];
  } else {
    rows = await queryAssignmentRawRanks(assignment.id, scoreRule);
    cache.set(cacheKey, { value: rows, expiresAt: now + CACHE_TTL_MS });
  }

  // Previous assignment in same class for rank trend ↑↓
  const prevAssignment = await prisma.assignment.findFirst({
    where: {
      classId: assignment.classId,
      createdAt: { lt: assignment.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const prevRankByStudent = new Map<string, number>();
  if (prevAssignment) {
    const prevRows = await queryAssignmentRawRanks(prevAssignment.id, "BEST");
    for (const r of prevRows) {
      prevRankByStudent.set(r.studentId, Number(r.rank));
    }
  }

  // Apply anonymization server-side for students (teacher always sees full names)
  const anonymize = !params.isTeacher && assignment.leaderboardAnon;

  const entries: LeaderboardEntryDTO[] = rows.map((row, idx) => {
    const rank = Number(row.rank);
    const isCurrentUser = row.studentId === params.viewerId;
    const hideIdentity = anonymize && rank > 3 && !isCurrentUser;
    const prevRank = prevRankByStudent.get(row.studentId);
    const trend = prevRank !== undefined ? prevRank - rank : null;
    const score = Math.round(row.totalScore * 100) / 100;
    const maxScore = Math.round(row.maxScore * 100) / 100;
    const scoreScale10 = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 100 : 0;

    return {
      rank,
      studentId: hideIdentity ? `anon-${idx + 1}` : row.studentId,
      displayName: hideIdentity ? `Học sinh #${rank}` : row.studentName,
      isCurrentUser,
      score,
      maxScore,
      scoreScale10,
      durationMs: Math.round(row.durationMs),
      submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : null,
      correctCount: Number(row.correctCount),
      totalQuestions: Number(row.totalQuestions),
      trend,
    };
  });

  const currentUserEntry = entries.find((e) => e.isCurrentUser) ?? null;

  return {
    mode: "ASSIGNMENT",
    assignmentId: assignment.id,
    assignmentTitle: assignment.title,
    classId: assignment.class.id,
    className: assignment.class.name,
    visible: true,
    anonymized: anonymize,
    scoreRule,
    totalStudentsInClass: assignment.class._count.enrollments,
    entries,
    currentUserEntry,
  };
}

export async function getClassSemesterLeaderboard(params: {
  classId: string;
  viewerId: string;
  isTeacher: boolean;
  includeMissingAsZero?: boolean;
  fromDate?: Date | null;
  toDate?: Date | null;
}): Promise<ClassLeaderboardResponse> {
  const cls = await prisma.class.findUnique({
    where: { id: params.classId },
    select: {
      id: true,
      name: true,
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!cls) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  const includeMissingAsZero = params.includeMissingAsZero ?? true;
  const nowDate = new Date();

  // Consider assignments whose dueAt has passed, plus assignments without a deadline.
  // Assignments without a deadline never count as "missing = 0" (students may still do them).
  const eligibleAssignments = await prisma.assignment.findMany({
    where: {
      classId: params.classId,
      ...(params.fromDate ? { createdAt: { gte: params.fromDate } } : {}),
      ...(params.toDate ? { createdAt: { lte: params.toDate } } : {}),
      OR: [{ dueAt: { lte: nowDate } }, { dueAt: null }],
    },
    select: { id: true, dueAt: true, showLeaderboard: true, leaderboardAnon: true },
  });

  // Respect the teacher's per-assignment leaderboard settings for students
  if (!params.isTeacher && eligibleAssignments.length > 0) {
    if (eligibleAssignments.every((a) => a.showLeaderboard === "OFF")) {
      return {
        mode: "CLASS",
        visible: false,
        hiddenReason: "Giáo viên đã tắt bảng xếp hạng cho các bài tập của lớp.",
        classId: cls.id,
        className: cls.name,
        includeMissingAsZero,
        assignmentCount: 0,
        totalStudentsInClass: cls._count.enrollments,
        entries: [],
        currentUserEntry: null,
      };
    }
  }
  const visibleAssignments = params.isTeacher
    ? eligibleAssignments
    : eligibleAssignments.filter((a) => a.showLeaderboard !== "OFF");
  const anonymize =
    !params.isTeacher && visibleAssignments.some((a) => a.leaderboardAnon);

  const assignmentIds = visibleAssignments.map((a) => a.id);
  const dueAssignmentIds = visibleAssignments.filter((a) => a.dueAt !== null).map((a) => a.id);
  if (assignmentIds.length === 0) {
    return {
      mode: "CLASS",
      classId: cls.id,
      className: cls.name,
      includeMissingAsZero,
      assignmentCount: 0,
      totalStudentsInClass: cls._count.enrollments,
      entries: [],
      currentUserEntry: null,
    };
  }

  const cacheKey = `cls:${cls.id}:${params.isTeacher ? "t" : "s"}:${includeMissingAsZero}:${assignmentIds.join(",")}:${params.fromDate?.toISOString() ?? ""}:${params.toDate?.toISOString() ?? ""}`;
  const cache = getCache();
  const cached = cache.get(cacheKey);
  let rows: RawClassRankRow[];

  if (cached && cached.expiresAt > Date.now()) {
    rows = cached.value as RawClassRankRow[];
  } else {
    rows = await prisma.$queryRaw<RawClassRankRow[]>(Prisma.sql`
      WITH best_per_assignment AS (
        SELECT DISTINCT ON (s."assignmentId", s."studentId")
          s."assignmentId",
          s."studentId",
          CASE
            WHEN s."maxScore" > 0
              THEN (COALESCE(s."totalScore", s."autoScore", 0)::double precision / s."maxScore"::double precision) * 10.0
            ELSE 0.0
          END AS "scale10",
          GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s."submittedAt", NOW()) - s."startedAt")) * 1000)::double precision AS "durationMs"
        FROM "Submission" s
        WHERE s."assignmentId" IN (${Prisma.join(assignmentIds)})
          AND s."status" IN ('SUBMITTED', 'GRADED')
          AND s."flagged" = false
        ORDER BY
          s."assignmentId",
          s."studentId",
          COALESCE(s."totalScore", s."autoScore", 0) DESC,
          GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s."submittedAt", NOW()) - s."startedAt")) * 1000) ASC
      ),
      enrolled AS (
        SELECT e."studentId", u."name" AS "studentName"
        FROM "Enrollment" e
        INNER JOIN "User" u ON u."id" = e."studentId"
        WHERE e."classId" = ${params.classId} AND e."status" = 'ACTIVE'
      ),
      aggregated AS (
        SELECT
          en."studentId",
          en."studentName",
          COUNT(b."assignmentId") AS "completedCount",
          COALESCE(SUM(b."durationMs"), 0)::double precision AS "totalDurationMs",
          CASE
            WHEN ${includeMissingAsZero} THEN
              -- denominator: all past-due assignments + no-deadline assignments the student actually did
              COALESCE(SUM(b."scale10"), 0)::double precision / GREATEST(1,
                ${dueAssignmentIds.length}::int
                + COUNT(b."assignmentId") FILTER (WHERE NOT (b."assignmentId" = ANY(${dueAssignmentIds}::text[])))
              )::double precision
            ELSE
              COALESCE(AVG(b."scale10"), 0)::double precision
          END AS "avgScale10"
        FROM enrolled en
        LEFT JOIN best_per_assignment b ON b."studentId" = en."studentId"
        GROUP BY en."studentId", en."studentName"
      )
      SELECT
        "studentId",
        "studentName",
        ROUND("avgScale10"::numeric, 2)::double precision AS "avgScale10",
        "completedCount",
        "totalDurationMs",
        RANK() OVER (
          ORDER BY ROUND("avgScale10"::numeric, 2) DESC, "totalDurationMs" ASC
        ) AS "rank"
      FROM aggregated
      WHERE ${includeMissingAsZero} OR "completedCount" > 0
      ORDER BY "rank" ASC, "studentName" ASC
    `);
    cache.set(cacheKey, { value: rows, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  const entries: LeaderboardEntryDTO[] = rows.map((r, idx) => {
    const rank = Number(r.rank);
    const isCurrentUser = r.studentId === params.viewerId;
    const hide = anonymize && rank > 3 && !isCurrentUser;
    return {
    rank,
    studentId: hide ? `anon-${idx + 1}` : r.studentId,
    displayName: hide ? `Học sinh #${rank}` : r.studentName,
    isCurrentUser,
    score: Math.round(r.avgScale10 * 100) / 100,
    maxScore: 10,
    scoreScale10: Math.round(r.avgScale10 * 100) / 100,
    durationMs: Math.round(r.totalDurationMs),
    submittedAt: null,
    correctCount: Number(r.completedCount),
    totalQuestions: assignmentIds.length,
    trend: null,
    };
  });

  const currentUserEntry = entries.find((e) => e.isCurrentUser) ?? null;

  return {
    mode: "CLASS",
    visible: true,
    anonymized: anonymize,
    classId: cls.id,
    className: cls.name,
    includeMissingAsZero,
    assignmentCount: assignmentIds.length,
    totalStudentsInClass: cls._count.enrollments,
    entries,
    currentUserEntry,
  };
}
