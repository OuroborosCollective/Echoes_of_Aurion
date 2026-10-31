import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { canonicalJson } from "../../shared/aurionCanonicalHash";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { sortCanonicalZoneState } from "./zoneCanonicalState";

describe("canonical object-key parity under allocation optimization", () => {
  it("preserves enumerable __proto__ cooldown keys as data, without changing the input", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.isReplay = true;
    zone.join({
      userId: 815,
      socket: { readyState: 1, OPEN: 1, send() {}, close() {} } as unknown as WebSocket,
    });
    const state = zone.getCanonicalZoneState();
    const cooldowns = Object.fromEntries([
      ["z_skill", 2],
      ["__proto__", 37],
      ["a_skill", 1],
    ]) as Record<string, number>;
    state.players[0]!.skillCooldowns = cooldowns;

    const sorted = sortCanonicalZoneState(state);
    const output = sorted.players[0]!.skillCooldowns;
    expect(Object.keys(output)).toEqual(["__proto__", "a_skill", "z_skill"]);
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
    expect(output["__proto__"]).toBe(37);
    expect(canonicalJson(output)).toBe(canonicalJson(Object.fromEntries(
      Object.entries(cooldowns).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0),
    )));
    expect(Object.hasOwn(cooldowns, "__proto__")).toBe(true);
  });
  it("preserves an own __proto__ objective progress entry while sorting quest instances", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.isReplay = true;
    const state = zone.getCanonicalZoneState();
    const progress = Object.fromEntries([
      ["later", false],
      ["__proto__", true],
      ["first", 3],
    ]) as Record<string, string | number | boolean>;
    state.questInstances = [{
      instanceId: "quest-key-parity", templateId: "test-template", templateVersion: 1,
      worldId: state.worldId, playerUserId: 815, giverNpcId: "test-npc",
      seedDigest: "test", planHash: "test", graphHash: "test",
      currentNodeId: "first", completedNodeIds: [], boundRoles: [], state: "active",
      objectiveProgress: progress, updatedAtTick: 0, createdAt: "1970-01-01",
      updatedAt: "1970-01-01",
    }];

    const sorted = sortCanonicalZoneState(state);
    const output = sorted.questInstances![0]!.objectiveProgress;
    expect(Object.keys(output)).toEqual(["__proto__", "first", "later"]);
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
    expect(output["__proto__"]).toBe(true);
    expect(Object.hasOwn(progress, "__proto__")).toBe(true);
  });

});
