from pathlib import Path

def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    file.write_text(text.replace(old, new, 1))

helper = '''import {
  COMPANION_FEATURE_VECTOR_LENGTH,
  COMPANION_FRAME_MAX_AGE_MS,
} from "@shared/companionLearningProtocol";

export type CompanionFrameSample = Readonly<{
  frameDataUrl: string;
  featureVector: readonly number[];
  capturedAt: number;
}>;

export function extractCompanionFrameFeatures(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): number[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || rgba.length !== width * height * 4) {
    throw new Error("Companion frame buffer is invalid");
  }
  const features: number[] = [];
  const cellWidth = width / 4;
  const cellHeight = height / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const startX = Math.floor(column * cellWidth);
      const endX = Math.max(startX + 1, Math.floor((column + 1) * cellWidth));
      const startY = Math.floor(row * cellHeight);
      const endY = Math.max(startY + 1, Math.floor((row + 1) * cellHeight));
      let total = 0;
      let samples = 0;
      for (let y = startY; y < Math.min(height, endY); y += 2) {
        for (let x = startX; x < Math.min(width, endX); x += 2) {
          const offset = (y * width + x) * 4;
          total += (0.299 * rgba[offset]! + 0.587 * rgba[offset + 1]! + 0.114 * rgba[offset + 2]!) / 255;
          samples += 1;
        }
      }
      features.push(samples ? total / samples : 0.5);
    }
  }
  return features;
}

export async function createCompanionFrameSample(frameDataUrl: string, capturedAt = Date.now()): Promise<CompanionFrameSample> {
  if (!frameDataUrl.startsWith("data:image/")) throw new Error("Companion frame must be an image data URL");
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error("Companion frame decode failed"));
    candidate.src = frameDataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, image.naturalWidth || image.width);
  canvas.height = Math.max(4, image.naturalHeight || image.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Companion frame scratch canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    frameDataUrl,
    featureVector: extractCompanionFrameFeatures(pixels.data, pixels.width, pixels.height),
    capturedAt,
  };
}

export function isFreshCompanionFrame(
  sample: CompanionFrameSample | null,
  now = Date.now(),
  maximumAgeMs = COMPANION_FRAME_MAX_AGE_MS,
): sample is CompanionFrameSample {
  return Boolean(
    sample
    && Number.isFinite(sample.capturedAt)
    && sample.featureVector.length === COMPANION_FEATURE_VECTOR_LENGTH
    && now >= sample.capturedAt
    && now - sample.capturedAt <= maximumAgeMs,
  );
}
'''
Path("client/src/lib/companionFrameCapture.ts").write_text(helper)

helper_test = '''import { describe, expect, it } from "vitest";
import { extractCompanionFrameFeatures, isFreshCompanionFrame } from "./companionFrameCapture";

describe("companion frame capture", () => {
  it("extracts one deterministic luminance feature per 4x4 cell", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1) {
      const value = index * 16;
      const offset = index * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
    const features = extractCompanionFrameFeatures(pixels, 4, 4);
    expect(features).toHaveLength(16);
    expect(features[0]).toBeCloseTo(0);
    expect(features[15]).toBeCloseTo(240 / 255);
  });

  it("rejects stale or malformed samples", () => {
    const sample = {
      frameDataUrl: "data:image/png;base64,AA==",
      featureVector: new Array(16).fill(0.5),
      capturedAt: 1_000,
    } as const;
    expect(isFreshCompanionFrame(sample, 2_000, 1_250)).toBe(true);
    expect(isFreshCompanionFrame(sample, 2_251, 1_250)).toBe(false);
    expect(isFreshCompanionFrame({ ...sample, featureVector: [0.5] }, 1_100, 1_250)).toBe(false);
  });

  it("fails closed for invalid frame buffers", () => {
    expect(() => extractCompanionFrameFeatures(new Uint8ClampedArray(3), 4, 4)).toThrow();
  });
});
'''
Path("client/src/lib/companionFrameCapture.test.ts").write_text(helper_test)

