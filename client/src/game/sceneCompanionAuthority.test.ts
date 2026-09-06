import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sceneSource = read("client/src/game/scene.ts");
const homeSource = read("client/src/pages/Home.tsx");
const runtimeSource = read("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx");
const companionSource = read("client/src/xaurion/integration/Ax1CompanionOverlay.tsx");

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing source markers: ${start} / ${end}`);
  return source.slice(from, to);
}

describe("companion gameplay authority boundary", () => {
  it("does not mutate movement, health, shield, mark or combat cadence before a receipt", () => {
    const commandHandler = section(sceneSource, "  const onCommand = ", "  const onEnterDungeon = ");
    expect(commandHandler).toContain("requestAction(");
    expect(commandHandler).not.toMatch(/shieldTime|markTime|explorerHp|echoHp|nextEnemyStrike|echoTarget\./);
  });

  it("keeps the Aurion website out of companion gameplay and records only AX1 world inputs", () => {
    const callback = section(sceneSource, "  const onAuthoritativeAction = ", "  const onLoadEncounter = ");
    expect(callback).toContain("presentAuthoritativeEchoMovement");
    expect(callback).toContain("presentAuthoritativeEchoAbility");
    expect(homeSource).not.toContain("aurion:authoritative-action");
    expect(homeSource).not.toContain("source: detail.source, origin: detail.origin");
    expect(homeSource).not.toContain("gameplay.act");
    expect(runtimeSource).toContain("WORLD_DEMONSTRATION_EVENT");
    expect(runtimeSource).toContain("requestAuthoritativeAction");
    expect(companionSource).toContain("WORLD_DEMONSTRATION_EVENT");
    expect(companionSource).toContain("queueHumanDemonstration");
    expect(companionSource).toContain("requestCompanionFrame");
  });

  it("keeps unmodelled status effects out of client truth", () => {
    expect(sceneSource).not.toContain("const runEchoAbility =");
    const presentation = section(sceneSource, "  const presentAuthoritativeEchoAbility = ", "  const emitZoneMovementState = ");
    expect(presentation).not.toMatch(/shieldTime\s*=|markTime\s*=|explorerHp\s*=|echoHp\s*=|nextEnemyStrike\s*\+=/);
  });
});
