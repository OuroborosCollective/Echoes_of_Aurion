import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aurionClassForAx1,
  aurionCommandForAx1Key,
  ax1MovementToAurionIntent,
} from "../client/src/xaurion/integration/aurionAuthorityAdapter";

const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-242 -ax1 controls behind Aurion authority", () => {
  it("uses the -ax1 camera-relative movement basis for Aurion direction intents", () => {
    expect(ax1MovementToAurionIntent(0, 1, 0)).toEqual({ x: 0, z: -1 });
    expect(ax1MovementToAurionIntent(0, 0, 1)).toEqual({ x: 1, z: 0 });
    expect(ax1MovementToAurionIntent(Math.PI / 2, 1, 0)).toEqual({ x: -1, z: 0 });
    expect(ax1MovementToAurionIntent(Math.PI / 2, 0, 1)).toEqual({ x: 0, z: -1 });
  });

  it("preserves -ax1 gameplay key semantics while translating writes to Aurion commands", () => {
    expect(aurionCommandForAx1Key("1", "Digit1")).toBe("1");
    expect(aurionCommandForAx1Key("5", "Digit5")).toBe("5");
    expect(aurionCommandForAx1Key(" ", "Space")).toBe("3");
    expect(aurionCommandForAx1Key("f", "KeyF")).toBe("E");
    expect(aurionCommandForAx1Key("tab", "Tab")).toBeNull();
  });

  it("maps only classes backed by the current Aurion server contract", () => {
    expect(aurionClassForAx1("knight")).toBe("vanguard");
    expect(aurionClassForAx1("mage")).toBe("seer");
    expect(aurionClassForAx1("ranger")).toBe("warden");
    expect(aurionClassForAx1("engineer")).toBeNull();
  });

  it("removes the old parallel Aurion movement/control writes from the integrated runtime", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    expect(runtime).toContain("ax1MovementToAurionIntent(engine.cameraYaw, forward, right)");
    expect(runtime).toContain("bindAurionAuthorityProjection");
    expect(runtime).toContain('new CustomEvent("aurion:request-action"');
    const hud = readFileSync("client/src/xaurion/integration/AurionAuthorityHud.tsx", "utf8");
    expect(runtime).toContain("<AurionAuthorityHud");
    expect(hud).toContain("trpc.player.chooseClass.useMutation()");
    expect(hud).toContain("trpc.gameplay.acceptQuest.useMutation()");
    expect(runtime).not.toContain('x: ((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0))');
    expect(runtime).not.toContain("engine.player.stats.gold -= item.valueGold");
    expect(runtime).not.toContain("engine.quests.push({ ...quest })");
    expect(runtime).not.toContain("engine.player.inventory.push(item)");
    expect(runtime).not.toContain("partyManager.inviteMember(player)");
  });

  it("keeps local combat/progression methods projection-only in Aurion integrated mode", () => {
    const adapter = read("client/src/xaurion/integration/aurionAuthorityAdapter.ts");
    expect(adapter).toContain("player.takeDamage = () => ({ damageTaken: 0");
    expect(adapter).toContain("player.gainXp = () => false");
    expect(adapter).toContain("player.consumeResource = () => false");
    expect(adapter).toContain("player.equipItem = () => null");
    expect(adapter).toContain("engine.castClassSkill = index =>");
    expect(adapter).toContain('handlers.requestAction("E")');
  });
});