protocol_test = '''import { describe, expect, it } from "vitest";
import {
  companionCommandRequiresSpawn,
  companionGameplayActionSource,
} from "./companionLearningProtocol";

describe("companion command causality", () => {
  it("requires a spawned companion only for paired gateway commands", () => {
    expect(companionCommandRequiresSpawn("gateway")).toBe(true);
    expect(companionCommandRequiresSpawn("human_team")).toBe(false);
    expect(companionCommandRequiresSpawn("local_console")).toBe(false);
  });

  it("keeps human and gateway receipt sources distinct", () => {
    expect(companionGameplayActionSource("gateway")).toBe("gateway");
    expect(companionGameplayActionSource("human_team")).toBe("human");
    expect(companionGameplayActionSource("local_console")).toBe("human");
  });
});
'''
Path("shared/companionLearningProtocol.test.ts").write_text(protocol_test)

proof = '''name: Companion learning causality proof

on:
  pull_request:
    paths:
      - "client/src/components/GameCanvas.tsx"
      - "client/src/game/scene.ts"
      - "client/src/lib/companionFrameCapture.ts"
      - "client/src/lib/companionFrameCapture.test.ts"
      - "client/src/lib/companionLearning.ts"
      - "client/src/lib/companionLearning.test.ts"
      - "client/src/pages/Home.tsx"
      - "shared/companionLearningProtocol.ts"
      - "shared/companionLearningProtocol.test.ts"
      - ".github/workflows/companion-learning-proof.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  prove:
    runs-on: ubuntu-latest
    timeout-minutes: 25
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
      - name: Focused companion regressions
        run: pnpm test -- client/src/lib/companionLearning.test.ts client/src/lib/companionFrameCapture.test.ts shared/companionLearningProtocol.test.ts
      - name: Production bundle
        run: pnpm build
      - name: Diff whitespace
        run: git diff --check
'''
Path(".github/workflows/companion-learning-proof.yml").write_text(proof)

replace_once(
    "client/src/components/GameCanvas.tsx",
    'engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: true });',
    'engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: true, preserveDrawingBuffer: true });',
)

