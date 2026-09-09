import * as THREE from "three";

const leases = new WeakMap<THREE.Object3D, () => void>();
/** Clones borrow cached geometry/materials. Only the final owner disposes them. */
export function registerGlbLease(root: THREE.Object3D, release: () => void): void {
  if (leases.has(root)) throw Error("GLB_LEASE_ALREADY_REGISTERED");
  leases.set(root, release);
}
export function releaseGlbTree(root: THREE.Object3D): void {
  root.traverse(node => {
    const release = leases.get(node);
    if (release) {
      leases.delete(node);
      const skeletons = new Set<THREE.Skeleton>();
      node.traverse(child => { if ((child as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((child as THREE.SkinnedMesh).skeleton); });
      for (const skeleton of skeletons) skeleton.dispose();
      release();
    }
  });
}
export function disposeGlbSource(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
  const images = new Set<any>();
  for (const texture of textures) { images.add(texture.image); texture.dispose(); }
  for (const image of images) if (typeof image?.close === "function") image.close();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
