export const forumCategories = ["announcements", "patch_notes", "events", "general"] as const;
export type ForumCategory = (typeof forumCategories)[number];

export function normalizeCommunityText(value: string, maximumLength: number, fieldName: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`${fieldName} darf nicht leer sein.`);
  if (normalized.length > maximumLength) throw new Error(`${fieldName} ist zu lang.`);
  return normalized;
}

export function normalizeCommunityBody(value: string, maximumLength: number, fieldName: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) throw new Error(`${fieldName} darf nicht leer sein.`);
  if (normalized.length > maximumLength) throw new Error(`${fieldName} ist zu lang.`);
  return normalized;
}

export function activeTeamMemberKey(userId: number): string {
  return `expedition-active-${userId}`;
}

export function assertDistinctTeammates(requesterUserId: number, responderUserId: number): void {
  if (requesterUserId === responderUserId) throw new Error("Ein eigenes Partnergesuch kann nicht angenommen werden.");
}

export function mayPublishForumCategory(role: "user" | "admin", category: ForumCategory): boolean {
  return role === "admin" || category === "general";
}
