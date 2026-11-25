/** Sort options for the teacher assignment list (shared by the server page and the client filter bar). */
export const ASSIGNMENT_SORTS = ["newest", "oldest", "due_asc", "due_desc", "class", "title"] as const;
export type AssignmentSort = (typeof ASSIGNMENT_SORTS)[number];
