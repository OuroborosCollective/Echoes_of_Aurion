import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  computeRngRootHash,
  resolveAddressableRandomU32,
  type RNGContext,
  type RngEventRecord,
} from "./aurionAddressableRandom";

const base: RNGContext = {
  worldSeedDigest: "sha256:world-seed-fixture",
  rulesetVersion: "aurion.zone.rules.v2",
  tick: 42,
  systemId: "aurion.zone.combat",
  entityId: "player:7",
  eventId: "observatory_threshold:player:7->mob_12:seq:42001",
  purpose: "combat.hit",
  drawIndex: 0,
};

function productionTsFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...productionTsFiles(file));
    else if (/\.tsx?$/.test(file) && !/\.(test|spec)\./.test(file)) out.push(file);
  }
  return out;
}

function isGameplayCandidatePath(file: string): boolean {
  return [
    "server/zone",
    "server/wasd",
    "server/world",
    "server/quest",
    "server/npc",
    "server/endgame",
    "server/combat",
    "server/loot",
    "server/gameplay",
    "server/determinism",
    "server/causality",
  ].some(prefix => file.startsWith(prefix));
}

describe("Aurion addressable RNG v2", () => {
  it("returns the same U32 for the same complete causal address", () => {
    expect(resolveAddressableRandomU32(base)).toBe(resolveAddressableRandomU32({ ...base }));
  });

  it("separates purpose and draw index without depending on call order", () => {
    const hit = resolveAddressableRandomU32(base);
    const crit = resolveAddressableRandomU32({ ...base, purpose: "combat.crit", drawIndex: 1 });
    const damage = resolveAddressableRandomU32({ ...base, purpose: "combat.damage", drawIndex: 2 });
    expect(new Set([hit, crit, damage]).size).toBe(3);

    const before = resolveAddressableRandomU32(base);
    resolveAddressableRandomU32({ ...base, entityId: "unrelated", eventId: "foreign-event", purpose: "foreign", drawIndex: 99 });
    expect(resolveAddressableRandomU32(base)).toBe(before);
  });

  it("changes when tick, entity, event, purpose or draw index changes", () => {
    const original = resolveAddressableRandomU32(base);
    const variants = [
      { ...base, tick: base.tick + 1 },
      { ...base, entityId: "player:8" },
      { ...base, eventId: base.eventId + ":other" },
      { ...base, purpose: "combat.crit" },
      { ...base, drawIndex: 1 },
    ];
    for (const variant of variants) expect(resolveAddressableRandomU32(variant)).not.toBe(original);
  });

  it("keeps the RNG receipt root independent from emission order", () => {
    const events: RngEventRecord[] = [
      { systemId: base.systemId, entityId: base.entityId, eventId: base.eventId, purpose: "combat.hit", drawIndex: 0, u32: resolveAddressableRandomU32(base) },
      { systemId: base.systemId, entityId: base.entityId, eventId: base.eventId, purpose: "combat.crit", drawIndex: 1, u32: resolveAddressableRandomU32({ ...base, purpose: "combat.crit", drawIndex: 1 }) },
    ];
    expect(computeRngRootHash(events)).toBe(computeRngRootHash([...events].reverse()));
  });

  it("fails closed on incomplete causal addresses", () => {
    expect(() => resolveAddressableRandomU32({ ...base, systemId: "" })).toThrow("AURION_RNG_CONTEXT_INVALID");
    expect(() => resolveAddressableRandomU32({ ...base, eventId: "" })).toThrow("AURION_RNG_CONTEXT_INVALID");
    expect(() => resolveAddressableRandomU32({ ...base, drawIndex: -1 })).toThrow("AURION_RNG_DRAW_INDEX_INVALID");
  });

  it("inventories every production-server sequential/random call site", () => {
    const violations: string[] = [];
    const classifiedSequentialReference = "server/wasdAREDeterminism.ts";
    for (const file of productionTsFiles("server")) {
      const sourceText = readFileSync(file, "utf8");
      const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "Math.random")
          violations.push(`${file}:Math.random`);
        if (ts.isNewExpression(node) && node.expression.getText(source) === "SeededARERng" && file !== classifiedSequentialReference)
          violations.push(`${file}:new SeededARERng`);
        if (
          isGameplayCandidatePath(file) &&
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "nextFloat" &&
          file !== classifiedSequentialReference
        ) violations.push(`${file}:nextFloat`);
        if (
          isGameplayCandidatePath(file) &&
          ts.isCallExpression(node) &&
          ((ts.isIdentifier(node.expression) && node.expression.text === "random") ||
            (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "random"))
        ) violations.push(`${file}:random()`);
        ts.forEachChild(node, visit);
      };
      visit(source);

      if (file !== classifiedSequentialReference && sourceText.includes("SeededARERng"))
        violations.push(`${file}:SeededARERng token`);
    }
    expect(violations).toEqual([]);

    const inventory = JSON.parse(readFileSync("architecture/rng-inventory.json", "utf8"));
    expect(inventory.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "server/zoneRuntime.ts", classification: "GAMEPLAY_AUTHORITY" }),
      expect.objectContaining({ path: classifiedSequentialReference, classification: "UNUSED_DONOR_REFERENCE", runtimeRequired: false }),
      expect.objectContaining({ path: "client/src/xaurion/integration/aurionWorldCore.ts", classification: "PROJECTION_ONLY" }),
    ]));
  });
});