replace_once(
    "client/src/pages/Home.tsx",
    'import { companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession } from "@/lib/companionLearning";\nimport type { CompanionSession } from "@shared/companionLearningProtocol";',
    'import { companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession, type CompanionAction, type CompanionStateMask, type CompanionStateVector } from "@/lib/companionLearning";\nimport { createCompanionFrameSample, isFreshCompanionFrame } from "@/lib/companionFrameCapture";\nimport { COMPANION_FRAME_MAX_AGE_MS, type CompanionCommandOrigin, type CompanionSession } from "@shared/companionLearningProtocol";',
)
replace_once(
    "client/src/pages/Home.tsx",
    'type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "quest_ready" | "dungeon_ready" | "victory" };',
    'type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "quest_ready" | "dungeon_ready" | "victory" };\ntype PendingCompanionAction = Readonly<{ action: CompanionAction; command: Command; capturedAt: number }>;',
)
replace_once(
    "client/src/pages/Home.tsx",
    '''function codeFromText(value: string): Command | null {
  const candidate = value.trim().toUpperCase();
  return /^[WASDEF1-9]$/.test(candidate) ? (candidate as Command) : null;
}
''',
    '''function codeFromText(value: string): Command | null {
  const candidate = value.trim().toUpperCase();
  return /^[WASDEF1-9]$/.test(candidate) ? (candidate as Command) : null;
}

function missionPhaseSignal(phase: MissionState["phase"]): number {
  return ({ active: 0, transition: 0.25, quest_ready: 0.5, dungeon_ready: 0.75, victory: 1 } as const)[phase];
}

function dispatchCompanionCommand(code: Command, origin: CompanionCommandOrigin, causality: Record<string, string | number> = {}): void {
  window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code, origin, ...causality } }));
}
''',
)
replace_once(
    "client/src/pages/Home.tsx",
    '  const lastCompanionAction = useRef<[number, number, number, number] | undefined>(undefined);',
    '  const lastCompanionAction = useRef<PendingCompanionAction | null>(null);\n  const companionCaptureInFlight = useRef(false);',
)
old_capture = '''  useEffect(() => {
    if (companionSession?.mode !== "learning") return;
    const timer = window.setInterval(() => {
      const canvas = document.querySelector("canvas.game-canvas") as HTMLCanvasElement | null;
      if (!canvas || canvas.width < 4 || canvas.height < 4) return;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const features: number[] = [];
      const cellWidth = Math.max(1, Math.floor(canvas.width / 4));
      const cellHeight = Math.max(1, Math.floor(canvas.height / 4));
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        let total = 0; let samples = 0;
        for (let y = row * cellHeight; y < Math.min(canvas.height, (row + 1) * cellHeight); y += 8) for (let x = column * cellWidth; x < Math.min(canvas.width, (column + 1) * cellWidth); x += 8) {
          const offset = (y * canvas.width + x) * 4;
          total += (0.299 * image.data[offset]! + 0.587 * image.data[offset + 1]! + 0.114 * image.data[offset + 2]!) / 255;
          samples += 1;
        }
        features.push(samples ? total / samples : 0.5);
      }
      const row = recordCompanionObservation({
        frameDataUrl: canvas.toDataURL("image/webp", 0.55),
        featureVector: features,
        action: lastCompanionAction.current,
        stateVector: [mission.explorerHp / 100, mission.echoHp / 100, mission.sentinelHp / Math.max(1, mission.sentinelMaxHp), mission.shield ? 1 : 0, mission.marked ? 1 : 0],
        stateMask: [1, 1, 1, 1, 1, 1] as [1, 1, 1, 1, 1, 1],
        note: `Beobachtung in ${mission.arenaName}: ${mission.objective}`,
      });
      if (row) void persistCompanionObservation.mutateAsync({ sessionId: row.session_id, sequenceIndex: row.sequence_index, timestampEpoch: row.timestamp_epoch, sampleId: row.sample_id, featureVector: row.feature_vector, targetAction: row.target_action_chunk[0], stateVector: row.state_vector, stateMask: row.state_mask as Array<0 | 1>, note: row.note }).catch(() => undefined);
    }, 400);
    return () => window.clearInterval(timer);
  }, [companionSession?.mode, mission, persistCompanionObservation]);
'''
new_capture = '''  useEffect(() => {
    if (companionSession?.mode !== "learning") {
      lastCompanionAction.current = null;
      return;
    }
    const timer = window.setInterval(() => {
      const pending = lastCompanionAction.current;
      if (!pending || companionCaptureInFlight.current) return;
      if (Date.now() - pending.capturedAt > COMPANION_FRAME_MAX_AGE_MS) {
        if (lastCompanionAction.current === pending) lastCompanionAction.current = null;
        setLastSignal("Learn/Record hat ein veraltetes Aktionslabel verworfen.");
        return;
      }
      const canvas = document.querySelector("canvas.game-canvas") as HTMLCanvasElement | null;
      if (!canvas || canvas.width < 4 || canvas.height < 4) return;
      companionCaptureInFlight.current = true;
      const frameCapturedAt = Date.now();
      void createCompanionFrameSample(canvas.toDataURL("image/webp", 0.55), frameCapturedAt)
        .then(async (sample) => {
          if (!isFreshCompanionFrame(sample)) throw new Error("Companion frame became stale before binding");
          const stateVector: CompanionStateVector = [
            mission.explorerHp / 100,
            mission.echoHp / 100,
            mission.sentinelHp / Math.max(1, mission.sentinelMaxHp),
            mission.shield ? 1 : 0,
            mission.marked ? 1 : 0,
            missionPhaseSignal(mission.phase),
          ];
          const stateMask: CompanionStateMask = [1, 1, 1, 1, 1, 1];
          const row = recordCompanionObservation({
            frameDataUrl: sample.frameDataUrl,
            featureVector: [...sample.featureVector],
            action: pending.action,
            stateVector,
            stateMask,
            capturedAt: sample.capturedAt,
            note: `Menschlicher Befehl ${pending.command} in ${mission.arenaName}: ${mission.objective}`,
          });
          if (!row) throw new Error("Companion observation contract rejected the sample");
          if (lastCompanionAction.current === pending) lastCompanionAction.current = null;
          try {
            await persistCompanionObservation.mutateAsync({
              sessionId: row.session_id,
              sequenceIndex: row.sequence_index,
              timestampEpoch: row.timestamp_epoch,
              sampleId: row.sample_id,
              featureVector: row.feature_vector,
              targetAction: row.target_action_chunk[0],
              stateVector: row.state_vector,
              stateMask: row.state_mask,
              note: row.note,
            });
          } catch (error) {
            console.warn("[Aurion Companion] Server memory persistence failed; local evidence remains available", error);
            setLastSignal("Die Demonstration ist lokal gesichert, aber der serverseitige Memory-Readback fehlt noch.");
          }
        })
        .catch((error) => {
          console.warn("[Aurion Companion] Frame/action binding failed closed", error);
          setLastSignal("Learn/Record konnte Bild und Aktion nicht sicher binden; die Probe wurde verworfen.");
        })
        .finally(() => {
          companionCaptureInFlight.current = false;
        });
    }, 400);
    return () => window.clearInterval(timer);
  }, [companionSession?.mode, mission, persistCompanionObservation]);
'''
replace_once("client/src/pages/Home.tsx", old_capture, new_capture)
replace_once(
    "client/src/pages/Home.tsx",
    """      processedGatewaySequence.current = entry.sequence;
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));""",
    """      processedGatewaySequence.current = entry.sequence;
      dispatchCompanionCommand(entry.command as Command, "gateway", { gatewaySessionId: gatewayPairing?.sessionId ?? "unpaired", sequence: entry.sequence });""",
)
replace_once(
    "client/src/pages/Home.tsx",
    """      processedTeamSignals.current.add(entry.id);
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));""",
    """      processedTeamSignals.current.add(entry.id);
      dispatchCompanionCommand(entry.command as Command, "human_team", { teamSignalId: entry.id });""",
)
replace_once(
    "client/src/pages/Home.tsx",
    '          window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { command: detail.command, damage: result.damage, bossHp: result.bossHp, completed: result.completed } }));',
    '          window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { command: detail.command, source: detail.source, damage: result.damage, bossHp: result.bossHp, completed: result.completed } }));',
)
replace_once(
    "client/src/pages/Home.tsx",
    '    window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code } }));',
    '    dispatchCompanionCommand(code, "local_console");',
)
replace_once(
    "client/src/pages/Home.tsx",
    '''  const sendHumanCommand = (code: "W" | "A" | "S" | "D"): void => {
    const coordinates: Record<string, [number, number]> = { W: [0.5, 0.25], A: [0.25, 0.5], S: [0.5, 0.75], D: [0.75, 0.5] };
    const [x, y] = coordinates[code];
    lastCompanionAction.current = [x, y, 1, 1];
    window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } }));
  };
  const sendHumanAction = (code: "F" | "E" = "F"): void => { lastCompanionAction.current = [0.5, 0.5, 1, 1]; window.dispatchEvent(new CustomEvent("aurion:human-action", { detail: { code } })); setLastSignal(code === "F" ? "Explorer fordert ein Speersignal an." : "Explorer fordert eine Interaktion an."); };
''',
    '''  const sendHumanCommand = (code: "W" | "A" | "S" | "D"): void => {
    const coordinates: Record<string, [number, number]> = { W: [0.5, 0.25], A: [0.25, 0.5], S: [0.5, 0.75], D: [0.75, 0.5] };
    const [x, y] = coordinates[code];
    if (companionSession?.mode === "learning") lastCompanionAction.current = { action: [x, y, 1, 1], command: code, capturedAt: Date.now() };
    window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } }));
  };
  const sendHumanAction = (code: "F" | "E" = "F"): void => {
    if (companionSession?.mode === "learning") lastCompanionAction.current = { action: [0.5, 0.5, 1, 1], command: code, capturedAt: Date.now() };
    window.dispatchEvent(new CustomEvent("aurion:human-action", { detail: { code } }));
    setLastSignal(code === "F" ? "Explorer fordert ein Speersignal an." : "Explorer fordert eine Interaktion an.");
  };
''',
)
replace_once(
    "client/src/pages/Home.tsx",
    '''  const beginCompanionLearn = (): void => {
    if (!companionSession) { setLastSignal("Verbinde zuerst ein LLM, bevor die Lernaufzeichnung startet."); return; }
    try {
''',
    '''  const beginCompanionLearn = (): void => {
    if (!companionSession) { setLastSignal("Verbinde zuerst ein LLM, bevor die Lernaufzeichnung startet."); return; }
    lastCompanionAction.current = null;
    try {
''',
)

