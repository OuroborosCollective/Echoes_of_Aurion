import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { replayZoneTick } from "./causality/replayZoneTick";
import { makeWorldCollisionSnapshot } from "../shared/worldObjectCollisionContract";
import type { AurionWorldCollisionIntent } from "../shared/aurionZoneIntentContract";
import { parseZoneMove, parseZoneAttack, parseZoneSkill } from "./zoneProtocol";

const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;
const thinWall = () => makeWorldCollisionSnapshot({ worldDesignRevision: "a".repeat(64), catalogRevision: "b".repeat(64),
  objects: [{ id: "test:solid-wall", assetSha256: "c".repeat(64), profileHash: "d".repeat(64),
    origin: {x:1000,z:0}, rotationQuarterTurns: 0, scalePermille: 1000,
    hulls: [[[0,-2000],[100,-2000],[100,2000],[0,2000]]] }] });
function fixture() {
  const zone = new AuthoritativeMovementZone("observatory_threshold");
  zone.isReplay = true;
  zone.sourceRevisionOverride = "a".repeat(40);
  return zone;
}
function intent(zone: AuthoritativeMovementZone, snapshot = thinWall()): AurionWorldCollisionIntent {
  return { type: "world_collision_replace", connectionId: "aurion:world", entityId: "world:collision",
    arrivalSeq: 0, clientSeq: zone.getTickNumber(), worldId: "echoes-of-aurion-global", zoneId: zone.zoneId,
    expectedRevision: zone.getWorldCollisionRevision(), snapshot };
}
function checkedTick(zone: AuthoritativeMovementZone) {
  // Live joins are queued alongside their immediate transport projection. Start
  // from the previous receipt-bound state rather than the transport read model.
  const preState = structuredClone((zone as unknown as {lastCommittedState: ReturnType<typeof zone.getCanonicalZoneState>}).lastCommittedState);
  const intents = structuredClone([...zone.getPendingIntents()]);
  zone.tick();
  const receipt = zone.getLatestReceipt()!;
  expect(replayZoneTick({preState,intents,expectedReceipt:receipt}).status).toBe("MATCH");
  return receipt;
}

describe("Aurion recorded world collision authority", () => {
  it("stops movement, replays each receipt and restores geometry without a catalog read", () => {
    const zone = fixture();
    const welcome = zone.join({userId:75001,socket});
    zone.enqueueIntent(intent(zone));
    zone.submitMovement(welcome.connectionId,{type:"move",clientSeq:1,input:{x:1,z:0}});
    for(let tick=0;tick<8;tick++) checkedTick(zone);
    // A tick advances 340 mm; the second step would put the 351 mm disc
    // through the wall at x=1000, so the last safe whole tick remains x=340.
    expect(zone.getCanonicalZoneState().players[0]!.x).toBe(340);
    expect(zone.getWorldCollisionRevision()).toBe(thinWall().revision);
    const cold = fixture();
    cold.restoreFromCanonicalState(zone.getCanonicalZoneState(),zone.getLatestReceipt()!.receiptHash);
    expect(checkedTick(cold)).toEqual(checkedTick(zone));
    const empty = makeWorldCollisionSnapshot({...thinWall(),objects:[]});
    zone.enqueueIntent(intent(zone,empty));
    checkedTick(zone);
    expect(zone.getCanonicalZoneState().players[0]!.x).toBe(680);
  });
  it("rejects stale, foreign-world and player-authored replacement inputs", () => {
    for (const patch of [{expectedRevision:"sha256:"+"e".repeat(64)}, {worldId:"foreign"},
      {zoneId:"foreign"}, {entityId:"player:75001"}]) {
      const zone=fixture(); zone.enqueueIntent({...intent(zone),...patch}); checkedTick(zone);
      expect(zone.getWorldCollisionRevision()).toBeNull();
    }
    const raw=intent(fixture());
    expect(parseZoneMove(raw)).toBeNull(); expect(parseZoneAttack(raw)).toBeNull(); expect(parseZoneSkill(raw)).toBeNull();
  });
  it("refuses solid geometry around spawn and existing actors", () => {
    for (const origin of [0,1500]) {
      const zone=fixture();zone.join({userId:75001,socket});checkedTick(zone);
      const state=zone.getCanonicalZoneState();state.players[0]!.x=1500;zone.restoreFromCanonicalState(state);
      const candidate=thinWall();candidate.objects[0]!.origin.x=origin;
      zone.enqueueIntent(intent(zone,makeWorldCollisionSnapshot(candidate)));checkedTick(zone);
      expect(zone.getWorldCollisionRevision()).toBeNull();
    }
  });
  it("records geometry by value and validates a malformed replacement before ticking", () => {
    const zone=fixture(), command=intent(zone);zone.enqueueIntent(command);command.snapshot.objects.length=0;
    checkedTick(zone);expect(zone.getCanonicalZoneState().worldCollision!.objects).toHaveLength(1);
    const broken=intent(zone);broken.snapshot.objects[0]!.origin.x++;
    expect(()=>zone.enqueueIntent(broken)).toThrow("WORLD_OBJECT_COLLISION_HASH_INVALID");
    expect(zone.getPendingIntents()).toHaveLength(0);
  });
  it("leaves historical snapshots and input receipts free of a collision extension", () => {
    for(const ruleset of ["aurion.zone.rules.v2","aurion.zone.rules.v3","aurion.zone.rules.v4"]) {
      const zone=fixture(), state=zone.getCanonicalZoneState();state.ruleset=ruleset;zone.restoreFromCanonicalState(state);
      const welcome=zone.join({userId:75001,socket});
      zone.submitMovement(welcome.connectionId,{type:"move",clientSeq:1,input:{x:1,z:0}});
      for(let tick=0;tick<8;tick++)checkedTick(zone);
      expect(zone.getCanonicalZoneState().worldCollision).toBeUndefined();
      expect(zone.getCanonicalZoneState().players[0]!.x).toBe(2720);
    }
  });
});
