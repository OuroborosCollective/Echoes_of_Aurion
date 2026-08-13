/**
 * Echoes of Aurion — Scene frame
 * Design philosophy: React is the expedition console; Babylon is the luminous,
 * full-bleed sky-city vista beneath it. Canvas lifecycle remains deliberately strict.
 */

import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type GameHandle } from "@/game/scene";

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;

    const engine = new Engine(canvas, true, {
      stencil: true,
      adaptToDeviceRatio: true,
    });
    let handle: GameHandle | null = null;
    let disposed = false;

    createGameScene(engine, canvas).then((sceneHandle) => {
      if (disposed) {
        sceneHandle.dispose();
        return;
      }
      handle = sceneHandle;
      engine.runRenderLoop(() => sceneHandle.scene.render());
    }).catch(error => {
      if (!disposed) console.error("[Aurion Canvas] Scene initialization failed", error);
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      handle?.dispose();
      engine.dispose();
      startedRef.current = false;
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />;
}
