#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match in {path}, found {count}")
    target.write_text(source.replace(old, new, 1), encoding="utf-8")


helper = '''export const COMPANION_FRAME_REQUEST_EVENT = "aurion:companion-frame-request";
export const COMPANION_FRAME_RESPONSE_EVENT = "aurion:companion-frame-response";

export type CompanionFrameRequestDetail = {
  requestId: string;
  width: number;
  height: number;
};

export type CompanionFrameResponseDetail = {
  requestId: string;
  dataUrl?: string;
  error?: "not_ready" | "capture_failed";
};

export type CompanionFrame = {
  dataUrl: string;
  features: number[];
};

let requestSequence = 0;

export function luminanceGridFeatures(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4) {
    throw new Error("Companion frame dimensions must be at least 4x4");
  }
  if (pixels.length < width * height * 4) {
    throw new Error("Companion frame pixel buffer is incomplete");
  }

  const features: number[] = [];
  for (let gridY = 0; gridY < 4; gridY += 1) {
    const startY = Math.floor((gridY * height) / 4);
    const endY = Math.floor(((gridY + 1) * height) / 4);
    for (let gridX = 0; gridX < 4; gridX += 1) {
      const startX = Math.floor((gridX * width) / 4);
      const endX = Math.floor(((gridX + 1) * width) / 4);
      let total = 0;
      let samples = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * width + x) * 4;
          total +=
            (0.299 * pixels[offset]! +
              0.587 * pixels[offset + 1]! +
              0.114 * pixels[offset + 2]!) /
            255;
          samples += 1;
        }
      }
      features.push(samples > 0 ? total / samples : 0);
    }
  }
  return features;
}

export function requestCompanionFrame(timeoutMs = 4_000): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const requestId = `companion-frame-${++requestSequence}`;

  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(COMPANION_FRAME_RESPONSE_EVENT, onResponse);
      resolve(value);
    };
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameResponseDetail>).detail;
      if (!detail || detail.requestId !== requestId) return;
      finish(detail.dataUrl ?? null);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener(COMPANION_FRAME_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent<CompanionFrameRequestDetail>(COMPANION_FRAME_REQUEST_EVENT, {
        detail: { requestId, width: 64, height: 64 },
      }),
    );
  });
}

async function decodeFramePixels(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error("Companion frame decode failed")), {
      once: true,
    });
  });
  image.src = dataUrl;
  if (typeof image.decode === "function") {
    await image.decode().catch(() => loaded);
  } else {
    await loaded;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Companion feature canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export async function captureCompanionFrame(): Promise<CompanionFrame | null> {
  const dataUrl = await requestCompanionFrame();
  if (!dataUrl) return null;
  const image = await decodeFramePixels(dataUrl);
  return {
    dataUrl,
    features: luminanceGridFeatures(image.data, image.width, image.height),
  };
}
'''
(ROOT / "client/src/lib/companionFrameCapture.ts").write_text(helper, encoding="utf-8")

helper_test = '''import { describe, expect, it } from "vitest";
import {
  COMPANION_FRAME_REQUEST_EVENT,
  COMPANION_FRAME_RESPONSE_EVENT,
  luminanceGridFeatures,
  requestCompanionFrame,
  type CompanionFrameRequestDetail,
} from "./companionFrameCapture";

describe("Aurion companion frame capture", () => {
  it("derives a deterministic 4x4 luminance vector", () => {
    const white = new Uint8ClampedArray(4 * 4 * 4);
    for (let offset = 0; offset < white.length; offset += 4) {
      white[offset] = 255;
      white[offset + 1] = 255;
      white[offset + 2] = 255;
      white[offset + 3] = 255;
    }
    expect(luminanceGridFeatures(white, 4, 4)).toEqual(new Array(16).fill(1));
    expect(luminanceGridFeatures(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toEqual(
      new Array(16).fill(0),
    );
  });

  it("binds one response to its exact request id", async () => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameRequestDetail>).detail;
      window.dispatchEvent(
        new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, {
          detail: { requestId: "other-request", dataUrl: "data:image/webp;base64,wrong" },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, {
          detail: { requestId: detail.requestId, dataUrl: "data:image/webp;base64,right" },
        }),
      );
    };
    window.addEventListener(COMPANION_FRAME_REQUEST_EVENT, onRequest, { once: true });
    await expect(requestCompanionFrame(100)).resolves.toBe("data:image/webp;base64,right");
  });
});
'''
(ROOT / "client/src/lib/companionFrameCapture.test.ts").write_text(helper_test, encoding="utf-8")

