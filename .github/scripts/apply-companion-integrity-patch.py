from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one literal match, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(path, updated)


# Babylon owns the WebGL canvas. Expose a bounded render-target screenshot request instead
# of attempting to acquire an impossible 2D context from the live engine canvas.
replace_once(
    "client/src/components/GameCanvas.tsx",
    'import type { Engine } from "@babylonjs/core/Engines/engine";\nimport type { GameHandle } from "@/game/scene";',
    'import type { Engine } from "@babylonjs/core/Engines/engine";\nimport { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";\nimport type { GameHandle } from "@/game/scene";\nimport { COMPANION_FRAME_REQUEST_EVENT, COMPANION_FRAME_RESPONSE_EVENT, type CompanionFrameRequestDetail, type CompanionFrameResponseDetail } from "@/lib/companionFrameCapture";',
)
replace_once(
    "client/src/components/GameCanvas.tsx",
    "    let disposed = false;\n\n    void Promise.all",
    '''    let disposed = false;
    let captureInFlight = false;
    const dispatchFrameResponse = (detail: CompanionFrameResponseDetail) => window.dispatchEvent(new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, { detail }));
    const onCompanionFrameRequest = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameRequestDetail>).detail;
      if (!detail?.requestId) return;
      const activeEngine = engine;
      const camera = handle?.scene.activeCamera;
      if (!activeEngine || !camera || disposed) {
        dispatchFrameResponse({ requestId: detail.requestId, error: "unavailable" });
        return;
      }
      if (captureInFlight) {
        dispatchFrameResponse({ requestId: detail.requestId, error: "busy" });
        return;
      }
      captureInFlight = true;
      const capturedAt = Date.now();
      void CreateScreenshotUsingRenderTargetAsync(activeEngine, camera, { width: 256, height: 144 }, "image/webp")
        .then(frameDataUrl => dispatchFrameResponse({ requestId: detail.requestId, frameDataUrl, capturedAt }))
        .catch(() => dispatchFrameResponse({ requestId: detail.requestId, error: "capture_failed" }))
        .finally(() => { captureInFlight = false; });
    };
    window.addEventListener(COMPANION_FRAME_REQUEST_EVENT, onCompanionFrameRequest);

    void Promise.all''',
)
replace_once(
    "client/src/components/GameCanvas.tsx",
    '      window.removeEventListener("resize", onResize);\n      engine?.stopRenderLoop();',
    '      window.removeEventListener("resize", onResize);\n      window.removeEventListener(COMPANION_FRAME_REQUEST_EVENT, onCompanionFrameRequest);\n      engine?.stopRenderLoop();',
)

