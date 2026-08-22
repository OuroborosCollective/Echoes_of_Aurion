import type { EncounterKey, QuestKey } from "./gameplayProtocol";

export type OpenWorldZoneKey = "observatory_threshold" | "windhollow" | "emberfall" | "cinder_vault";
export type OpenWorldCommand = "move" | "attack" | "interact" | "return_to_tower";
export type PointOfInterestKind = "portal" | "npc" | "encounter" | "landmark";

export type OpenWorldProfile = {
  level: number;
  completed: readonly QuestKey[];
  activeQuest: QuestKey | null;
  canEnterDungeon: boolean;
};

export type OpenWorldSnapshot = {
  revision: 1;
  zoneId: OpenWorldZoneKey;
  zoneTier: 0 | 1 | 2 | 3;
  displayName: string;
  entryNarrative: string;
  encounter: { activeCount: number; budget: number; maximumVisible: number };
  primaryEncounter: null | { id: string; label: string; encounterKey: EncounterKey; narrative: string };
  pointsOfInterest: readonly { id: string; kind: PointOfInterestKind; state: "locked" | "available" | "completed"; label: string }[];
  npcs: readonly { id: "lyra" | "orun"; displayName: string; role: string; memory: { local: readonly string[]; social: readonly string[]; quest: readonly string[] } }[];
  allowedCommands: readonly OpenWorldCommand[];
};

export function encounterBudget(level: number, zoneTier: number): number {
  return Math.min(24, Math.max(6, 6 + Math.floor(Math.max(1, level) / 4) + 2 * Math.max(0, zoneTier)));
}

export function maximumVisibleEnemies(level: number): number {
  return Math.min(18, 10 + 2 * Math.floor(Math.max(1, level) / 10));
}

export function zoneForOpenWorldProgress(input: OpenWorldProfile): OpenWorldZoneKey {
  if (input.canEnterDungeon) return "cinder_vault";
  if (input.completed.includes("archive_of_echoes")) return "emberfall";
  if (input.completed.includes("astral_call")) return "windhollow";
  return "observatory_threshold";
}

function npcReadModels(input: OpenWorldProfile) {
  const hasAstralCall = input.completed.includes("astral_call");
  const hasArchive = input.completed.includes("archive_of_echoes");
  const active = input.activeQuest;
  return [
    {
      id: "lyra" as const,
      displayName: "Lyra von der Sternwarte",
      role: "Grenzbotin und Hüterin der Rückkehrsteine",
      memory: {
        local: hasAstralCall ? ["Du hast den Asterion-Sentinel gebrochen und den ersten Pfad geöffnet."] : ["Der Turm erkennt deine Resonanz, doch der äußere Pfad ist noch unruhig."],
        social: hasArchive ? ["Die Archivwächter sprechen wieder von einem sicheren Übergang durch den Windhain."] : ["Windhollow meldet unstete Wisps nahe der ersten Brücke."],
        quest: active === "ember_key" ? ["Das Solarium wartet auf deine letzte Stabilisierung."] : ["Kein weiterer Auftrag von Lyra ist zurzeit aktiv."],
      },
    },
    {
      id: "orun" as const,
      displayName: "Orun, Archivhüter",
      role: "Kartograph der versunkenen Pfade",
      memory: {
        local: hasArchive ? ["Du hast die Echo-Tafel entschlüsselt; ihre Koordinaten führen Richtung Emberfall."] : ["Die Archive antworten erst, wenn du den Ruf der Sternwarte vollendet hast."],
        social: hasAstralCall ? ["Die Windhollow-Karten zeigen eine neue Resonanzlinie am Rand des Sonnenfalls."] : ["Keine bestätigte Außenroute wurde an das Archiv gemeldet."],
        quest: active === "archive_of_echoes" ? ["Die versunkene Halle ist dein nächster klarer Auftrag."] : ["Orun bewahrt die Karte, bis der Questpfad es zulässt."],
      },
    },
  ] as const;
}

