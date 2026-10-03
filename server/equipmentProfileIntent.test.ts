import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { sealEquipmentMutation } from "../shared/aurionEquipmentProfileContract";
import { hashCanonicalIntents } from "../shared/aurionZoneIntentContract";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { replayZoneTick } from "./causality/replayZoneTick";
import { parseZoneAttack, parseZoneMove, parseZoneSkill } from "./zoneProtocol";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";

const socket = { readyState: 1, OPEN: 1, send() {}, close() {} } as unknown as WebSocket;
const receipt = (revision = 1, equipped = false) => sealEquipmentMutation({
  schema: "aurion.equipment.mutation.v1", userId: 771, operation: equipped ? "equip" : "unequip",
  item: { id: "ax1_starter_blade:771", version: "ax1_starter" }, previousRevisionExact: String(revision - 1), revisionExact: String(revision), previousReceiptHash: revision === 1 ? null : receipt(1).hash,
  beforeEquipment: [], afterEquipment: [],
  beforeProfile: { weaponEquipped: true, weaponBonus: 15, maxHealth: 540 },
  afterProfile: { weaponEquipped: equipped, weaponBonus: equipped ? 15 : 0, maxHealth: equipped ? 540 : 520 },
});
function fixture(name: string, health = 530) {
  const zone = new AuthoritativeMovementZone(`equipment:${name}` as any);
  zone.join({ userId: 771, socket, combatProfile: { combatLevel: 1, maxHealth: 540, weaponBonus: 15, weaponEquipped: true, weaponTrack: "blade", equipmentRevisionExact: "0", equipmentReceiptHash: null } });
  const state = zone.getCanonicalZoneState();
  state.players[0]!.health = health;
  zone.restoreFromCanonicalState(state);
  return zone;
}
describe("server-only equipment profile intent", () => {
  it("applies only in the tick, clamps HP without healing and leaves client sequence/stamina/level unchanged", () => {
    const zone = fixture("tick");
    const connectionId = zone.connectionIdForUser(771)!;
    zone.enqueueEquipmentProfile(receipt());
    expect(zone.getCanonicalZoneState().players[0]!.weaponBonus).toBe(15);
    expect(zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: 0 } })).toBe("accepted");
    zone.tick();
    expect(zone.getCanonicalZoneState().players[0]).toMatchObject({ weaponEquipped: false, weaponBonus: 0, maxHealth: 520, health: 520, combatLevel: 1, stamina: 100, lastAcceptedClientSeq: 1, equipmentRevisionExact: "1" });
    zone.enqueueEquipmentProfile(receipt(2, true));
    zone.tick();
    expect(zone.getCanonicalZoneState().players[0]).toMatchObject({ maxHealth: 540, health: 520, lastAcceptedClientSeq: 1, equipmentRevisionExact: "2" });
  });
  it("orders revisions independently, deduplicates retries, and cannot roll back a newer profile", () => {
    const zone = fixture("order");
    zone.enqueueEquipmentProfile(receipt(2, true)); zone.enqueueEquipmentProfile(receipt()); zone.enqueueEquipmentProfile(receipt());
    expect(zone.getPendingIntents()).toHaveLength(2);
    zone.tick();
    expect(zone.getCanonicalZoneState().players[0]).toMatchObject({ weaponEquipped: true, equipmentRevisionExact: "2" });
    zone.enqueueEquipmentProfile(receipt()); zone.tick();
    expect(zone.getCanonicalZoneState().players[0]).toMatchObject({ weaponEquipped: true, equipmentRevisionExact: "2" });
  });
  it("does not revive a dead peer on an equipment change", () => {
    const zone = fixture("dead", 0); zone.enqueueEquipmentProfile(receipt()); zone.tick();
    expect(zone.getCanonicalZoneState().players[0]!.health).toBe(0);
  });
  it("replays the full server receipt and rejects tampered hashes/owner binding", () => {
    const zone = fixture("replay"); const preState = zone.getCanonicalZoneState();
    zone.enqueueEquipmentProfile(receipt()); const intents = [...zone.getPendingIntents()]; zone.tick();
    expect(replayZoneTick({ preState, intents, expectedReceipt: zone.getLatestReceipt()! }).status).toBe("MATCH");
    expect(() => zone.enqueueEquipmentProfile({ ...receipt(), hash: `sha256:${"f".repeat(64)}` })).toThrow("EQUIPMENT_RECEIPT_HASH_MISMATCH");
    expect(() => hashCanonicalIntents([{ ...intents[0]!, entityId: "player:999" }])).toThrow("EQUIPMENT_INTENT_OWNER_MISMATCH");
  });
  it("keeps v3 snapshots without equipment revisions byte-identical on restore", () => {
    const zone = fixture("old"); const state = zone.getCanonicalZoneState();
    state.ruleset = "aurion.zone.rules.v3";
    state.players = state.players.map(({ equipmentRevisionExact: _, equipmentReceiptHash: __, ...player }) => player);
    zone.restoreFromCanonicalState(state);
    expect(hashCanonicalZoneState(zone.getCanonicalZoneState())).toBe(hashCanonicalZoneState(state));
  });
  it("does not accept profile commands through public move/attack/skill parsers", () => {
    const untrusted = { type: "equipment_profile", clientSeq: 1, receipt: receipt() };
    expect(parseZoneMove(untrusted)).toBeNull(); expect(parseZoneAttack(untrusted)).toBeNull(); expect(parseZoneSkill(untrusted)).toBeNull();
  });
});
