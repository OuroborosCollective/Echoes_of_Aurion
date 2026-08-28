from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}")
    file.write_text(text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{path}: start marker missing: {start}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{path}: end marker missing: {end}")
    if text.find(start, start_index + len(start)) >= 0:
        raise SystemExit(f"{path}: start marker is not unique: {start}")
    file.write_text(text[:start_index] + replacement + text[end_index:])


replace_once(
    "client/src/pages/Home.tsx",
    'import { COMPANION_FRAME_MAX_AGE_MS, type CompanionSession } from "@shared/companionLearningProtocol";',
    'import { COMPANION_FRAME_MAX_AGE_MS, type CompanionCommandOrigin, type CompanionSession } from "@shared/companionLearningProtocol";',
)
replace_once(
    "client/src/pages/Home.tsx",
    '      const detail = (event as CustomEvent<{ command: Command; source: "human" | "gateway" }>).detail;',
    '      const detail = (event as CustomEvent<{ command: Command; source: "human" | "gateway"; origin?: CompanionCommandOrigin }>).detail;',
)
replace_once(
    "client/src/pages/Home.tsx",
    '          window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { command: detail.command, damage: result.damage, bossHp: result.bossHp, completed: result.completed } }));',
    '          window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { command: detail.command, source: detail.source, origin: detail.origin, damage: result.damage, bossHp: result.bossHp, completed: result.completed } }));',
)

replace_once(
    "client/src/game/scene.ts",
    '''  const requestAction = (command: CommandCode, source: "human" | "gateway"): void => {
    if (!started || transitioning || victory || awaitingQuest || sentinelHp <= 0) return;
    window.dispatchEvent(new CustomEvent("aurion:request-action", { detail: { command, source } }));
  };
''',
    '''  const requestAction = (command: CommandCode, source: "human" | "gateway", origin?: CompanionCommandOrigin): void => {
    if (!started || transitioning || victory || awaitingQuest || sentinelHp <= 0) return;
    window.dispatchEvent(new CustomEvent("aurion:request-action", { detail: { command, source, origin } }));
  };
''',
)

replace_between(
    "client/src/game/scene.ts",
    "  const runEchoAbility = ",
    "  const emitZoneMovementState = ",
    '''  const presentAuthoritativeEchoAbility = (code: CommandCode): void => {
    const arena = arenas[arenaIndex];
    echoActionUntil = elapsed + 0.44;
    if (code === "1") echoTarget = sentinel.root.position.add(new Vector3(-1.1, 0, 1.1));
    createPulse(echo.position.add(new Vector3(0, 0.35, 0)), arena.glow, code === "9" ? 1.15 : 0.72);
    emitGameEvent("combat", `Echo-Impuls ${code} wurde durch das serverseitige Aktionsreceipt bestätigt.`);
  };
  const presentAuthoritativeEchoMovement = (code: CommandCode): void => {
    const movement = 1.2;
    if (code === "W") echoTarget.z -= movement;
    if (code === "S") echoTarget.z += movement;
    if (code === "A") echoTarget.x -= movement;
    if (code === "D") echoTarget.x += movement;
    echoTarget.x = Math.max(-5.7, Math.min(5.7, echoTarget.x));
    echoTarget.z = Math.max(-5.2, Math.min(5.2, echoTarget.z));
    echoActionUntil = elapsed + 0.18;
    const surface: AudioSurface = openWorldActive ? "grass" : dungeonActive ? "stone" : "wood";
    emitGameEvent("command", `Echo Scout bestätigt den serverautorisierten Kurs ${code}.`, { cue: `movement.footstep.${surface}`, category: "movement", surface });
  };
''',
)

replace_between(
    "client/src/game/scene.ts",
    "  const onCommand = ",
    "  const onStart = ",
    '''  const onCommand = (event: Event): void => {
    const detail = (event as CustomEvent<{ code?: CommandCode; origin?: CompanionCommandOrigin }>).detail;
    const code = detail?.code;
    const origin = detail?.origin ?? "gateway";
    if (!code || !/^[WASDEF1-9]$/.test(code) || !started || victory) return;
    if (companionCommandRequiresSpawn(origin) && !companionSpawned) return;
    if (code === "E" && requestNpcInteraction()) return;
    requestAction(code, companionGameplayActionSource(origin), origin);
  };
''',
)

replace_between(
    "client/src/game/scene.ts",
    "  const onAuthoritativeAction = ",
    "  const onLoadEncounter = ",
    '''  const onAuthoritativeAction = (event: Event): void => {
    const detail = (event as CustomEvent<{ damage: number; bossHp: number; command: CommandCode; source?: "human" | "gateway"; origin?: CompanionCommandOrigin; completed: boolean }>).detail;
    if (!detail) return;
    const source = detail.source ?? "gateway";
    const companionOrigin = detail.origin === "gateway" || detail.origin === "human_team" || detail.origin === "local_console";
    if (companionOrigin && /^[WASD]$/.test(detail.command)) presentAuthoritativeEchoMovement(detail.command);
    if (companionOrigin && /^[1-9]$/.test(detail.command)) presentAuthoritativeEchoAbility(detail.command);
    if (detail.command === "F") {
      if (source === "human" && !companionOrigin) explorerAttackUntil = elapsed + 0.34;
      else echoActionUntil = elapsed + 0.34;
    }
    if (detail.command === "E") emitGameEvent("command", "Die Interaktion wurde durch den serverseitigen Aktionspfad bestätigt.");
    if (detail.damage > 0) {
      const explorerStrike = detail.command === "F" && source === "human" && !companionOrigin;
      applyAuthoritativeDamage(detail.damage, detail.bossHp, explorerStrike ? "Speersignal des Explorers" : `Echo-Impuls ${detail.command}`, arenas[arenaIndex].glow);
      emitAudioCue({ cue: explorerStrike ? "combat.attack.pointed" : "combat.magic", category: "combat", ...(explorerStrike ? { weapon: "pointed" } : { element: "resonance" }) } as AudioEvent);
      if (detail.completed) emitAudioCue({ cue: "combat.creature.monster.death", category: "combat", creature: "monster", action: "death" });
    } else emitState(true);
  };
''',
)

Path("client/src/game/sceneCompanionAuthority.test.ts").write_text('''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(new URL("./scene.ts", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing source markers: ${start} / ${end}`);
  return source.slice(from, to);
}

describe("companion gameplay authority boundary", () => {
  it("does not mutate combat or movement state before an action receipt", () => {
    const commandHandler = section(sceneSource, "  const onCommand = ", "  const onStart = ");
    expect(commandHandler).toContain("requestAction(");
    expect(commandHandler).not.toMatch(/shieldTime|markTime|explorerHp|echoHp|nextEnemyStrike|echoTarget\./);
  });

  it("presents echo movement and abilities only from the authoritative callback", () => {
    const callback = section(sceneSource, "  const onAuthoritativeAction = ", "  const onLoadEncounter = ");
    expect(callback).toContain("presentAuthoritativeEchoMovement");
    expect(callback).toContain("presentAuthoritativeEchoAbility");
    expect(homeSource).toContain("source: detail.source, origin: detail.origin");
  });

  it("keeps unmodelled status effects out of the client command path", () => {
    expect(sceneSource).not.toContain("const runEchoAbility =");
    const presentation = section(sceneSource, "  const presentAuthoritativeEchoAbility = ", "  const emitZoneMovementState = ");
    expect(presentation).not.toMatch(/shieldTime\s*=|markTime\s*=|explorerHp\s*=|echoHp\s*=|nextEnemyStrike\s*\+=/);
  });
});
''')

Path(".github/workflows/companion-learning-proof.yml").write_text('''name: Companion learning causality proof

on:
  pull_request:
    paths:
      - "client/src/components/GameCanvas.tsx"
      - "client/src/game/scene.ts"
      - "client/src/game/sceneCompanionAuthority.test.ts"
      - "client/src/lib/companionFrameCapture.ts"
      - "client/src/lib/companionFrameCapture.test.ts"
      - "client/src/lib/companionLearning.ts"
      - "client/src/lib/companionLearning.test.ts"
      - "client/src/pages/Home.tsx"
      - "server/companionMemory.ts"
      - "server/companionMemory.test.ts"
      - "server/routers.ts"
      - "shared/companionLearningProtocol.ts"
      - ".github/workflows/companion-learning-proof.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  prove:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.4.1
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Type contract
        run: pnpm check
      - name: Focused Companion contracts
        run: pnpm test -- client/src/companionLearningProtocol.test.ts client/src/lib/companionLearning.test.ts client/src/lib/companionFrameCapture.test.ts client/src/game/sceneCompanionAuthority.test.ts server/companionMemory.test.ts
      - name: Full regression suite
        run: pnpm test
      - name: Production bundle
        run: pnpm build
      - name: Diff whitespace
        run: git diff --check
''')

Path("scripts/_apply_companion_authority_receipt_patch.py").unlink()
Path(".github/workflows/_companion-authority-receipt-repair.yml").unlink()