replace_once(
    "client/src/components/GameCanvas.tsx",
    'import { validateRuntimeModelSource } from "@shared/runtimeContracts";\n',
    'import { validateRuntimeModelSource } from "@shared/runtimeContracts";\nimport {\n  COMPANION_FRAME_REQUEST_EVENT,\n  COMPANION_FRAME_RESPONSE_EVENT,\n  type CompanionFrameRequestDetail,\n  type CompanionFrameResponseDetail,\n} from "@/lib/companionFrameCapture";\n',
)
replace_once(
    "client/src/components/GameCanvas.tsx",
    '    let engine: Engine | null = null;\n    let handle: GameHandle | null = null;\n    let disposed = false;\n',
    '    let engine: Engine | null = null;\n    let handle: GameHandle | null = null;\n    let disposed = false;\n    let captureQueue: Promise<void> = Promise.resolve();\n',
)
replace_once(
    "client/src/components/GameCanvas.tsx",
    '''    const onResize = () => engine?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
''',
    '''    const onResize = () => engine?.resize();
    const onCompanionFrameRequest = (event: Event) => {
      const detail = (event as CustomEvent<CompanionFrameRequestDetail>).detail;
      if (!detail?.requestId) return;
      const respond = (response: CompanionFrameResponseDetail) =>
        window.dispatchEvent(
          new CustomEvent<CompanionFrameResponseDetail>(COMPANION_FRAME_RESPONSE_EVENT, {
            detail: response,
          }),
        );
      captureQueue = captureQueue
        .then(async () => {
          const camera = handle?.scene.activeCamera;
          if (disposed || !engine || !camera) {
            respond({ requestId: detail.requestId, error: "not_ready" });
            return;
          }
          const { CreateScreenshotAsync } = await import("@babylonjs/core/Misc/screenshotTools");
          const width = Math.max(32, Math.min(256, Math.trunc(detail.width)));
          const height = Math.max(32, Math.min(256, Math.trunc(detail.height)));
          const dataUrl = await CreateScreenshotAsync(
            engine,
            camera,
            { width, height },
            "image/webp",
            0.55,
            true,
            true,
          );
          respond({ requestId: detail.requestId, dataUrl });
        })
        .catch(() => respond({ requestId: detail.requestId, error: "capture_failed" }));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener(COMPANION_FRAME_REQUEST_EVENT, onCompanionFrameRequest);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener(COMPANION_FRAME_REQUEST_EVENT, onCompanionFrameRequest);
''',
)

replace_once(
    "client/src/lib/companionLearning.ts",
    'const SESSION_KEY = "echoes-of-aurion.companion-session.v1";\n',
    '''const SESSION_KEY = "echoes-of-aurion.companion-session.v1";
const MINIMUM_STATE_VECTOR_LENGTH = 6;
const MAXIMUM_STATE_VECTOR_LENGTH = 32;

function normalizedStateVector(values?: number[]): number[] {
  const result = (values ?? [])
    .slice(0, MAXIMUM_STATE_VECTOR_LENGTH)
    .map(value => (Number.isFinite(value) ? value : 0));
  while (result.length < MINIMUM_STATE_VECTOR_LENGTH) result.push(0);
  return result;
}

function normalizedStateMask(values: number[] | undefined, length: number): number[] {
  const result = (values ?? [])
    .slice(0, length)
    .map(value => (value === 1 ? 1 : 0));
  while (result.length < length) result.push(0);
  return result;
}
''',
)
replace_once(
    "client/src/lib/companionLearning.ts",
    '''  const sequenceIndex = session.datasetRows;
  const rowBase = {
''',
    '''  const sequenceIndex = session.datasetRows;
  const stateVector = normalizedStateVector(input.stateVector);
  const stateMask = normalizedStateMask(input.stateMask, stateVector.length);
  const rowBase = {
''',
)
replace_once(
    "client/src/lib/companionLearning.ts",
    '''    state_vector: input.stateVector?.slice() ?? [0, 0, 0, 0, 0, 0],
    state_mask: input.stateMask?.slice() ?? [0, 0, 0, 0, 0, 0],
''',
    '''    state_vector: stateVector,
    state_mask: stateMask,
''',
)

