import { z } from "zod";

/** Owned stock only: neither a reservation nor proof of craft/build eligibility. */
export const WORLD_TABLE_STOCK_LIMIT = 256;
const exact = z.string().regex(/^(0|[1-9][0-9]*)$/).max(128);
export const worldTableInventorySchema = z.object({
  schema: z.literal("aurion.worldtable-owned-stock.v1"),
  actorId: z.string().regex(/^player:[1-9][0-9]*$/),
  revisionExact: exact,
  stockHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  stacks: z.array(z.object({
    id: z.string().min(1).max(64),
    version: z.enum(["legacy", "aurion_v2"]),
    definitionId: z.string().min(1).max(96),
    quantityExact: exact.refine(value => value !== "0"),
  }).strict()).max(WORLD_TABLE_STOCK_LIMIT),
  mutationAuthority: z.literal("none"),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  for (const stack of value.stacks) {
    // Inventory commands use unqualified ids, so cross-version collisions fail closed.
    if (seen.has(stack.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate stock identity" });
    seen.add(stack.id);
  }
});
export type WorldTableInventory = z.infer<typeof worldTableInventorySchema>;
