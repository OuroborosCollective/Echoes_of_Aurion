import { eq } from "drizzle-orm";
import { z } from "zod";
import { aurionContentHashAuditReceipts, aurionContentHashLedger } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const digest = z.string().regex(/^[a-f0-9]{64}$/i);
const key = z.string().trim().min(1).max(256);
export const contentHashLedgerInputSchema = z.object({
  sourceRevision: key,
  sourcePath: z.string().trim().min(1).max(512),
  fileHash: digest,
  manifestHash: digest,
  migrationTag: z.string().regex(/^00[2-9][0-9]_.+$/),
  contentKind: z.enum(["sql", "schema", "protocol", "manifest", "asset"]),
  sourceSizeBytes: z.number().int().nonnegative().max(100_000_000),
}).strict();
export type ContentHashLedgerInput = z.infer<typeof contentHashLedgerInputSchema>;
export type ContentHashAuditStatus = "VERIFIED" | "DRIFT" | "UNREADABLE";

export function normalizeContentHashLedger(input: ContentHashLedgerInput) {
  const parsed = contentHashLedgerInputSchema.parse(input);
  const identityHash = npcHash(parsed);
  return Object.freeze({ ...parsed, identityHash });
}

export function classifyContentHashAudit(input: { expectedFileHash: string; actualFileHash: string | null; expectedManifestHash: string; actualManifestHash: string | null }): ContentHashAuditStatus {
  if (!input.actualFileHash || !input.actualManifestHash) return "UNREADABLE";
  return input.expectedFileHash.toLowerCase() === input.actualFileHash.toLowerCase() && input.expectedManifestHash.toLowerCase() === input.actualManifestHash.toLowerCase() ? "VERIFIED" : "DRIFT";
}

export async function recordContentHashLedger(input: ContentHashLedgerInput) {
  const normalized = normalizeContentHashLedger(input);
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  const prior = (await db.select().from(aurionContentHashLedger).where(eq(aurionContentHashLedger.identityHash, normalized.identityHash)).limit(1))[0];
  if (prior) return Object.freeze({ applied: false as const, id: prior.id, identityHash: prior.identityHash });
  const id = `content_hash_${normalized.identityHash.slice(0, 48)}`;
  await db.insert(aurionContentHashLedger).values({ id, ...normalized });
  return Object.freeze({ applied: true as const, id, identityHash: normalized.identityHash });
}

export async function recordRootAuditReceipt(input: { ledgerId: string; status: ContentHashAuditStatus; checkedCount: number; driftCount: number; evidenceDigest: string; redactedJson: string }) {
  const parsed = z.object({ ledgerId: key, status: z.enum(["VERIFIED", "DRIFT", "UNREADABLE"]), checkedCount: z.number().int().nonnegative(), driftCount: z.number().int().nonnegative(), evidenceDigest: digest, redactedJson: z.string().max(16_384) }).parse(input);
  if (parsed.driftCount > parsed.checkedCount) throw new Error("AUDIT_DRIFT_COUNT_INVALID");
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  const id = `content_audit_${npcHash(parsed).slice(0, 48)}`;
  await db.insert(aurionContentHashAuditReceipts).values({ id, ...parsed, createdByRole: "root" });
  return Object.freeze({ id, status: parsed.status });
}
