import { z } from "zod";

export const PLAYER_UI_VERSION = "aurion-ax1-ui.v1" as const;
export const AX1_UI_SOURCE = "d356881538dae23c3aa97364a5596d48b6ac3079" as const;
export const skillCommandSchema = z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
export type SkillCommand = z.infer<typeof skillCommandSchema>;
export const hotbarSchema = z.array(skillCommandSchema).length(5).refine(v => new Set(v).size === 5, "Doppelte Skillbelegung");
export const defaultHotbar: SkillCommand[] = ["1", "2", "3", "4", "5"];
export const controlSettingsSchema = z.object({ revision: z.number().int().nonnegative(), autoLoot: z.boolean(), analyticsConsent: z.boolean().default(false), hotbar: hotbarSchema }).strict();
export type ControlSettings = z.infer<typeof controlSettingsSchema>;
// Names are the existing Aurion command deck. No AX1-local cooldown, resource or damage
// preview is allowed to masquerade as a confirmed Aurion combat outcome.
export const aurionControlSkills = [
  { command: "1", name: "Prisma-Schritt", icon: "✦", color: "#fbbf24" },
  { command: "2", name: "Echoschild", icon: "◈", color: "#38bdf8" },
  { command: "3", name: "Sternenfaden", icon: "⌁", color: "#c084fc" },
  { command: "4", name: "Kartenblick", icon: "◎", color: "#67e8f9" },
  { command: "5", name: "Ruinenschnitt", icon: "⚔", color: "#fbbf24" },
  { command: "6", name: "Aegis-Knoten", icon: "◇", color: "#38bdf8" },
  { command: "7", name: "Ankerwurf", icon: "➶", color: "#6ee7b7" },
  { command: "8", name: "Sonnenbruch", icon: "☀", color: "#fb923c" },
  { command: "9", name: "Aurion-Resonanz", icon: "✺", color: "#e879f9" },
] as const;
export const uiSlots = ["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet", "belt", "ring", "amulet", "focus", "relic"] as const;
export const itemRecordVersionSchema = z.enum(["legacy", "aurion_v2", "ax1_starter"]);
export type ItemRecordVersion = z.infer<typeof itemRecordVersionSchema>;
export const itemReferenceSchema = z.object({ id: z.string().min(8).max(64), version: itemRecordVersionSchema }).strict();
export const uiItemSchema = itemReferenceSchema.extend({
  name: z.string().min(1), definition: z.string().min(1), levelExact: z.string().regex(/^[1-9][0-9]*$/),
  quality: z.enum(["normal", "magic", "rare", "set", "unique", "mythic"]),
  slot: z.enum(uiSlots).nullable(), status: z.enum(["owned", "equipped", "pending_pickup"]),
  stats: z.record(z.string(), z.number().finite()), receiptId: z.string().min(1),
});
export type UiItem = z.infer<typeof uiItemSchema>;
export const playerUiReadbackSchema = z.object({
  version: z.literal(PLAYER_UI_VERSION), userId: z.number().int().positive(),
  settings: controlSettingsSchema,
  items: z.array(uiItemSchema).max(500),
  equipment: z.array(z.object({ slot: z.enum(uiSlots), id: z.string(), version: itemRecordVersionSchema })).max(12),
}).superRefine((v, ctx) => {
  const key = (i: {id: string; version: string}) => `${i.version}:${i.id}`;
  if (new Set(v.items.map(key)).size !== v.items.length || new Set(v.equipment.map(e => e.slot)).size !== v.equipment.length || new Set(v.equipment.map(key)).size !== v.equipment.length) ctx.addIssue({ code: "custom", message: "Doppelte Gegenstände" });
  for (const e of v.equipment) if (!v.items.some(i => key(i) === key(e) && i.slot === e.slot && i.status === "equipped")) ctx.addIssue({ code: "custom", message: "Ausrüstung ohne bestätigten Gegenstand" });
  for (const i of v.items) if (i.status === "equipped" && !v.equipment.some(e => key(i) === key(e))) ctx.addIssue({ code: "custom", message: "Gegenstand ohne Ausrüstungsplatz" });
});
export type PlayerUiReadback = z.infer<typeof playerUiReadbackSchema>;

export function shouldAutoCollect(quality: string, enabled: boolean): boolean {
  return enabled && (quality === "normal" || quality === "magic");
}
