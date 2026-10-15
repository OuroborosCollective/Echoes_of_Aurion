// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MMOEngine } from "../core/MMOEngine";
import {
  attachAx1ZoneProjection,
  attachZoneCombatTransport,
  projectConfirmedZoneSnapshot,
  rejectPendingZoneAttack,
  requestZoneBasicAttack,
  requestZoneSkill,
} from "./zoneCombatBridge";
import { requestConfirmedAction } from "./confirmedActionRequest";

const target = { id: "mob_1", hp: 100, x: 4, z: 0 };
const sendSkill = vi.fn(() => true);
const nearest = vi.fn((): typeof target | null => target);
const engine = {
  targetMob: null,
  mobManager: {
    nearest,
    applyAuthoritativeSnapshot: vi.fn(),
  },
  player: {
    position: { x: 0, y: 0, z: 0 },
    stats: { hp: 100, maxHp: 100 },
    setConfirmedGlbSpeed: vi.fn(),
  },
  setVirtualMovement: vi.fn(),
} as unknown as MMOEngine;

let detachProjection: () => void;
let detachTransport: () => void;

beforeEach(() => {
  engine.targetMob = null;
  detachProjection = attachAx1ZoneProjection(engine);
  detachTransport = attachZoneCombatTransport({ attack: vi.fn(() => true), skill: sendSkill });
  projectConfirmedZoneSnapshot({
    selfEntityId: "player:7",
    mobs: [],
    combatants: [{
      entityId: "player:7",
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      alive: true,
      combatLevel: 1,
      lastCombatSequence: 0,
    }],
  });
});

afterEach(() => {
  detachTransport();
  detachProjection();
  vi.clearAllMocks();
});

describe("Aurion-owned combat feedback", () => {
  it("resolves a server range rejection without reviving AX1 ownership", async () => {
    const outcome = requestZoneBasicAttack();
    rejectPendingZoneAttack("COMBAT_TARGET_OUT_OF_RANGE");
    await expect(outcome).resolves.toEqual({
      confirmed: false,
      completed: false,
      message: "Ziel außerhalb der bestätigten Aurion-Reichweite.",
    });
  });

  it.each([
    ["INVALID_COMBAT_SKILL", "Dieser Aurion-Skill gehört nicht zum bestätigten Waffenpfad."],
    ["COMBAT_SKILL_COOLDOWN", "Der Aurion-Skill ist serverseitig noch auf Abklingzeit."],
  ])("resolves %s with Aurion-owned skill feedback", async (code, message) => {
    const outcome = requestZoneSkill("k_strike");
    rejectPendingZoneAttack(code);
    await expect(outcome).resolves.toEqual({ confirmed: false, completed: false, message });
  });

  it("forwards hotbar skill two to the typed server skill transport", async () => {
    const outcome = requestConfirmedAction("2");
    expect(sendSkill).toHaveBeenCalledWith("k_charge", "mob_1");
    rejectPendingZoneAttack("COMBAT_SKILL_COOLDOWN");
    await expect(outcome).resolves.toMatchObject({
      confirmed: false,
      message: "Der Aurion-Skill ist serverseitig noch auf Abklingzeit.",
    });
  });

  it.each([
    ["3", "k_shield"],
    ["4", "k_whirlwind"],
    ["5", "k_overdrive"],
  ] as const)("forwards targetless hotbar command %s to Aurion as %s", async (command, skillId) => {
    nearest.mockReturnValueOnce(null);
    const outcome = requestConfirmedAction(command);
    expect(sendSkill).toHaveBeenCalledWith(skillId, undefined);
    rejectPendingZoneAttack("INVALID_COMBAT_SKILL");
    await expect(outcome).resolves.toMatchObject({
      confirmed: false,
      message: "Dieser Aurion-Skill gehört nicht zum bestätigten Waffenpfad.",
    });
  });

  it("identifies the disconnected action gate as the Aurion zone contract", async () => {
    detachTransport();
    await expect(requestConfirmedAction("F")).resolves.toEqual({
      confirmed: false,
      completed: false,
      message: "Aurion-Zonenvertrag nicht verbunden; kein lokaler Gameplay-Fallback.",
    });
  });
});
