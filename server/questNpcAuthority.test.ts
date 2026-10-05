import { AURION_STARTER_VILLAGE_GATES } from "../shared/aurionStarterVillageContract";
import { describe, expect, it } from "vitest";
import { aurionStarterVillageQuestNpcs } from "./aurionStarterVillageContract";
import { assertQuestNpcAuthorityEvidence, QUEST_NPC_INTERACTION_RADIUS_FIXED } from "./questNpcAuthority";

const userId = 41;
const lyra = aurionStarterVillageQuestNpcs.lyra;
const valid = {
  userId,
  questKey: "astral_call" as const,
  kind: "accept" as const,
  command: { id: "dialogue-command-1", userId, npcId: "lyra", questKey: "astral_call", actionKind: "offer_quest" as const },
  presence: { userId, zoneId: lyra.zoneId, position: lyra.position },
};

describe("canonical Aurion quest NPC authority", () => {
  it("binds pilot hand-in to the north guard, matching action and current AOI", () => {
    const guard = aurionStarterVillageQuestNpcs.starter_village_north_gate_guard;
    const pilot = {
      userId, questKey: "starter-wolves-6" as const, kind: "complete" as const,
      command: { id: "pilot-turn-in", userId, npcId: guard.id, questKey: "starter-wolves-6", actionKind: "request_turn_in" as const },
      presence: { userId, zoneId: guard.zoneId, position: guard.position },
    };
    expect(assertQuestNpcAuthorityEvidence(pilot).npcId).toBe(guard.id);
    expect(() => assertQuestNpcAuthorityEvidence({ ...pilot, command: { ...pilot.command, npcId: "lyra" } })).toThrow("QUEST_GIVER_MISMATCH");
    expect(() => assertQuestNpcAuthorityEvidence({ ...pilot, command: { ...pilot.command, actionKind: "offer_quest" } })).toThrow("QUEST_DIALOGUE_ACTION_MISMATCH");
    expect(() => assertQuestNpcAuthorityEvidence({ ...pilot, presence: undefined })).toThrow("QUEST_WORLD_PRESENCE_REQUIRED");
    expect(() => assertQuestNpcAuthorityEvidence({ ...pilot, presence: { ...pilot.presence, position: { x: 0, z: 8_000 } } })).toThrow("QUEST_GIVER_OUT_OF_RANGE");
  });
  it("keeps the north-gate guard identity and fixed starter-village anchor in the typed contract", () => {
    expect(aurionStarterVillageQuestNpcs.starter_village_north_gate_guard.position).toBe(AURION_STARTER_VILLAGE_GATES[0].position);
    expect(aurionStarterVillageQuestNpcs.starter_village_north_gate_guard).toEqual({
      id: "starter_village_north_gate_guard",
      displayName: "Nordtorwache",
      zoneId: "observatory_threshold",
      position: { x: 0, z: -30_000 },
    });
  });

  it.each([
    ["falsche Wache", { command: { ...valid.command, npcId: "starter_village_north_gate_guard" } }, "QUEST_GIVER_MISMATCH"],
    ["falscher Spieler", { command: { ...valid.command, userId: userId + 1 } }, "QUEST_DIALOGUE_USER_MISMATCH"],
    ["falsche Quest", { command: { ...valid.command, questKey: "archive_of_echoes" } }, "QUEST_DIALOGUE_QUEST_MISMATCH"],
    ["falsche Aktionsart", { command: { ...valid.command, actionKind: "request_turn_in" as const } }, "QUEST_DIALOGUE_ACTION_MISMATCH"],
    ["falsche Zone", { presence: { ...valid.presence, zoneId: "windhollow" } }, "QUEST_WORLD_ZONE_MISMATCH"],
    ["Position außerhalb des Radius", { presence: { ...valid.presence, position: { x: lyra.position.x + QUEST_NPC_INTERACTION_RADIUS_FIXED + 1, z: lyra.position.z } } }, "QUEST_GIVER_OUT_OF_RANGE"],
  ])("lehnt %s ab", (_label, change, error) => {
    expect(() => assertQuestNpcAuthorityEvidence({ ...valid, ...change })).toThrow(error);
  });

  it("accepts the fully bound command and server-confirmed AOI presence", () => {
    expect(assertQuestNpcAuthorityEvidence(valid)).toEqual({ npcId: "lyra", dialogueCommandReceiptId: "dialogue-command-1" });
  });
});