# Bind local rows to one fresh Babylon frame and one pending human action.
replace_once(
    "client/src/pages/Home.tsx",
    'import { companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession } from "@/lib/companionLearning";\nimport type { CompanionSession } from "@shared/companionLearningProtocol";',
    'import { companionActionAllowed, companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession, type CompanionAction, type CompanionStateMask, type CompanionStateVector } from "@/lib/companionLearning";\nimport { isFreshCompanionFrame, requestCompanionFrame } from "@/lib/companionFrameCapture";\nimport { COMPANION_FRAME_MAX_AGE_MS, type CompanionSession } from "@shared/companionLearningProtocol";',
)
replace_once(
    "client/src/pages/Home.tsx",
    'const initialMission: MissionState = { arena: 0, arenaName: "Sternwarte Asterion", objective: "Brich den ersten Resonanzanker des Sentinels.", sentinelHp: 112, sentinelMaxHp: 112, explorerHp: 100, echoHp: 100, shield: false, marked: false, phase: "active" };',
    'type PendingCompanionAction = { id: number; action: CompanionAction; issuedAt: number };\nconst companionMissionPhaseValue: Record<MissionState["phase"], number> = { active: 0, transition: 0.25, quest_ready: 0.5, dungeon_ready: 0.75, victory: 1 };\n\nconst initialMission: MissionState = { arena: 0, arenaName: "Sternwarte Asterion", objective: "Brich den ersten Resonanzanker des Sentinels.", sentinelHp: 112, sentinelMaxHp: 112, explorerHp: 100, echoHp: 100, shield: false, marked: false, phase: "active" };',
)
replace_once(
    "client/src/pages/Home.tsx",
    '  const lastCompanionAction = useRef<[number, number, number, number] | undefined>(undefined);',
    '  const lastCompanionAction = useRef<PendingCompanionAction | undefined>(undefined);\n  const companionActionSequence = useRef(0);\n  const companionCaptureInFlight = useRef(false);',
)
regex_once(
    "client/src/pages/Home.tsx",
    r'  useEffect\(\(\) => \{\n    if \(companionSession\?\.mode !== "learning"\) return;\n.*?\n  \}, \[companionSession\?\.mode, mission, persistCompanionObservation\]\);',
    '''  useEffect(() => {
    if (companionSession?.mode !== "learning") {
      lastCompanionAction.current = undefined;
      return;
    }
    const timer = window.setInterval(() => {
      const pending = lastCompanionAction.current;
      if (!pending || companionCaptureInFlight.current) return;
      const now = Date.now();
      if (now - pending.issuedAt > COMPANION_FRAME_MAX_AGE_MS) {
        if (lastCompanionAction.current?.id === pending.id) lastCompanionAction.current = undefined;
        return;
      }
      companionCaptureInFlight.current = true;
      void requestCompanionFrame().then(sample => {
        if (!sample || !isFreshCompanionFrame(sample) || lastCompanionAction.current?.id !== pending.id) return;
        const stateVector: CompanionStateVector = [
          mission.explorerHp / 100,
          mission.echoHp / 100,
          mission.sentinelHp / Math.max(1, mission.sentinelMaxHp),
          mission.shield ? 1 : 0,
          mission.marked ? 1 : 0,
          companionMissionPhaseValue[mission.phase],
        ];
        const stateMask: CompanionStateMask = [1, 1, 1, 1, 1, 1];
        const row = recordCompanionObservation({
          frameDataUrl: sample.frameDataUrl,
          featureVector: [...sample.featureVector],
          action: pending.action,
          stateVector,
          stateMask,
          capturedAt: sample.capturedAt,
          note: `Beobachtung in ${mission.arenaName}: ${mission.objective}`,
        });
        if (!row) return;
        if (lastCompanionAction.current?.id === pending.id) lastCompanionAction.current = undefined;
        void persistCompanionObservation.mutateAsync({
          sessionId: row.session_id,
          sequenceIndex: row.sequence_index,
          timestampEpoch: row.timestamp_epoch,
          sampleId: row.sample_id,
          featureVector: row.feature_vector,
          targetAction: row.target_action_chunk[0],
          stateVector: row.state_vector,
          stateMask: row.state_mask,
          note: row.note,
        }).catch(() => setLastSignal("Die Demonstration ist lokal gesichert; die serverseitige Companion-Memory-Bestätigung steht noch aus."));
      }).finally(() => { companionCaptureInFlight.current = false; });
    }, 100);
    return () => window.clearInterval(timer);
  }, [companionSession?.mode, mission, persistCompanionObservation]);''',
)
replace_once(
    "client/src/pages/Home.tsx",
    '      processedGatewaySequence.current = entry.sequence;\n      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));\n      appendLedger({ kind: "command", title: `Autorisierter MCP-Impuls ${entry.command}`, detail: `${gatewayPairing?.sessionId ?? "MCP"} bestätigte die Sequenz ${entry.sequence}.` });',
    '      processedGatewaySequence.current = entry.sequence;\n      if (!companionActionAllowed()) {\n        appendLedger({ kind: "warning", title: `MCP-Impuls ${entry.command} gesperrt`, detail: "Der Companion muss zuerst Learn abschließen und über Play/Go gespawnt werden." });\n        setLastSignal("MCP-Impuls gesperrt: Der Companion ist nicht im bestätigten Play-Zustand.");\n        return;\n      }\n      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command, origin: "gateway" as const } }));\n      appendLedger({ kind: "command", title: `Autorisierter MCP-Impuls ${entry.command}`, detail: `${gatewayPairing?.sessionId ?? "MCP"} bestätigte die Sequenz ${entry.sequence}.` });',
)
replace_once(
    "client/src/pages/Home.tsx",
    '      processedTeamSignals.current.add(entry.id);\n      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));',
    '      processedTeamSignals.current.add(entry.id);\n      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command, origin: "human_team" as const } }));',
)
replace_once(
    "client/src/pages/Home.tsx",
    '    window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code } }));\n    const ability = abilityDeck.find((item) => item.code === code);',
    '    window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code, origin: "local_console" as const } }));\n    const ability = abilityDeck.find((item) => item.code === code);',
)
regex_once(
    "client/src/pages/Home.tsx",
    r'  const sendHumanCommand = \(code: "W" \| "A" \| "S" \| "D"\): void => \{.*?\n  const beginCompanionLearn = \(\): void => \{',
    '''  const queueCompanionAction = (action: CompanionAction): void => {
    if (loadCompanionSession()?.mode !== "learning") return;
    companionActionSequence.current += 1;
    lastCompanionAction.current = { id: companionActionSequence.current, action, issuedAt: Date.now() };
  };
  const sendHumanCommand = (code: "W" | "A" | "S" | "D"): void => {
    const coordinates: Record<string, [number, number]> = { W: [0.5, 0.25], A: [0.25, 0.5], S: [0.5, 0.75], D: [0.75, 0.5] };
    const [x, y] = coordinates[code];
    queueCompanionAction([x, y, 1, 1]);
    window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } }));
  };
  const sendHumanAction = (code: "F" | "E" = "F"): void => { queueCompanionAction([0.5, 0.5, 1, 1]); window.dispatchEvent(new CustomEvent("aurion:human-action", { detail: { code } })); setLastSignal(code === "F" ? "Explorer fordert ein Speersignal an." : "Explorer fordert eine Interaktion an."); };
  const beginCompanionLearn = (): void => {''',
)
replace_once(
    "client/src/pages/Home.tsx",
    '      setCompanionSession(next);\n      appendLedger({ kind: "connection", title: next.mode === "learning" ? "LLM-Lernen gestartet" : "LLM-Lernen beendet",',
    '      setCompanionSession(next);\n      if (next.mode !== "learning") lastCompanionAction.current = undefined;\n      appendLedger({ kind: "connection", title: next.mode === "learning" ? "LLM-Lernen gestartet" : "LLM-Lernen beendet",',
)