replace_once(
    "client/src/pages/Home.tsx",
    'import { companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession } from "@/lib/companionLearning";\n',
    'import { companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession, type CompanionAction } from "@/lib/companionLearning";\nimport { captureCompanionFrame } from "@/lib/companionFrameCapture";\n',
)
replace_once(
    "client/src/pages/Home.tsx",
    '  const lastCompanionAction = useRef<[number, number, number, number] | undefined>(undefined);\n',
    '''  const captureCompanionDemonstration = useCallback((action: CompanionAction): void => {
    if (companionSession?.mode !== "learning" || !companionSession.online) return;
    const snapshot = mission;
    void captureCompanionFrame()
      .then(frame => {
        if (!frame) return;
        const phaseValue = (["active", "transition", "quest_ready", "dungeon_ready", "victory"] as const).indexOf(snapshot.phase) / 4;
        const row = recordCompanionObservation({
          frameDataUrl: frame.dataUrl,
          featureVector: frame.features,
          action,
          stateVector: [
            snapshot.explorerHp / 100,
            snapshot.echoHp / 100,
            snapshot.sentinelHp / Math.max(1, snapshot.sentinelMaxHp),
            snapshot.shield ? 1 : 0,
            snapshot.marked ? 1 : 0,
            phaseValue,
          ],
          stateMask: [1, 1, 1, 1, 1, 1],
          note: `Menschliche Demonstration in ${snapshot.arenaName}: ${snapshot.objective}`,
        });
        if (!row) return;
        return persistCompanionObservation
          .mutateAsync({
            sessionId: row.session_id,
            sequenceIndex: row.sequence_index,
            timestampEpoch: row.timestamp_epoch,
            sampleId: row.sample_id,
            featureVector: row.feature_vector,
            targetAction: row.target_action_chunk[0],
            stateVector: row.state_vector,
            stateMask: row.state_mask as Array<0 | 1>,
            note: row.note,
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
  }, [companionSession?.mode, companionSession?.online, mission, persistCompanionObservation]);
''',
)
old_interval = '''  useEffect(() => {
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
new_events = '''  useEffect(() => {
    const coordinates: Record<"W" | "A" | "S" | "D", CompanionAction> = {
      W: [0.5, 0.25, 1, 1],
      A: [0.25, 0.5, 1, 1],
      S: [0.5, 0.75, 1, 1],
      D: [0.75, 0.5, 1, 1],
    };
    const onHumanCommand = (event: Event) => {
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      if (code === "W" || code === "A" || code === "S" || code === "D") {
        captureCompanionDemonstration(coordinates[code]);
      }
    };
    const onHumanAction = () => captureCompanionDemonstration([0.5, 0.5, 1, 1]);
    window.addEventListener("aurion:human-command", onHumanCommand);
    window.addEventListener("aurion:human-action", onHumanAction);
    return () => {
      window.removeEventListener("aurion:human-command", onHumanCommand);
      window.removeEventListener("aurion:human-action", onHumanAction);
    };
  }, [captureCompanionDemonstration]);
'''
replace_once("client/src/pages/Home.tsx", old_interval, new_events)
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
    window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } }));
  };
  const sendHumanAction = (code: "F" | "E" = "F"): void => { window.dispatchEvent(new CustomEvent("aurion:human-action", { detail: { code } })); setLastSignal(code === "F" ? "Explorer fordert ein Speersignal an." : "Explorer fordert eine Interaktion an."); };
''',
)

replace_once(
    "client/src/lib/companionLearning.test.ts",
    '''    const row = recordCompanionObservation({ frameDataUrl: "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==", featureVector: new Array(16).fill(0.5), action: [0.1, 0.2, 0.8, 1], note: "Spieler bewegt sich zum Resonanzanker." });
    expect(row?.session_id).toBe(loadCompanionSession()?.sessionId);
    expect(row?.target_action_chunk[0]).toEqual([0.1, 0.2, 0.8, 1]);
''',
    '''    const row = recordCompanionObservation({
      frameDataUrl: "data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==",
      featureVector: new Array(16).fill(0.5),
      action: [0.1, 0.2, 0.8, 1],
      stateVector: [1, 0.8, 0.6, 0, 1],
      stateMask: [1, 1, 1, 1, 1],
      note: "Spieler bewegt sich zum Resonanzanker.",
    });
    expect(row?.session_id).toBe(loadCompanionSession()?.sessionId);
    expect(row?.target_action_chunk[0]).toEqual([0.1, 0.2, 0.8, 1]);
    expect(row?.state_vector).toEqual([1, 0.8, 0.6, 0, 1, 0]);
    expect(row?.state_mask).toEqual([1, 1, 1, 1, 1, 0]);
''',
)

# The bootstrap workflow and this patcher are intentionally absent from the final PR.
(ROOT / ".github/workflows/apply-companion-learning-evidence-fix.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
