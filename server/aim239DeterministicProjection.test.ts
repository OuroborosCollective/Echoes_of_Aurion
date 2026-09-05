import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DeterministicSimulation, seededRandom } from "../shared/deterministicSimulation";
import { MobManager } from "../client/src/xaurion/entities/MobManager";
import { LootDropManager } from "../client/src/xaurion/entities/LootDropManager";
import { GenkitAdapter } from "../client/src/xaurion/adapters/GenkitAdapter";

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
