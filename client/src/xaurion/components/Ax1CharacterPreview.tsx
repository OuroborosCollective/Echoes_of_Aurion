import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";

export type ConfirmedCharacterAppearance = {
  assetId: string;
  displayName: string;
  storageUrl: string;
  visibility: string;
};

export function Ax1CharacterPreview({ open, appearance }: {
  open: boolean;
  appearance?: ConfirmedCharacterAppearance | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!open || !appearance?.storageUrl || !canvasRef.current) {
      setState("idle");
      return;
    }

    let disposed = false;
    let frame = 0;
    let model: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    const clock = new THREE.Clock();
    const canvas = canvasRef.current;
    setState("loading");

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(280, 320, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    } catch {
      setState("error");
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 280 / 320, 0.01, 100);
    camera.position.set(0, 1.25, 5.1);
    camera.lookAt(0, 1.1, 0);

    scene.add(new THREE.HemisphereLight(0xd7eeff, 0x18202a, 2.2));
    const key = new THREE.DirectionalLight(0xffddb0, 2.8);
    key.position.set(3, 4, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x76e6ff, 1.8);
    rim.position.set(-3, 2.5, -2);
    scene.add(rim);

    const animate = () => {
      if (disposed || !renderer) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      mixer?.update(delta);
      if (model && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        model.rotation.y = Math.sin(clock.elapsedTime * 0.45) * 0.06;
      }
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };

    void glbManager.loadModel(appearance.storageUrl).then(loaded => {
      if (disposed) {
        releaseGlbTree(loaded.scene);
        return;
      }
      model = loaded.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (!Number.isFinite(size.y) || size.y <= 0.001) throw new Error("CHARACTER_PREVIEW_BOUNDS_INVALID");
      model.scale.multiplyScalar(2.55 / size.y);
      const fitted = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      fitted.getCenter(center);
      model.position.sub(center);
      model.position.y -= fitted.min.y + model.position.y;
      model.position.y -= 1.25;
      scene.add(model);

      const idle = loaded.animations.find(clip => /(^|[_\s-])idle($|[_\s-])/i.test(clip.name)) ?? loaded.animations.find(clip => /idle/i.test(clip.name));
      if (idle) {
        mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(idle);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.play();
      }
      setState("ready");
      animate();
    }).catch(() => {
      if (!disposed) setState("error");
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      mixer?.stopAllAction();
      if (model) {
        scene.remove(model);
        releaseGlbTree(model);
      }
      renderer?.dispose();
    };
  }, [open, appearance?.assetId, appearance?.storageUrl]);

  if (!appearance) {
    return <div className="min-h-64 rounded-2xl border border-amber-500/30 bg-black/50 grid place-items-center p-5 text-center" data-testid="character-preview-empty">
      <div><div className="text-4xl mb-3">✦</div><p className="text-sm text-amber-200">Kein bestätigtes Charaktermodell gebunden.</p><p className="text-xs text-gray-500 mt-2">Die Open World wartet auf eine bestätigte Charakterzuordnung.</p></div>
    </div>;
  }

  return <figure className="relative min-h-64 rounded-2xl overflow-hidden border border-cyan-500/30 bg-[radial-gradient(circle_at_50%_35%,rgba(0,240,255,0.13),rgba(0,0,0,0.78)_68%)]" data-testid="character-preview" data-state={state}>
    <canvas ref={canvasRef} width={280} height={320} className="block w-full h-72 object-contain" aria-label={`3D-Vorschau: ${appearance.displayName}`} />
    <figcaption className="absolute left-3 right-3 bottom-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
      <b className="block text-xs text-cyan-200">{appearance.displayName}</b>
      <span className="block text-[10px] text-gray-400 font-mono mt-1">{appearance.assetId}</span>
      {state === "loading" && <span className="text-[10px] text-amber-300">Modell wird verifiziert und geladen …</span>}
      {state === "error" && <span className="text-[10px] text-red-300">Bestätigtes Modell konnte nicht dargestellt werden.</span>}
    </figcaption>
  </figure>;
}
