export const ZONE_MAX_PRESENCES = 128;
export const ZONE_POSITION_LIMIT = 14_500;
export const ZONE_SNAPSHOT_MAX_CHARACTERS = 65_536;
export type ConfirmedZonePresence = Readonly<{ entityId: string; userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number }>;

export function validConfirmedPresences(value: unknown): value is ConfirmedZonePresence[] {
  if (!Array.isArray(value) || value.length > ZONE_MAX_PRESENCES) return false;
  const identities = new Set<number>();
  return value.every(p => {
    if (!p || typeof p !== "object" || !Number.isSafeInteger(p.userId) || p.userId < 1 || identities.has(p.userId) || p.entityId !== `player:${p.userId}`) return false;
    identities.add(p.userId);
    return Number.isSafeInteger(p.lastAcceptedClientSeq) && p.lastAcceptedClientSeq >= 0 && p.lastAcceptedClientSeq <= 2_147_483_647 && p.position && Number.isSafeInteger(p.position.x) && Number.isSafeInteger(p.position.z) && Math.abs(p.position.x) <= ZONE_POSITION_LIMIT && Math.abs(p.position.z) <= ZONE_POSITION_LIMIT;
  });
}
