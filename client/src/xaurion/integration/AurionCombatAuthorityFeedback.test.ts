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
const engine = {
  targetMob: null,
  mobManager: {
    nearest: vi.fn(() => target),
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
  detachProjection = attachAx1ZoneProjection(engine);
  detachTransport = attachZoneCombatTransport({ attack: vi.fn(() => true), skill: vi.fn(() => true) });
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

  it("identifies the disconnected action gate as the Aurion zone contract", async () => {
    detachTransport();
    await expect(requestConfirmedAction("F")).resolves.toEqual({
      confirmed: false,
      completed: false,
      message: "Aurion-Zonenvertrag nicht verbunden; kein lokaler Gameplay-Fallback.",
    });
  });
});
