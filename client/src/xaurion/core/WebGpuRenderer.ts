import { AdditiveBlending, InstancedBufferAttribute, PointsNodeMaterial, Sprite, WebGPURenderer } from "three/webgpu";
import { instancedBufferAttribute, positionView, texture, uv, vec2 } from "three/tsl";
import type { RendererHandle } from "./RendererFactory";

/** Loaded only for an explicitly requested, browser-capable GPU presentation. */
export async function createWebGpuRenderer(): Promise<RendererHandle> {
  const renderer = new WebGPURenderer({ antialias: true, alpha: false });
  let loss: ((code: "WEBGPU_DEVICE_LOST" | "WEBGPU_RENDER_ERROR") => void) | undefined;
  let lost = false;
  let disposed = false;
  renderer.onDeviceLost = () => { lost = true; if (!disposed) loss?.("WEBGPU_DEVICE_LOST"); };
  renderer.onError = () => { lost = true; if (!disposed) loss?.("WEBGPU_RENDER_ERROR"); };
  try { await renderer.init(); if (lost) throw new Error("WEBGPU_DEVICE_LOST"); }
  catch (error) { renderer.dispose(); throw error; }
  const gpu = "isWebGPUBackend" in renderer.backend && renderer.backend.isWebGPUBackend === true;
  return {
    renderer, backend: gpu ? "webgpu" : "webgl2", rendererName: gpu ? "WebGPU" : "WebGL2 fallback",
    onLoss(callback) { loss = callback; if (lost && !disposed) queueMicrotask(() => { if (!disposed) callback("WEBGPU_DEVICE_LOST"); }); },
    dispose() { if (disposed) return; disposed = true; loss = undefined; renderer.dispose(); },
    createParticles(buffers, particleTexture) {
      const attributes = [
        new InstancedBufferAttribute(buffers.positions, 3), new InstancedBufferAttribute(buffers.colors, 3),
        new InstancedBufferAttribute(buffers.sizes, 1), new InstancedBufferAttribute(buffers.alphas, 1),
      ];
      const material = new PointsNodeMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: false });
      material.positionNode = instancedBufferAttribute(attributes[0], "vec3" as const);
      material.colorNode = instancedBufferAttribute(attributes[1], "vec3" as const);
      material.sizeNode = vec2(instancedBufferAttribute(attributes[2], "float" as const).mul(300).div(positionView.z.negate().max(0.1)).clamp(1, 64)).div(renderer.getPixelRatio());
      material.opacityNode = texture(particleTexture, uv()).a.mul(instancedBufferAttribute(attributes[3], "float" as const));
      const object = new Sprite(material);
      object.count = 0; object.frustumCulled = false;
      return { object, update(count) { object.count = count; for (const attribute of attributes) attribute.needsUpdate = true; },
        dispose() { object.removeFromParent(); material.dispose(); } };
    },
  };
}
