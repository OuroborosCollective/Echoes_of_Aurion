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
});
