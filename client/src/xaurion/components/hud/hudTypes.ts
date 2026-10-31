import type { ReactNode } from "react";

export type Ax1HudPartyMember = Readonly<{
  id: string;
  name: string;
  role: string;
  ready: boolean;
  hp?: number;
  maxHp?: number;
  weaponTrack?: string;
}>;

export type Ax1HudObjective = Readonly<{
  id: string;
  label: string;
  detail: string;
  kind: "primary" | "npc" | "encounter" | "portal" | "landmark";
  progress?: number;
  subtasks?: string[];
  lore?: string;
  completed?: boolean;
}>;

export type Ax1HudSkill = Readonly<{
  command: string;
  name: string;
  icon: string;
  color: string;
}>;

export type Ax1HudCombatLog = Readonly<{
  id: string;
  tick: number | string;
  text: string;
  value: number | string;
}>;

export type HudContext = "exploration" | "combat" | "dialogue" | "management";

export interface GameHUDProps {
  playerName: string;
  playerIcon: string;
  playerColor: string;
  points?: number;
  victories?: number;
  progressionCount?: number;
  mastery?: Readonly<{ name: string; level: number | string; xpPercent?: number }>;
  playerState: string;
  /** Server-confirmed self combatant HP only; no estimated/default health. */
  selfHealth?: Readonly<{ hp: number; maxHp: number }>;
  lifeStatus?: "alive" | "dead" | "respawn";
  playerStateLabel: string;
  connected: boolean;
  remotePlayerCount: number;
  zoneName: string;
  coordinates?: string;
  worldState: string;
  worldStateLabel: string;
  party?: readonly Ax1HudPartyMember[];
  objectives: readonly Ax1HudObjective[];
  hotbar: readonly Ax1HudSkill[];
  autoLoot: boolean;
  autoAttack: boolean;
  actionsDisabled: boolean;
  controlsDisabled: boolean;
  combat: Readonly<{
    eventCount: number;
    currentDps: number | string;
    peakDps: number | string;
    currentDtps: number | string;
    logs: readonly Ax1HudCombatLog[];
    dpsSeries?: readonly { second: number; dps: number; dtps: number }[];
  }>;
  miniMap: ReactNode;
  movementControl: ReactNode;
  feedback?: string;
  onMenuOpenChange?: (open: boolean) => void;
  onOpenCharacter: () => void;
  onOpenInventory: () => void;
  onOpenCrafting: () => void;
  onOpenQuests: () => void;
  onOpenInvestigations?: () => void;
  onOpenContacts: () => void;
  onOpenParty: () => void;
  onOpenDungeonFinder: () => void;
  onOpenMap: () => void;
  onOpenControls: () => void;
  onOpenDisciplines: () => void;
  onOpenCompanion: () => void;
  onOpenChat: () => void;
  onOpenGuild: () => void;
  onOpenEconomy: () => void;
  onOpenDialogue: () => void;
  onOpenTerritory: () => void;
  onOpenHomestead: () => void;
  onOpenDeterminism: () => void;
  onOpenResearch: () => void;
  onToggleAutoLoot: () => void;
  onInteract: () => void;
  onToggleAutoAttack: () => void;
  onAttack: () => void;
  onCastSkill: (command: string) => void;
  pending?: boolean;
  context?: HudContext;
}
