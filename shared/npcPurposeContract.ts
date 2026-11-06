import { z } from "zod";

/**
 * The purpose of an NPC shell: who the figure is and what it does at its place.
 * Drafted by an LLM from the admin's brief (an untrusted proposal), confirmed by the
 * admin with one tap, then persisted by Aurion with a receipt. Players only ever see
 * the confirmed version; no LLM speaks or acts live.
 */
export const NPC_PURPOSE_SCHEMA = "aurion.npc-purpose.v1" as const;
/** Routine points stay within this distance of the shell's place. */
export const NPC_PURPOSE_ROUTINE_RADIUS_MM = 20_000;
export const NPC_PURPOSE_BRIEF_MAX = 2_000;

// Plain text only: no control characters, markup or links in confirmed NPC text.
const SAFE_TEXT = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>{}]*$/;
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => SAFE_TEXT.test(value), "NPC_PURPOSE_TEXT_UNSAFE")
  .refine(value => !/(https?:|www\.)/i.test(value), "NPC_PURPOSE_TEXT_LINK");
const offset = z.number().int().min(-NPC_PURPOSE_ROUTINE_RADIUS_MM).max(NPC_PURPOSE_ROUTINE_RADIUS_MM);

export const NpcPurposeDraftSchema = z.object({
  schemaVersion: z.literal(NPC_PURPOSE_SCHEMA),
  shellRef: z.string().regex(/^authored:npc\.shells\.[a-z0-9]{1,16}:[a-z][a-z0-9._:-]{2,95}$/).max(128),
  displayName: text(2, 40),
  role: text(2, 60),
  persona: text(10, 600),
  greeting: text(2, 240),
  topics: z.array(z.object({ topic: text(2, 40), line: text(2, 280) }).strict()).min(1).max(8),
  routine: z.array(z.object({ label: text(2, 40), offsetXMm: offset, offsetZMm: offset, dwellSeconds: z.number().int().min(10).max(3_600) }).strict()).min(1).max(6),
  questIdeas: z.array(z.object({ title: text(3, 80), summary: text(10, 400), objective: text(3, 160) }).strict()).max(3),
}).strict().superRefine((value, ctx) => {
  const topics = value.topics.map(item => item.topic.toLowerCase());
  if (new Set(topics).size !== topics.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NPC_PURPOSE_DUPLICATE_TOPIC", path: ["topics"] });
});
export type NpcPurposeDraft = z.infer<typeof NpcPurposeDraftSchema>;

export const NpcPurposeDraftInput = z.object({
  shellRef: z.string().max(128),
  brief: z.string().trim().min(12).max(NPC_PURPOSE_BRIEF_MAX),
  mode: z.enum(["auto", "local", "free", "premium"]).default("auto"),
  modelId: z.string().max(160).optional(),
}).strict();

export const NpcPurposeConfirmInput = z.object({
  draft: NpcPurposeDraftSchema,
  expectedDraftHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** Current confirmed purpose hash of the shell (null when it has none): optimistic write. */
  expectedPreviousPurposeHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  confirmation: z.literal("CONFIRM_NPC_PURPOSE"),
}).strict();

export type ConfirmedNpcPurpose = Readonly<{
  shellRef: string;
  purposeHash: string;
  receiptId: string;
  purpose: NpcPurposeDraft;
}>;
export type NpcPurposeReadback = Readonly<{
  schemaVersion: typeof NPC_PURPOSE_SCHEMA;
  revision: string;
  purposes: readonly ConfirmedNpcPurpose[];
}>;
