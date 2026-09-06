import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aurionClassForAx1,
  aurionCommandForAx1Key,
  ax1MovementToAurionIntent,
} from "../client/src/xaurion/integration/aurionAuthorityAdapter";

const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-242 AX1 controls behind WASD authority", () => {
  it("uses the AX1 camera-relative movement basis for zone direction intents", () => {
    expect(ax1MovementToAurionIntent(0, 1, 0)).toEqual({ x: 0, z: -1 });
    expect(ax1MovementToAurionIntent(0, 0, 1)).toEqual({ x: 1, z: 0 });
    expect(ax1MovementToAurionIntent(Math.PI / 2, 1, 0)).toEqual({ x: -1, z: 0 });
    expect(ax1MovementToAurionIntent(Math.PI / 2, 0, 1)).toEqual({ x: 0, z: -1 });
  });

  it("preserves AX1 input semantics while translating only the command intent", () => {
    expect(aurionCommandForAx1Key("1", "Digit1")).toBe("1");
    expect(aurionCommandForAx1Key("5", "Digit5")).toBe("5");
    expect(aurionCommandForAx1Key(" ", "Space")).toBe("3");
    expect(aurionCommandForAx1Key("f", "KeyF")).toBe("E");
    expect(aurionCommandForAx1Key("tab", "Tab")).toBeNull();
  });

  it("maps only classes backed by the persisted profile contract", () => {
    expect(aurionClassForAx1("knight")).toBe("vanguard");
    expect(aurionClassForAx1("mage")).toBe("seer");
    expect(aurionClassForAx1("ranger")).toBe("warden");
    expect(aurionClassForAx1("engineer")).toBeNull();
  });

  it("removes Aurion gameplay fallbacks from the mounted AX1 runtime", () => {
    const runtime = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
    const request = read("client/src/xaurion/integration/confirmedActionRequest.ts");
    const hud = read("client/src/xaurion/integration/AurionAuthorityHud.tsx");
    const home = read("client/src/pages/Home.tsx");
    expect(runtime).toContain("ax1MovementToAurionIntent(engine.cameraYaw, forward, right)");
    expect(runtime).toContain("bindAurionAuthorityProjection");
    expect(runtime).toContain("return requestConfirmedAction(command)");
    expect(request).not.toContain("aurion:request-action");
    expect(request).toContain("kein Aurion-Gameplay-Fallback");
    expect(hud).not.toContain("AurionEncounterPanel");
    expect(hud).not.toContain("trpc.gameplay.acceptQuest");
    expect(hud).not.toContain("trpc.gameplay.completeQuest");
    expect(home).not.toContain("GameCanvas");
    expect(home).not.toContain("ZoneMovementClient");
    expect(home).not.toContain("gameplay.act");
    expect(home).not.toContain("MissionState");
    expect(runtime).not.toContain('x: ((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0))');
    expect(runtime).not.toContain("engine.player.stats.gold -= item.valueGold");
    expect(runtime).not.toContain("engine.quests.push({ ...quest })");
    expect(runtime).not.toContain("engine.player.inventory.push(item)");
    expect(runtime).not.toContain("partyManager.inviteMember(player)");
  });

  it("keeps the Aurion website outside gameplay mutation authority", () => {
    const app = read("client/src/App.tsx");
    const website = [
      read("client/src/pages/Home.tsx"),
      read("client/src/pages/Account.tsx"),
      read("client/src/pages/Community.tsx"),
      read("client/src/components/CommunityOverlay.tsx"),
    ].join("\n");
    expect(app).toContain('location !== "/play"');
    expect(app).not.toContain("AurionGroupsPage");
    expect(website).not.toContain("trpc.gameplay.acceptQuest");
    expect(website).not.toContain("trpc.gameplay.completeQuest");
    expect(website).not.toContain("trpc.gameplay.startEncounter");
    expect(website).not.toContain("trpc.gameplay.act");
    expect(website).not.toContain("trpc.groups.command");
    expect(website).not.toContain("trpc.player.chooseClass");
    expect(website).not.toContain("trpc.player.setWeaponLoadout");
    expect(website).not.toContain("trpc.player.equipItem");
    expect(website).not.toContain("trpc.player.unequipItem");
    expect(website).not.toContain("trpc.player.collectLoot");
    expect(website).not.toContain("trpc.crafting.craft");
    expect(website).not.toContain("trpc.crafting.materializeBonus");
    expect(website).not.toContain("trpc.market.sellToSystem");
    expect(website).not.toContain("trpc.market.createListing");
    expect(website).not.toContain("trpc.market.buyListing");
  });

  it("keeps local combat/progression methods projection-only in integrated mode", () => {
    const adapter = read("client/src/xaurion/integration/aurionAuthorityAdapter.ts");
    const compact = adapter.replace(/\s+/g, "");
    expect(compact).toContain("engine.mobManager.enableServerAuthority()");
    expect(compact).toContain("attachAx1ZoneProjection(engine)");
    expect(compact).toContain("player.takeDamage=()=>({damageTaken:0,isDead:false,dodged:false})");
    expect(compact).toContain("player.gainXp=()=>false");
    expect(compact).toContain("player.consumeResource=()=>false");
    expect(compact).toContain("player.equipItem=()=>null");
    expect(compact).toContain("engine.castClassSkill=index=>");
    expect(compact).toContain('handlers.requestAction("E")');
  });
});
