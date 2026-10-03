/**
 * Canonical Aurion-owned identities and interaction anchors for starter-village
 * quest NPCs. Coordinates use the authoritative zone's fixed-point millimetres.
 */
export const aurionQuestNpcIdValues = [
  "lyra",
  "orun",
  "starter_village_north_gate_guard",
] as const;

export type AurionQuestNpcId = (typeof aurionQuestNpcIdValues)[number];

export const aurionStarterVillageQuestNpcs = Object.freeze({
  lyra: Object.freeze({
    id: "lyra",
    displayName: "Lyra",
    zoneId: "observatory_threshold",
    position: Object.freeze({ x: 6_000, z: -7_000 }),
  }),
  orun: Object.freeze({
    id: "orun",
    displayName: "Orun",
    zoneId: "observatory_threshold",
    position: Object.freeze({ x: 42_000, z: -38_000 }),
  }),
  starter_village_north_gate_guard: Object.freeze({
    id: "starter_village_north_gate_guard",
    displayName: "Nordtorwache",
    zoneId: "observatory_threshold",
    position: Object.freeze({ x: 0, z: -12_000 }),
  }),
} as const satisfies Record<AurionQuestNpcId, Readonly<{
  id: AurionQuestNpcId;
  displayName: string;
  zoneId: "observatory_threshold";
  position: Readonly<{ x: number; z: number }>;
}>>);

export type AurionQuestGiverName = (typeof aurionStarterVillageQuestNpcs)[AurionQuestNpcId]["displayName"];

export const aurionQuestNpcIds: readonly AurionQuestNpcId[] = Object.freeze([...aurionQuestNpcIdValues]);

const questNpcByDisplayName = new Map<AurionQuestGiverName, (typeof aurionStarterVillageQuestNpcs)[AurionQuestNpcId]>(
  aurionQuestNpcIds.map(id => {
    const npc = aurionStarterVillageQuestNpcs[id];
    return [npc.displayName, npc];
  }),
);

export function isAurionQuestNpcId(value: string): value is AurionQuestNpcId {
  return Object.prototype.hasOwnProperty.call(aurionStarterVillageQuestNpcs, value);
}

export function aurionQuestNpcForGiver(giver: string) {
  return questNpcByDisplayName.get(giver as AurionQuestGiverName);
}