replace_once(
    "client/src/game/scene.ts",
    'import type { AudioEvent, AudioSurface } from "@shared/audioProtocol";',
    'import type { AudioEvent, AudioSurface } from "@shared/audioProtocol";\nimport { companionCommandRequiresSpawn, companionGameplayActionSource, type CompanionCommandOrigin } from "@shared/companionLearningProtocol";',
)
replace_once(
    "client/src/game/scene.ts",
    'type CommandCode = "W" | "A" | "S" | "D" | "E" | "F" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";',
    'type CommandCode = "W" | "A" | "S" | "D" | "E" | "F" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";\ntype CompanionCommandDetail = { code?: CommandCode; origin?: CompanionCommandOrigin; sequence?: number; gatewaySessionId?: string; teamSignalId?: string };',
)
old_ability = '''  const runEchoAbility = (code: CommandCode): void => {
    const arena = arenas[arenaIndex];
    echoActionUntil = elapsed + 0.44;
    if (code === "1") { echoTarget = sentinel.root.position.add(new Vector3(-1.1, 0, 1.1)); requestAction(code, "gateway"); return; }
    if (code === "2" || code === "6") { shieldTime = Math.max(shieldTime, code === "6" ? 5.2 : 3.7); createPulse(explorer.position, arena.glow, 0.9); emitGameEvent("combat", code === "6" ? "Aegis-Knoten schützt das gesamte Team." : "Echoschild fängt den nächsten Impuls ab."); emitState(true); return; }
    if (code === "3") { echoHp = Math.min(100, echoHp + 8); explorerHp = Math.min(100, explorerHp + 6); markTime = Math.max(markTime, 3.4); createPulse(echo.position, arena.glow, 0.82); emitGameEvent("combat", "Sternenfaden stabilisiert das Team und markiert den Sentinel."); emitState(true); return; }
    if (code === "4") { markTime = Math.max(markTime, 5.1); createPulse(sentinel.root.position, Color3.FromHexString("#75A8FF"), 1); emitGameEvent("combat", "Kartenblick legt eine verwundbare Resonanzlinie offen."); emitState(true); return; }
    if (code === "5") { requestAction(code, "gateway"); return; }
    if (code === "7") { markTime = Math.max(markTime, 6.2); nextEnemyStrike += 2.4; requestAction(code, "gateway"); return; }
    if (code === "8") { requestAction(code, "gateway"); return; }
    if (code === "9") { requestAction(code, "gateway"); return; }
  };
'''
new_ability = '''  const presentAuthoritativeEchoAbility = (code: CommandCode): void => {
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
'''
replace_once("client/src/game/scene.ts", old_ability, new_ability)
old_command = '''  const onCommand = (event: Event): void => {
    const code = (event as CustomEvent<{ code: CommandCode }>).detail.code; if (!started || victory || !companionSpawned) return;
    const movement = 1.2;
    if (code === "W") echoTarget.z -= movement; if (code === "S") echoTarget.z += movement; if (code === "A") echoTarget.x -= movement; if (code === "D") echoTarget.x += movement;
    echoTarget.x = Math.max(-5.7, Math.min(5.7, echoTarget.x)); echoTarget.z = Math.max(-5.2, Math.min(5.2, echoTarget.z));
    if (/^[1-9]$/.test(code)) runEchoAbility(code); else if (code === "E" && requestNpcInteraction()) return; else if (code === "F" || code === "E") requestAction(code, "gateway"); else {
      requestAction(code, "gateway");
      const surface: AudioSurface = openWorldActive ? "grass" : dungeonActive ? "stone" : "wood";
      emitGameEvent("command", `Echo Scout bestätigt Kurs ${code}.`, { cue: `movement.footstep.${surface}`, category: "movement", surface });
    }
  };
'''
new_command = '''  const onCommand = (event: Event): void => {
    const detail = (event as CustomEvent<CompanionCommandDetail>).detail;
    const code = detail?.code;
    const origin = detail?.origin ?? "gateway";
    if (!code || !/^[WASDEF1-9]$/.test(code) || !started || victory) return;
    if (companionCommandRequiresSpawn(origin) && !companionSpawned) return;
    if (code === "E" && requestNpcInteraction()) return;
    requestAction(code, companionGameplayActionSource(origin));
  };
'''
replace_once("client/src/game/scene.ts", old_command, new_command)
old_authoritative = '''  const onAuthoritativeAction = (event: Event): void => {
    const detail = (event as CustomEvent<{ damage: number; bossHp: number; command: CommandCode; completed: boolean }>).detail;
    if (!detail) return;
    if (detail.command === "F") explorerAttackUntil = elapsed + 0.34;
    if (detail.damage > 0) {
      applyAuthoritativeDamage(detail.damage, detail.bossHp, detail.command === "F" ? "Speersignal des Explorers" : `Echo-Impuls ${detail.command}`, arenas[arenaIndex].glow);
      emitAudioCue({ cue: detail.command === "F" ? "combat.attack.pointed" : "combat.magic", category: "combat", ...(detail.command === "F" ? { weapon: "pointed" } : { element: "resonance" }) } as AudioEvent);
      if (detail.completed) emitAudioCue({ cue: "combat.creature.monster.death", category: "combat", creature: "monster", action: "death" });
    } else emitState(true);
  };
'''
new_authoritative = '''  const onAuthoritativeAction = (event: Event): void => {
    const detail = (event as CustomEvent<{ damage: number; bossHp: number; command: CommandCode; source?: "human" | "gateway"; completed: boolean }>).detail;
    if (!detail) return;
    const source = detail.source ?? "gateway";
    if (/^[WASD]$/.test(detail.command)) presentAuthoritativeEchoMovement(detail.command);
    if (/^[1-9]$/.test(detail.command)) presentAuthoritativeEchoAbility(detail.command);
    if (detail.command === "F") {
      if (source === "human") explorerAttackUntil = elapsed + 0.34;
      else echoActionUntil = elapsed + 0.34;
    }
    if (detail.command === "E") emitGameEvent("command", "Die Interaktion wurde durch den serverseitigen Aktionspfad bestätigt.");
    if (detail.damage > 0) {
      const explorerStrike = detail.command === "F" && source === "human";
      applyAuthoritativeDamage(detail.damage, detail.bossHp, explorerStrike ? "Speersignal des Explorers" : `Echo-Impuls ${detail.command}`, arenas[arenaIndex].glow);
      emitAudioCue({ cue: explorerStrike ? "combat.attack.pointed" : "combat.magic", category: "combat", ...(explorerStrike ? { weapon: "pointed" } : { element: "resonance" }) } as AudioEvent);
      if (detail.completed) emitAudioCue({ cue: "combat.creature.monster.death", category: "combat", creature: "monster", action: "death" });
    } else emitState(true);
  };
'''
replace_once("client/src/game/scene.ts", old_authoritative, new_authoritative)

Path(".github/workflows/_companion-causality-repair.yml").unlink()
Path("scripts/_patch_companion_causality.py").unlink()