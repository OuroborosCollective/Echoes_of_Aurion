export type SubmissionAccess = Readonly<{
  ownerId: number;
  visibility: "private" | "public";
}>;

const SUBMISSIONS_PREFIX = "aurion/submissions/glb/";

/**
 * Do not turn Forge's privileged signing key into an unauthenticated read
 * capability for player submissions. Public legacy game art is unaffected.
 */
export async function mayPresignSubmissionKey(
  key: string,
  requesterUserId: number | null,
  lookup: (storageKey: string) => Promise<SubmissionAccess | null>,
): Promise<boolean> {
  if (!key || key.startsWith("/") || key.includes("\\") || key.includes("?") || key.includes("#") || /[\u0000-\u001f\u007f%]/.test(key)) return false;
  const segments = key.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === "..")) return false;
  if (!key.startsWith(SUBMISSIONS_PREFIX)) return true;
  const parsed = /^aurion\/submissions\/glb\/([1-9][0-9]*)\/([^/]+)$/.exec(key);
  if (!parsed) return false;
  const ownerFromPath = Number(parsed[1]);
  if (!Number.isSafeInteger(ownerFromPath)) return false;
  const record = await lookup(key);
  if (!record || record.ownerId !== ownerFromPath) return false;
  return record.visibility === "public" || requesterUserId === record.ownerId;
}
