import { createHash } from "node:crypto";
/** Domain-separated public receipt identities. Never use these as credentials. */
export function rewardReceiptIdentity(kind: string, userId: number, sourceKey: string): string {
  if (!/^[a-z][a-z0-9_]{0,11}$/.test(kind) || !Number.isSafeInteger(userId) || userId < 1 || !sourceKey || sourceKey.length > 256) throw new Error("REWARD_IDENTITY_INPUT_INVALID");
  return `${kind}_${createHash("sha256").update(JSON.stringify(["aurion-reward-identity.v1", kind, userId, sourceKey])).digest("hex").slice(0,48)}`;
}