# Preserve command provenance so human-team/local actions are not confused with MCP authority.
replace_once(
    "client/src/game/scene.ts",
    'import type { AudioEvent, AudioSurface } from "@shared/audioProtocol";',
    'import type { AudioEvent, AudioSurface } from "@shared/audioProtocol";\nimport { companionCommandRequiresSpawn, companionGameplayActionSource, type CompanionCommandOrigin } from "@shared/companionLearningProtocol";',
)
scene = read("client/src/game/scene.ts")
start = scene.index('  const runEchoAbility = (code: CommandCode): void => {')
end = scene.index('  const emitZoneMovementState = (): void => {', start)
ability_block = scene[start:end]
ability_block = ability_block.replace('const runEchoAbility = (code: CommandCode): void => {', 'const runEchoAbility = (code: CommandCode, source: "human" | "gateway"): void => {')
ability_block = ability_block.replace('requestAction(code, "gateway")', 'requestAction(code, source)')
write("client/src/game/scene.ts", scene[:start] + ability_block + scene[end:])
regex_once(
    "client/src/game/scene.ts",
    r'  const onCommand = \(event: Event\): void => \{.*?\n  \};\n  const onStart =',
    '''  const onCommand = (event: Event): void => {
    const detail = (event as CustomEvent<{ code: CommandCode; origin?: CompanionCommandOrigin }>).detail;
    const code = detail?.code;
    const origin = detail?.origin ?? "gateway";
    if (!code || !["gateway", "human_team", "local_console"].includes(origin)) return;
    if (!started || victory || (companionCommandRequiresSpawn(origin) && !companionSpawned)) return;
    if (!companionCommandRequiresSpawn(origin)) echo.setEnabled(true);
    const actionSource = companionGameplayActionSource(origin);
    const movement = 1.2;
    if (code === "W") echoTarget.z -= movement; if (code === "S") echoTarget.z += movement; if (code === "A") echoTarget.x -= movement; if (code === "D") echoTarget.x += movement;
    echoTarget.x = Math.max(-5.7, Math.min(5.7, echoTarget.x)); echoTarget.z = Math.max(-5.2, Math.min(5.2, echoTarget.z));
    if (/^[1-9]$/.test(code)) runEchoAbility(code, actionSource); else if (code === "E" && requestNpcInteraction()) return; else if (code === "F" || code === "E") requestAction(code, actionSource); else {
      requestAction(code, actionSource);
      const surface: AudioSurface = openWorldActive ? "grass" : dungeonActive ? "stone" : "wood";
      emitGameEvent("command", `Echo Scout bestätigt Kurs ${code}.`, { cue: `movement.footstep.${surface}`, category: "movement", surface });
    }
  };
  const onStart =''',
)

# The network contract for dataset v1 is exact, not a 6..32 open vector.
replace_once(
    "server/routers.ts",
    'import { z } from "zod";',
    'import { z } from "zod";\nimport { COMPANION_FEATURE_VECTOR_LENGTH, COMPANION_STATE_VECTOR_LENGTH } from "@shared/companionLearningProtocol";',
)
replace_once(
    "server/routers.ts",
    '      featureVector: z.array(z.number().finite()).length(16),',
    '      featureVector: z.array(z.number().finite()).length(COMPANION_FEATURE_VECTOR_LENGTH),',
)
replace_once(
    "server/routers.ts",
    '      stateVector: z.array(z.number().finite()).min(6).max(32),\n      stateMask: z.array(z.union([z.literal(0), z.literal(1)])).min(6).max(32),',
    '      stateVector: z.array(z.number().finite()).length(COMPANION_STATE_VECTOR_LENGTH),\n      stateMask: z.array(z.union([z.literal(0), z.literal(1)])).length(COMPANION_STATE_VECTOR_LENGTH),',
)

