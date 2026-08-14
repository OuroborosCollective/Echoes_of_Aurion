import { useEffect, useRef, useState } from "react";

export default function GlbPreview({ sourceUrl, fileName }: { sourceUrl: string | null; fileName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceUrl) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    const resize = () => cleanup?.();
    window.addEventListener("resize", resize);
    setError(null);
    void Promise.all([
      import("@babylonjs/core/Cameras/arcRotateCamera"), import("@babylonjs/core/Maths/math.color"), import("@babylonjs/core/Engines/engine"),
      import("@babylonjs/core/Lights/hemisphericLight"), import("@babylonjs/core/scene"), import("@babylonjs/core/Loading/sceneLoader"),
      import("@babylonjs/core/Maths/math.vector"), import("@babylonjs/loaders/glTF"),
    ]).then(async ([{ ArcRotateCamera }, { Color4 }, { Engine }, { HemisphericLight }, { Scene }, { SceneLoader }, { Vector3 }]) => {
      if (disposed) return;
      const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.015, 0.08, 0.1, 1);
      const camera = new ArcRotateCamera("submission-preview-camera", Math.PI / 2.3, Math.PI / 2.8, 3.8, Vector3.Zero(), scene);
      camera.attachControl(canvas, true);
      camera.wheelDeltaPercentage = 0.01;
      new HemisphericLight("submission-preview-light", new Vector3(0.2, 1, 0.1), scene).intensity = 1.4;
      engine.runRenderLoop(() => scene.render());
      cleanup = () => { scene.dispose(); engine.dispose(); };
      const result = await SceneLoader.ImportMeshAsync("", "", sourceUrl, scene);
      if (disposed) return;
      const meshes = result.meshes.filter(mesh => mesh.getTotalVertices() > 0);
      if (!meshes.length) throw new Error("Keine sichtbare Geometrie gefunden.");
      let minimum = meshes[0]!.getBoundingInfo().boundingBox.minimumWorld.clone();
      let maximum = meshes[0]!.getBoundingInfo().boundingBox.maximumWorld.clone();
      meshes.slice(1).forEach(mesh => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        minimum = Vector3.Minimize(minimum, bounds.minimumWorld);
        maximum = Vector3.Maximize(maximum, bounds.maximumWorld);
      });
      const center = minimum.add(maximum).scale(0.5);
      camera.target.copyFrom(center);
      camera.radius = Math.max(1.5, maximum.subtract(minimum).length() * 1.8);
    }).catch(() => { if (!disposed) setError("Die GLB-Datei konnte nicht als sichtbares Modell geladen werden."); });
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      cleanup?.();
    };
  }, [sourceUrl]);

  if (!sourceUrl) return <div className="glb-preview-empty">Wähle eine GLB-Datei aus. Die lokale 3D-Vorschau erscheint hier, bevor du sie einreichst.</div>;
  return <div className="glb-preview"><canvas ref={canvasRef} aria-label={`Vorschau für ${fileName ?? "GLB-Modell"}`} />{error && <p>{error}</p>}</div>;
}
