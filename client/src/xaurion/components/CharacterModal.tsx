import type { z } from "zod";
import type { playerReadbackSchema } from "../integration/authoritativeHudProjection";
import type { ControlSettings, SkillCommand } from "@shared/playerUiProtocol";
import type { GroupReadmodel } from "@shared/groupInstanceProtocol";
import { DEFAULT_WEAPON_MASTERIES } from "../data/mmorpgData";
import type { PlayerStats, WeaponMastery, WeaponType } from "../types";
import { Ax1CharacterModal, type Ax1VisiblePlayerStats } from "./Ax1CharacterModal";
import type { ConfirmedCharacterAppearance } from "./Ax1CharacterPreview";

const knownWeaponTypes = new Set<WeaponType>(Object.keys(DEFAULT_WEAPON_MASTERIES) as WeaponType[]);

function exactLevel(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Converts only receipt-confirmed Aurion progression into the data shape expected
 * by the visible AX1 character/mastery surface. Missing gameplay values stay
 * explicitly unconfirmed (NaN/0 sentinels) and are rendered as dashes by AX1.
 */
export function projectConfirmedAx1Character(player?: z.infer<typeof playerReadbackSchema>): Ax1VisiblePlayerStats {
  const weaponMasteries: Partial<Record<WeaponType, WeaponMastery>> = {};
  const unlockedSkills: string[] = [];
  let activeWeaponType: WeaponType = "blade";

  for (const track of player?.progression.tracks ?? []) {
    if (track.trackKind === "skill") {
      unlockedSkills.push(track.trackId);
      continue;
    }
    if (!knownWeaponTypes.has(track.trackId as WeaponType)) continue;
    const type = track.trackId as WeaponType;
    const source = DEFAULT_WEAPON_MASTERIES[type];
    if (!source) continue;
    const level = exactLevel(track.levelExact);
    weaponMasteries[type] = {
      ...source,
      level,
      xp: 0,
      maxXp: 0,
      bonusStats: { ...source.bonusStats },
      skills: [...source.skills],
      milestoneSkills: source.milestoneSkills ? [...source.milestoneSkills] : [],
    };
    if (Object.keys(weaponMasteries).length === 1) activeWeaponType = type;
  }

  const unknown = Number.NaN;
  const stats: PlayerStats = {
    hp: unknown,
    maxHp: unknown,
    resource: unknown,
    maxResource: unknown,
    resourceName: "—",
    resourceColor: "#6b7280",
    level: 0,
    xp: 0,
    maxXp: 0,
    xpToNextLevel: 0,
    gold: 0,
    politicsLevel: 0,
    politicsXp: 0,
    attackPower: unknown,
    spellPower: unknown,
    armor: unknown,
    critChance: unknown,
    dodgeChance: unknown,
    moveSpeed: unknown,
    moveSpeedMultiplier: 1,
    isMounted: false,
    activeMountName: "",
    score: 0,
    kills: 0,
    bossKills: player?.profile.victories ?? 0,
    currentZone: "",
    x: 0,
    y: 0,
    z: 0,
    statPoints: 0,
    attributes: { strength: unknown, agility: unknown, intelligence: unknown, defense: unknown },
    activeWeaponType,
    weaponMasteries: weaponMasteries as Record<WeaponType, WeaponMastery>,
    equippedSkills: [],
    unlockedMilestoneSkills: [...new Set(unlockedSkills)].sort(),
    totalMasteryLevel: Object.values(weaponMasteries).reduce((sum, mastery) => sum + (mastery?.level ?? 0), 0),
  };
  return Object.assign(stats, { prestigeTitle: undefined });
}

/** Thin authority adapter. The rendered surface itself is AX1. */
export function CharacterModal({ isOpen, onClose, player, appearance: _appearance, settings: _settings, uiPending: _uiPending, groupPending: _groupPending, message: _message, group: _group, onBind: _onBind, onRoleSkill: _onRoleSkill, onInventory: _onInventory }: {
  isOpen: boolean;
  onClose: () => void;
  player?: z.infer<typeof playerReadbackSchema>;
  appearance?: ConfirmedCharacterAppearance | null;
  settings?: ControlSettings;
  uiPending: boolean;
  groupPending: boolean;
  message?: string;
  group?: GroupReadmodel;
  onBind: (slot: number, command: SkillCommand) => void;
  onRoleSkill: (skill: "mending_light" | "guardian_stance", equipped: boolean) => void;
  onInventory: () => void;
}) {
  return <Ax1CharacterModal
    isOpen={isOpen}
    onClose={onClose}
    stats={projectConfirmedAx1Character(player)}
    currentClassId="knight"
  />;
}
