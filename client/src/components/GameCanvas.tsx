/**
 * Echoes of Aurion — Scene frame
 * Design philosophy: React is the expedition console; Babylon is the luminous,
 * full-bleed sky-city vista beneath it. Canvas lifecycle remains deliberately strict.
 */

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";
import type { GameHandle } from "@/game/scene";
import { normalizeStarterRuntimeAssetSources } from "@/game/starterCharacterAssets";
import { COMPANION_FRAME_REQUEST_EVENT, COMPANION_FRAME_RESPONSE_EVENT, type CompanionFrameRequestDetail, type CompanionFrameResponseDetail } from "@/lib/companionFrameCapture";
import { validateRuntimeModelSource } from "@shared/runtimeContracts";

async function fetchStarterRuntimeAssetSources() {
  try {
    const response = await fetch("/api/game/starter-glb-assets", { credentials: "same-origin" });
    if (!response.ok) return normalizeStarterRuntimeAssetSources(null);
    return normalizeStarterRuntimeAssetSources(await response.json());
  } catch {
    return normalizeStarterRuntimeAssetSources(null);
  }
}

export default function GameCanvas({ characterModelUrl, arenaModelUrl }: { characterModelUrl?: string; arenaModelUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const handleRef = useRef<GameHandle | null>(null);
  const characterModelUrlRef = useRef(characterModelUrl);
  const arenaModelUrlRef = useRef(arenaModelUrl);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<"booting" | "ready" | "unavailable">("booting");
  const [arenaModelStatus, setArenaModelStatus] = useState<"idle" | "active" | "failed">("idle");
  characterModelUrlRef.current = characterModelUrl;
  arenaModelUrlRef.current = arenaModelUrl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;

    const markUnavailable = () => {
      setWebglUnavailable(true);
      setSceneStatus("unavailable");
      window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: false, unavailable: true } }));
    };
    if (new URLSearchParams(window.location.search).get("aurion_runtime") === "no-webgl") {
      markUnavailable();
      return;
    }

    let engine: Engine | null = null;
    let handle: GameHandle | null = null;
    let disposed = false;
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

    void Promise.all([
      import("@babylonjs/core/Engines/engine"),
      import("@/game/sceneWithStarterCharacters"),
      fetchStarterRuntimeAssetSources(),
    ]).then(async ([{ Engine }, { createGameScene }, starterSources]) => {
      if (disposed) return;
      engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: true });
      const sceneHandle = await createGameScene(engine, canvas, characterModelUrlRef.current, starterSources);
      if (disposed) {
        sceneHandle.dispose();
        return;
      }
      handle = sceneHandle;
      handleRef.current = sceneHandle;
      setSceneStatus("ready");
      void sceneHandle.setCharacterModel(characterModelUrlRef.current).then(() => {
        if (characterModelUrlRef.current) window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: true } }));
      }).catch(() => window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: false } })));
      void sceneHandle.setArenaModel(arenaModelUrlRef.current).then(() => setArenaModelStatus(arenaModelUrlRef.current ? "active" : "idle")).catch(() => setArenaModelStatus("failed"));
      engine.runRenderLoop(() => sceneHandle.scene.render());
    }).catch(error => {
      if (!disposed) {
        console.warn("[Aurion Canvas] Die optionale 3D-Laufzeit konnte nicht gestartet werden", error);
        markUnavailable();
      }
    });

    const onResize = () => engine?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener(COMPANION_FRAME_REQUEST_EVENT, onCompanionFrameRequest);
      engine?.stopRenderLoop();
      handle?.dispose();
      handleRef.current = null;
      engine?.dispose();
      startedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!handleRef.current) return;
    const source = validateRuntimeModelSource(characterModelUrl);
    if (!source.valid) {
      window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: false, reason: source.reason } }));
      return;
    }
    void handleRef.current.setCharacterModel(characterModelUrl).then(() => {
      if (characterModelUrl) window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: true } }));
    }).catch(() => window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: false } })));
  }, [characterModelUrl]);

  useEffect(() => {
    if (!handleRef.current) return;
    const source = validateRuntimeModelSource(arenaModelUrl);
    if (!source.valid) return;
    void handleRef.current.setArenaModel(arenaModelUrl).then(() => setArenaModelStatus(arenaModelUrl ? "active" : "idle")).catch(() => setArenaModelStatus("failed"));
  }, [arenaModelUrl]);

  return <><canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} aria-hidden={webglUnavailable} />{sceneStatus === "booting" && <div className="game-canvas-boot" data-testid="webgl-boot" role="status"><span className="game-canvas-boot__sigil" aria-hidden="true">◌</span><div><b>STERNWARTE WIRD KALIBRIERT</b><small>3D-Welt und Steuerbrücke werden geladen…</small></div></div>}{arenaModelUrl && <div data-testid="arena-model-status" className="sr-only" role="status">Arena-GLB {arenaModelStatus}</div>}{webglUnavailable && <div className="game-canvas-fallback" data-testid="webgl-fallback" role="status">3D-Ansicht nicht verfügbar · Zugang und Gemeinschaft bleiben aktiv.</div>}</>;
}
