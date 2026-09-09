import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/** GLTFLoader can resolve a model after catching individual texture failures.
 * Success therefore also requires every referenced material texture to exist. */
export function requireDecodedMaterialTextures(gltf: GLTF, json: any): void {
  gltf.scene.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const materialIndex = gltf.parser.associations.get(material)?.materials;
      if (materialIndex === undefined) continue; // glTF's implicit default has no textures.
      const required = new Set<number>(), actual = new Set<number>();
      const visit = (value: unknown, key = "") => {
        if (!value || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        if (/Texture$/.test(key) && Number.isSafeInteger(record.index)) required.add(record.index as number);
        for (const [name, child] of Object.entries(record)) if (name !== "extras") visit(child, name);
      };
      visit(json.materials?.[materialIndex]);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
        const index = gltf.parser.associations.get(value)?.textures;
        if (index !== undefined) actual.add(index);
      }
      for (const index of required) if (!actual.has(index)) throw Error("GLB_TEXTURE_DECODE_INCOMPLETE");
    }
  });
}
