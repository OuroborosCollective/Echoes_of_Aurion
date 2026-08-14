/**
 * Echoes of Aurion — Scene frame
 * Design philosophy: React is the expedition console; Babylon is the luminous,
 * full-bleed sky-city vista beneath it. Canvas lifecycle remains deliberately strict.
 */

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { GameHandle } from "@/game/scene";
import { validateRuntimeModelSource } from "@shared/runtimeContracts";

export default function GameCanvas({ characterModelUrl, arenaModelUrl }: { characterModelUrl?: string; arenaModelUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const handleRef = useRef<GameHandle | null>(null);
  const characterModelUrlRef = useRef(characterModelUrl);
  const arenaModelUrlRef = useRef(arenaModelUrl);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  characterModelUrlRef.current = characterModelUrl;
  arenaModelUrlRef.current = arenaModelUrl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;

    const markUnavailable = () => {
      setWebglUnavailable(true);
      window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: false, unavailable: true } }));
    };
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("aurion_runtime") === "no-webgl") {
      markUnavailable();
      return;
    }

    let engine: Engine | null = null;
    let handle: GameHandle | null = null;
    let disposed = false;

    void Promise.all([import("@babylonjs/core/Engines/engine"), import("@/game/scene")]).then(async ([{ Engine }, { createGameScene }]) => {
      if (disposed) return;
      engine = new Engine(canvas, true, { stencil: true, adaptToDeviceRatio: true });
      const sceneHandle = await createGameScene(engine, canvas);
      if (disposed) {
        sceneHandle.dispose();
        return;
      }
      handle = sceneHandle;
      handleRef.current = sceneHandle;
      void sceneHandle.setCharacterModel(characterModelUrlRef.current).then(() => {
        if (characterModelUrlRef.current) window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: true } }));
      }).catch(() => window.dispatchEvent(new CustomEvent("aurion:character-model-status", { detail: { active: false } })));
      void sceneHandle.setArenaModel(arenaModelUrlRef.current);
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
    void handleRef.current.setArenaModel(arenaModelUrl).catch(() => undefined);
  }, [arenaModelUrl]);

  return <><canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} aria-hidden={webglUnavailable} />{webglUnavailable && <div className="game-canvas-fallback" data-testid="webgl-fallback" role="status">3D-Ansicht nicht verfügbar · Zugang und Gemeinschaft bleiben aktiv.</div>}</>;
}
