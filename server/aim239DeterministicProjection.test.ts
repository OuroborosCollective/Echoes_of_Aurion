import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DeterministicSimulation, seededRandom } from "../shared/deterministicSimulation";
import { MobManager } from "../client/src/xaurion/entities/MobManager";
import { LootDropManager } from "../client/src/xaurion/entities/LootDropManager";
import { GenkitAdapter } from "../client/src/xaurion/adapters/GenkitAdapter";
import type { ConfirmedZoneMob } from "../shared/zoneMobContract";

describe("AIM-239 seeded projection and explicit logical time", () => {
  it("isolates random streams so visual changes cannot move combat or loot draws", () => {
    const a = new DeterministicSimulation("world:fixture", 7);
    const b = new DeterministicSimulation("world:fixture", 7);
    for (let i = 0; i < 200; i++) {
      for (let visual = 0; visual < i; visual++) a.random("particles");
      expect(a.random("combat:critical")).toBe(b.random("combat:critical"));
      expect(a.random("mob:loot")).toBe(b.random("mob:loot"));
    }
    const otherWorld = new DeterministicSimulation("world:other", 7);
    const otherEpoch = new DeterministicSimulation("world:fixture", 8);
    expect(otherWorld.random("mob:loot")).not.toBe(otherEpoch.random("mob:loot"));
  });

  it("replays mobs, loot and bounty definitions identically across render cadences", () => {
    const replay = (frames: number[]) => {
      const clock = new DeterministicSimulation("world:fixture", 7);
      const scene = new THREE.Scene();
      const loot = new LootDropManager(scene, clock);
      const mobs = new MobManager(scene, loot, clock);
      const bounties = new GenkitAdapter(clock);
      for (const delta of frames) clock.advanceProjection(delta, fixedDelta => {
        mobs.update(fixedDelta, 0, 0);
        if (clock.tick === 3) mobs.damageMob(mobs.mobs[0].data.id, 9999);
        loot.update(fixedDelta);
      });
      return {
        tick: clock.tick, time: clock.elapsedMilliseconds,
        mobs: mobs.mobs.map(mob => mob.data),
        drops: loot.getAllDrops(),
        bounties: bounties.availableBounties,
        lore: bounties.generateEmergentLore("Orun", "Observatory"),
      };
    };
    const slow = replay(Array(10).fill(0.1));
    const fast = replay(Array(100).fill(0.01));
    expect(fast).toEqual(slow);
    expect(slow.tick).toBe(10);
    expect(slow.time).toBe(1000);
    expect(slow.drops).toHaveLength(1);
    expect(slow.drops[0].spawnTime).toBe(300);
  });

  it("keeps AX1 mob presentation visible while waiting for confirmed server truth", () => {
    const clock = new DeterministicSimulation("world:ax1-first", 4);
    const scene = new THREE.Scene();
    const loot = new LootDropManager(scene, clock);
    const mobs = new MobManager(scene, loot, clock);
    const baselineGroups = mobs.mobs.map(mob => mob.group);
    const baselineCount = mobs.mobs.length;

    expect(baselineCount).toBe(16);
    mobs.enableServerAuthority();

    expect(mobs.mobs).toHaveLength(baselineCount);
    expect(baselineGroups.every(group => group.parent === scene && group.visible)).toBe(true);
    expect(mobs.presentationEvidence()).toEqual({ serverAuthority: true, confirmedSnapshot: false, visible: 16, confirmed: 0, awaiting: 16 });
    expect(mobs.authoritativeEvidence()).toEqual([]);
    expect(mobs.nearest(18, -18, 100)).toBeNull();
    expect(mobs.damageMob("mob_1", 9999)).toEqual({ mob: null, isKilled: false });
  });

  it("promotes the existing AX1 mob visuals only after a valid confirmed snapshot", () => {
    const clock = new DeterministicSimulation("world:ax1-confirmed", 5);
    const scene = new THREE.Scene();
    const loot = new LootDropManager(scene, clock);
    const mobs = new MobManager(scene, loot, clock);
    const original = mobs.mobs.find(mob => mob.data.id === "mob_1")!;
    const originalGroup = original.group;
    mobs.enableServerAuthority();

    const snapshot: ConfirmedZoneMob[] = [{
      entityId: "mob_1",
      archetype: "clockwork_stalker",
      level: 3,
      state: "combat",
      position: { x: 21_000, z: -17_000 },
      targetEntityId: "player:1",
      isBoss: false,
      isElite: false,
      health: 88,
      maxHealth: 120,
    }];
    mobs.applyAuthoritativeSnapshot(snapshot);

    expect(mobs.mobs).toHaveLength(1);
    expect(mobs.mobs[0].group).toBe(originalGroup);
    expect(mobs.presentationEvidence()).toEqual({ serverAuthority: true, confirmedSnapshot: true, visible: 1, confirmed: 1, awaiting: 0 });
    expect(mobs.authoritativeEvidence()).toEqual([{ entityId: "mob_1", state: "combat", targetEntityId: "player:1", x: 21, z: -17, health: 88, maxHealth: 120 }]);
    expect(mobs.nearest(21, -17, 1)?.id).toBe("mob_1");
  });

  it("rejects missing world identity and invalid projection time", () => {
    expect(() => new DeterministicSimulation("", 0)).toThrow("WORLD_SEED_REQUIRED");
    for (const epoch of [-1, NaN, Infinity, 0.5]) expect(() => new DeterministicSimulation("world", epoch)).toThrow("WORLD_EPOCH_INVALID");
    const clock = new DeterministicSimulation("world", 0);
    for (const delta of [-1, NaN, Infinity, 2]) expect(() => clock.advanceProjection(delta, () => {})).toThrow("PROJECTION_DELTA_INVALID");
    expect(clock.tick).toBe(0);
    const random = seededRandom("bounded");
    for (let i = 0; i < 1000; i++) { const value = random(); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1); }
  });

  it("forbids implicit randomness and wall-clock calls in migrated source, ignoring comments", () => {
    const violations: string[] = [];
    const scan = (directory: string) => {
      for (const file of readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, file.name);
        if (file.isDirectory()) { scan(filename); continue; }
        if (!/\.tsx?$/.test(file.name) || /\.test\./.test(file.name)) continue;
        const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const visit = (node: ts.Node) => {
          if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const target = node.expression.expression.getText(source);
            const name = node.expression.name.text;
            if ((target === "Math" && name === "random") || (target === "Date" && name === "now")) violations.push(`${filename}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
          }
          if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) violations.push(`${filename}:implicit-wall-clock`);
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    };
    scan("client/src/xaurion");
    expect(violations).toEqual([]);
  });
});
