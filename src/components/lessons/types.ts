import type { LessonItemType } from "@prisma/client";

/** A lesson as returned by GET /api/lessons (the teacher's library). */
export interface LibraryLesson {
  id: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  updatedAt: string;
  items: Array<{
    id: string;
    title: string;
    type: LessonItemType;
    fileKey: string | null;
    url: string | null;
    order: number;
  }>;
  classLinks: Array<{ class: { id: string; name: string; archived: boolean } }>;
}