function primaryEncounterFor(input: OpenWorldProfile): OpenWorldSnapshot["primaryEncounter"] {
  if (input.activeQuest === "astral_call") return { id: "asterion-sentinel", label: "Asterion-Sentinel", encounterKey: "asterion", narrative: "Ein Resonanzanker antwortet auf deine Waffen- und Echo-Signale." };
  if (input.activeQuest === "archive_of_echoes") return { id: "archive-warden", label: "Archivwächter", encounterKey: "archive", narrative: "Der versunkene Hüter blockiert den Zugang zur Echo-Tafel." };
  if (input.activeQuest === "ember_key") return { id: "solarium-echo", label: "Solarium-Echo", encounterKey: "solarium", narrative: "Die letzte Flamme lässt nur eine serverbestätigte Stabilisierung zu." };
  if (input.canEnterDungeon) return { id: "cinder-guardian", label: "Glutwächter", encounterKey: "cinder_vault", narrative: "Der geborgene Schlüssel erlaubt den Eintritt ins Aschengewölbe." };
  return null;
}

export function buildOpenWorldSnapshot(input: OpenWorldProfile): OpenWorldSnapshot {
  const zoneId = zoneForOpenWorldProgress(input);
  const zone = {
    observatory_threshold: { tier: 0 as const, displayName: "Schwelle der Sternwarte", narrative: "Vor dem Turm öffnen sich bronzene Sternenpfade; ein Rückkehrstein bindet deine erste Außenroute.", pois: [
      { id: "return-stone", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein der Sternwarte" },
      { id: "lyra-threshold", kind: "npc" as const, state: "available" as const, label: "Lyra, Grenzbotin" },
      { id: "windhollow-gate", kind: "portal" as const, state: input.completed.includes("astral_call") ? "available" as const : "locked" as const, label: "Pfad nach Windhollow" },
    ] },
    windhollow: { tier: 1 as const, displayName: "Windhollow", narrative: "Zwischen schwebenden Basaltwurzeln flackern astrale Wisps über einem verlassenen Wegnetz.", pois: [
      { id: "windhollow-return", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein Windhollow" },
      { id: "lyra-windhollow", kind: "npc" as const, state: "available" as const, label: "Lyra am Sternenpfad" },
      { id: "wisp-grove", kind: "encounter" as const, state: "available" as const, label: "Hain der Astralwisps" },
      { id: "archive-route", kind: "landmark" as const, state: "available" as const, label: "Versunkener Archivpfad" },
    ] },
    emberfall: { tier: 2 as const, displayName: "Emberfall", narrative: "Warme Glutadern durchziehen zerbrochene Observatorien; das Solarium zeichnet sich am Horizont ab.", pois: [
      { id: "emberfall-return", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein Emberfall" },
      { id: "orun-emberfall", kind: "npc" as const, state: "available" as const, label: "Orun, Archivhüter" },
      { id: "solarium-route", kind: "encounter" as const, state: "available" as const, label: "Solarium der letzten Flamme" },
      { id: "cinder-vault-gate", kind: "portal" as const, state: "locked" as const, label: "Tor zum Aschengewölbe" },
    ] },
    cinder_vault: { tier: 3 as const, displayName: "Aschengewölbe", narrative: "Der Glutschlüssel entzündet uralte Runen; hinter dem Tor wartet der Glutwächter auf den ersten Setfund.", pois: [
      { id: "vault-return", kind: "portal" as const, state: "available" as const, label: "Rückkehrstein des Gewölbes" },
      { id: "cinder-guardian", kind: "encounter" as const, state: "available" as const, label: "Glutwächter" },
      { id: "first-relic", kind: "landmark" as const, state: "available" as const, label: "Reliktkammer" },
    ] },
  }[zoneId];
  const maximumVisible = maximumVisibleEnemies(input.level);
  return {
    revision: 1,
    zoneId,
    zoneTier: zone.tier,
    displayName: zone.displayName,
    entryNarrative: zone.narrative,
    encounter: { activeCount: Math.min(maximumVisible, Math.max(2, zone.tier + Math.floor(Math.max(1, input.level) / 12) + 1)), budget: encounterBudget(input.level, zone.tier), maximumVisible },
    primaryEncounter: primaryEncounterFor(input),
    pointsOfInterest: zone.pois,
    npcs: npcReadModels(input),
    allowedCommands: ["move", "attack", "interact", "return_to_tower"],
  };
}
