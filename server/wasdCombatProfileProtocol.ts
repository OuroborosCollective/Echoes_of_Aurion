export const WASD_ZONE_WEAPON_TRACKS = ["blade", "staff", "spear", "focus"] as const;
export type WasdZoneWeaponTrack = (typeof WASD_ZONE_WEAPON_TRACKS)[number];
export type WasdZoneCombatProfile = Readonly<{ combatLevel: number; maxHealth: number; weaponBonus: number; weaponTrack: WasdZoneWeaponTrack }>;

export const WASD_DEFAULT_ZONE_COMBAT_PROFILE: WasdZoneCombatProfile = Object.freeze({ combatLevel: 1, maxHealth: 540, weaponBonus: 15, weaponTrack: "blade" });

export function validWasdZoneCombatProfile(profile: WasdZoneCombatProfile): boolean {
  return Number.isSafeInteger(profile.combatLevel) && profile.combatLevel >= 1 && profile.combatLevel <= 10_000
    && Number.isSafeInteger(profile.maxHealth) && profile.maxHealth >= 1 && profile.maxHealth <= 1_000_000
    && Number.isSafeInteger(profile.weaponBonus) && profile.weaponBonus >= 0 && profile.weaponBonus <= 100_000
    && (WASD_ZONE_WEAPON_TRACKS as readonly string[]).includes(profile.weaponTrack);
}