# Defence in depth: direct store calls must satisfy the same exact dimensions as the router.
replace_once(
    "server/companionMemory.ts",
    'import { createHash } from "node:crypto";',
    'import { createHash } from "node:crypto";\nimport { COMPANION_FEATURE_VECTOR_LENGTH, COMPANION_STATE_VECTOR_LENGTH } from "@shared/companionLearningProtocol";',
)
replace_once(
    "server/companionMemory.ts",
    'function safeSegment(value: string): string {\n  return value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 128);\n}\n\nexport class CompanionMemoryStore',
    '''function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 128);
}

function validateObservation(observation: CompanionMemoryObservation): void {
  if (!observation.sessionId.trim() || !/^[A-Za-z0-9._:-]{8,128}$/.test(observation.sampleId)) throw new Error("Companion memory identity is missing");
  if (!Number.isInteger(observation.sequenceIndex) || observation.sequenceIndex < 0 || !Number.isInteger(observation.timestampEpoch) || observation.timestampEpoch <= 0) throw new Error("Companion memory sequence is invalid");
  if (observation.featureVector.length !== COMPANION_FEATURE_VECTOR_LENGTH || !observation.featureVector.every(Number.isFinite)) throw new Error("Companion memory feature vector is invalid");
  if (observation.targetAction.length !== 4 || !observation.targetAction.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("Companion memory target action is invalid");
  if (observation.stateVector.length !== COMPANION_STATE_VECTOR_LENGTH || !observation.stateVector.every(Number.isFinite)) throw new Error("Companion memory state vector is invalid");
  if (observation.stateMask.length !== COMPANION_STATE_VECTOR_LENGTH || !observation.stateMask.every(value => value === 0 || value === 1)) throw new Error("Companion memory state mask is invalid");
  if (observation.note.length > 280) throw new Error("Companion memory note is too long");
}

export class CompanionMemoryStore''',
)
replace_once(
    "server/companionMemory.ts",
    '    if (!Number.isInteger(userId) || userId < 1) throw new Error("Companion memory userId is invalid");\n    if (!observation.sessionId.trim() || !observation.sampleId.trim()) throw new Error("Companion memory identity is missing");',
    '    if (!Number.isInteger(userId) || userId < 1) throw new Error("Companion memory userId is invalid");\n    validateObservation(observation);',
)
replace_once(
    "server/companionMemory.ts",
    '      redisStored = added === "OK" || added === null;',
    '      redisStored = added === "OK";',
)

# Extend focused protocol and memory tests.
replace_once(
    "client/src/companionLearningProtocol.test.ts",
    '  companionCanAct,\n  createCompanionSession,',
    '  companionCanAct,\n  companionCommandRequiresSpawn,\n  companionGameplayActionSource,\n  createCompanionSession,',
)
replace_once(
    "client/src/companionLearningProtocol.test.ts",
    '\n});\n',
    '''

  it("keeps gateway authority separate from human team and local console input", () => {
    expect(companionCommandRequiresSpawn("gateway")).toBe(true);
    expect(companionCommandRequiresSpawn("human_team")).toBe(false);
    expect(companionCommandRequiresSpawn("local_console")).toBe(false);
    expect(companionGameplayActionSource("gateway")).toBe("gateway");
    expect(companionGameplayActionSource("human_team")).toBe("human");
    expect(companionGameplayActionSource("local_console")).toBe("human");
  });
});
''',
)
replace_once(
    "server/companionMemory.test.ts",
    '\n});\n',
    '''

  it("rejects observations that do not match the dataset-v1 dimensions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "aurion-companion-memory-invalid-"));
    dirs.push(dir);
    const store = new CompanionMemoryStore({ dataDir: dir });
    stores.push(store);
    const valid = { sessionId: "cmp_test_session", sequenceIndex: 0, timestampEpoch: Date.now(), sampleId: "sample_0002", featureVector: new Array(16).fill(0.25), targetAction: [0.5, 0.25, 1, 1] as [number, number, number, number], stateVector: [1, 1, 1, 0, 0, 1], stateMask: [1, 1, 1, 1, 1, 1], note: "test" };
    await expect(store.append(7, { ...valid, featureVector: valid.featureVector.slice(0, 15) })).rejects.toThrow(/feature vector/);
    await expect(store.append(7, { ...valid, stateVector: valid.stateVector.slice(0, 5) })).rejects.toThrow(/state vector/);
    await expect(store.append(7, { ...valid, stateMask: valid.stateMask.slice(0, 5) })).rejects.toThrow(/state mask/);
  });
});
''',
)

# The workflow is a one-shot transport for exact patching; it must not remain in the product tree.
for transient in [
    ROOT / ".github/scripts/apply-companion-integrity-patch.py",
    ROOT / ".github/workflows/companion-integrity-patch.yml",
]:
    transient.unlink(missing_ok=True)
