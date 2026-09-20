import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AX1_NPC_ENGINE_SOURCE_REVISION, AX1_PARTICLE_EFFECTS_SHA256, AX1_VISIBLE_SOURCE_MANIFEST, AX1_VISIBLE_SOURCE_REVISION } from "./ax1SourceManifest";
import { ConfirmedVisualEffects } from "./confirmedVisualEffects";

describe("AX1 full visible cutover contract", () => {
  it("binds every required AX1 surface to the exact completed source revision", () => {
    expect(AX1_VISIBLE_SOURCE_REVISION).toBe("f24e3bbb452bd6991c8365fc7827ce6dbcc16d95");
    expect(AX1_NPC_ENGINE_SOURCE_REVISION).toBe("cf9cd7a9e197a110724d4f517655a63168ed63e0");
    expect(AX1_PARTICLE_EFFECTS_SHA256).toBe("ed63e2c94bea0ff7c472a4c4224ec1aa4b997cf98d795740528bb89ba483faac");
    expect(AX1_VISIBLE_SOURCE_MANIFEST).toHaveLength(19);
    expect(new Set(AX1_VISIBLE_SOURCE_MANIFEST.map(entry => entry.component)).size).toBe(19);
    expect(AX1_VISIBLE_SOURCE_MANIFEST.every(entry => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);
    expect(AX1_VISIBLE_SOURCE_MANIFEST.find(entry => entry.component === "MariaDbAndGlbConsole")?.decision).toBe("excluded");
    for (const component of ["GameHUD", "InventoryModal", "CharacterModal", "ClassSelectModal", "CraftingModal", "QuestLogModal", "PartyModal", "WorldMapModal", "MiniMap", "DungeonFinderModal", "GuildManagementModal", "NPCEconomyModal", "NPCDialogueModal", "TerritoryPoliticsModal", "HomesteadBuilderModal", "VirtualJoystick"]) {
      expect(AX1_VISIBLE_SOURCE_MANIFEST.find(entry => entry.component === component)?.decision).not.toBe("excluded");
    }
    expect(AX1_VISIBLE_SOURCE_MANIFEST.find(entry => entry.component === "GameHUD")?.note).toContain("Canonical visible AX1 shell");
  });

  it("mounts GameHUD as the visible shell while keeping AurionAuthorityHud as the confirmed adapter", () => {
    const shell = readFileSync(join(process.cwd(), "client/src/xaurion/components/GameHUD.tsx"), "utf8");
    const adapter = readFileSync(join(process.cwd(), "client/src/xaurion/integration/AurionAuthorityHud.tsx"), "utf8");
    const characterAdapter = readFileSync(join(process.cwd(), "client/src/xaurion/components/CharacterModal.tsx"), "utf8");
    const characterSurface = readFileSync(join(process.cwd(), "client/src/xaurion/components/Ax1CharacterModal.tsx"), "utf8");
    expect(adapter).toContain('import { GameHUD } from "../components/GameHUD"');
    expect(adapter).toContain("<GameHUD");
    expect(adapter).toContain("projectPlayerReadback");
    expect(adapter).toContain("projectReadback");
    expect(adapter).not.toContain("ax1-hud-top-left");
    expect(adapter).not.toContain("ax1-micro-menu");
    expect(shell).toContain('id="game-hud-root"');
    expect(shell).toContain('id="player-unit-frame"');
    expect(shell).toContain('data-source="ax1-f24-visible-shell"');
    expect(shell).toContain("Realm Chat");
    expect(shell).toContain("BESTÄTIGTE COMBAT METRICS");
    expect(characterAdapter).not.toContain("currentClassId");
    expect(characterSurface).not.toContain("currentClassId");
    for (const forbidden of ["MMORPG_CLASSES", "soundSynth", "Math.random", "Date.now", "performance.now", "crypto.randomUUID", "localStorage", "sessionStorage", "playerStats.hp", "playerStats.gold"]) {
      expect(shell).not.toContain(forbidden);
    }
  });

  it("keeps new AX1 world surfaces projection-only and free of local authority shortcuts", () => {
    const source = readFileSync(join(process.cwd(), "client/src/xaurion/components/Ax1WorldSurfaces.tsx"), "utf8");
    for (const forbidden of ["Math.random", "Date.now", "performance.now", "crypto.randomUUID", "hero_player_1", "localStorage", "sessionStorage", "onSelectClass"]) expect(source).not.toContain(forbidden);
    expect(source).toContain("AX1 Classless Progression");
    expect(source).toContain("Feste Aurion-Klassen werden nicht gewählt");
    expect(source).toContain("Bestätigter Readback ausstehend");
    expect(source).toContain("Research beobachtet bestätigte Spielzustände");
  });

  it("selects the new critical effect only from a confirmed sequenced event", () => {
    const effects = new ConfirmedVisualEffects();
    expect(effects.accept({ sessionId: "zone:player:7", sequence: 1, command: "F", damage: 9, crit: true, bossHp: 20, completed: false })).toEqual({ kind: "combat_crit", receiptKey: "zone:player:7:1" });
    expect(effects.accept({ sessionId: "zone:player:7", sequence: 1, command: "F", damage: 9, crit: true, bossHp: 20, completed: false })).toBeNull();
    expect(effects.accept({ sessionId: "zone:player:7", sequence: 2, command: "F", damage: 9, crit: "yes", bossHp: 20, completed: false })).toBeNull();
  });

  it("keeps the autonomous NPC brain, multi-memory and decision readbacks inside AX1", () => {
    const hud = readFileSync(join(process.cwd(), "client/src/xaurion/integration/AurionAuthorityHud.tsx"), "utf8");
    const panel = readFileSync(join(process.cwd(), "client/src/xaurion/integration/NpcDecisionPanel.tsx"), "utf8");
    const runtime = readFileSync(join(process.cwd(), "server/autonomousNpcLifeRuntime.ts"), "utf8");
    expect(hud).toContain("<NPCDialogueModal");
    expect(hud).toContain("<NpcDecisionPanel userId={userId}");
    expect(panel).toContain("gameplay.npcSnapshots");
    expect(panel).toContain("gameplay.npcMultiMemory");
    expect(panel).toContain("gameplay.npcActions");
    expect(panel).toContain("gameplay.npcSemanticGraph");
    expect(panel).toContain("gameplay.npcProjectionProvenance");
    expect(panel).toContain("decodeOwnedNpcMultiMemory");
    expect(panel).toContain("decodeOwnedNpcActions");
    expect(panel).toContain("decodeOwnedNpcSemanticGraphs");
    expect(panel).toContain("decodeOwnedNpcProjectionProvenance");
    expect(runtime).toContain("readConfirmedNpcMultiMemory");
    expect(runtime).toContain("resolveAndRecordAx1LivingWorld");
    expect(runtime).toContain("createAutonomousNpcLifeRuntime");
  });

  it("keeps confirmed HUD projections from covering AX1 menu controls", () => {
    const styles = readFileSync(join(process.cwd(), "client/src/xaurion/integration/ax1AuthorityHud.css"), "utf8");
    expect(styles).toContain(".ax1-confirmed-minimap{position:relative;top:auto;right:auto}");
    expect(styles).toContain("@media(min-width:1001px){.ax1-combat-metrics{top:70px}}");
  });
});
