import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");
const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

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

  it("presents companion movement and abilities only from the authoritative callback", () => {
    const callback = section(sceneSource, "  const onAuthoritativeAction = ", "  const onLoadEncounter = ");
    expect(callback).toContain("presentAuthoritativeEchoMovement");
    expect(callback).toContain("presentAuthoritativeEchoAbility");
    expect(homeSource).toContain("source: detail.source, origin: detail.origin");
  });

  it("keeps unmodelled status effects out of client truth", () => {
    expect(sceneSource).not.toContain("const runEchoAbility =");
    const presentation = section(sceneSource, "  const presentAuthoritativeEchoAbility = ", "  const emitZoneMovementState = ");
    expect(presentation).not.toMatch(/shieldTime\s*=|markTime\s*=|explorerHp\s*=|echoHp\s*=|nextEnemyStrike\s*\+=/);
  });
});
