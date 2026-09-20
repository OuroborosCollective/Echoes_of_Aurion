import * as THREE from "three";
import { z } from "zod";
import { CHUNK_ASSET_PROJECTION_POLICY, decodeChunkAssetWorkerPayload, type ChunkAssetPayload } from "@shared/worldChunkProjectionPayload";
import { createWorldChunkProjectionWorkerJobV2, decodeWorldChunkProjectionManifestV2, matchesWorldChunkProjectionWorkerResultV2, type WorldChunkProjectionWorkerJobV2 } from "@shared/worldChunkProjectionV2";
import { splitWorldChunkPositionMm } from "@shared/worldChunkProtocol";
import { GLOBAL_WORLD_ID } from "@shared/worldIdentity";

const envelope = z.strictObject({ status: z.literal("VERIFIED"), epoch: z.number().int().min(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/), membership: z.enum(["COMMITTED_CHUNK_RECEIPT", "GENERATOR_AND_EMPTY_STREAM"]),
  manifest: z.unknown(), payloadJson: z.string().max(1_000_000), mutationAuthority: z.literal("none") });

export async function prepareConfirmedChunkProjection(value: unknown, epoch: number, coordinate: { x: number; z: number }, generation: number) {
  const packet = envelope.parse(value);
  const bytes = new TextEncoder().encode(packet.payloadJson);
  const manifest = await decodeWorldChunkProjectionManifestV2(packet.manifest);
  if (packet.epoch !== epoch || manifest.worldId !== GLOBAL_WORLD_ID || manifest.coordinate.x !== coordinate.x || manifest.coordinate.z !== coordinate.z || manifest.projectionPolicy !== CHUNK_ASSET_PROJECTION_POLICY) throw Error("PROJECTION_RESPONSE_IDENTITY_MISMATCH");
  const job = await createWorldChunkProjectionWorkerJobV2({ manifest, generation });
  const decoded = await decodeChunkAssetWorkerPayload(job, bytes);
  if (decoded.decoded.epoch !== epoch) throw Error("PROJECTION_EPOCH_MISMATCH");
  return { job, bytes, decoded: decoded.decoded };
}

function workerDecode(job: WorldChunkProjectionWorkerJobV2, bytes: Uint8Array, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL("../world/chunkProjection.worker.ts", import.meta.url), { type: "module" });
    const finish = (error?: Error, value?: unknown) => { clearTimeout(timeout); signal.removeEventListener("abort", abort); worker.terminate(); error ? reject(error) : resolve(value); };
    const abort = () => finish(Error("PROJECTION_RETIRED"));
    const timeout = setTimeout(() => finish(Error("PROJECTION_WORKER_TIMEOUT")), 5000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(Error("PROJECTION_WORKER_FAILED"));
    worker.onmessage = event => event.data?.status === "DECODED" ? finish(undefined, event.data.result) : finish(Error("PROJECTION_WORKER_REJECTED"));
    try { worker.postMessage({ job, payload: new Uint8Array(bytes) }); } catch { finish(Error("PROJECTION_WORKER_SEND_FAILED")); }
  });
}

function disposeGroup(group: THREE.Group) {
  group.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); } });
  group.removeFromParent();
}

/** Deterministic construction markers/road surfaces. No collision or gameplay callback. */
export function buildConfirmedChunkMeshes(payload: ChunkAssetPayload, terrain: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group();
  const point = (p: { x: number; z: number }) => ({ x: payload.coordinate.x * 64 + p.x / 1000 - 32, z: payload.coordinate.z * 64 + p.z / 1000 - 32 });
  try {
    for (const structure of payload.structures) {
      const marker = structure.assetKey === "aurion_tripo_starpath_marker";
      if (!marker && structure.assetKey !== "aurion_tripo_garden_border") throw Error("PROJECTION_STRUCTURE_POLICY_UNSUPPORTED");
      const height = marker ? 1.5 : 0.3;
      const geometry = marker ? new THREE.CylinderGeometry(0.15, 0.3, height, 6) : new THREE.BoxGeometry(2, height, 0.3);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: marker ? 0xc6a459 : 0x566a3b }));
      mesh.name = structure.id; group.add(mesh);
      const p = point(structure.positionMm); mesh.position.set(p.x, terrain(p.x, p.z) + height / 2, p.z);
    }
    for (const road of payload.roads) {
      const a = point(road.fromMm), b = point(road.toMm), length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!length) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, length), new THREE.MeshStandardMaterial({ color: 0x74684e }));
      mesh.name = road.id; group.add(mesh);
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2; mesh.position.set(x, terrain(x, z) + 0.025, z); mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }
    return group;
  } catch (error) { disposeGroup(group); throw error; }
}

/** View-only active AX1 path. A failed/missing receipt removes this overlay, never world state. */
export class ConfirmedChunkProjection {
  private readonly abort = new AbortController();
  private readonly groups = new Map<string, THREE.Group>();
  private readonly pending = new Set<string>();
  private desired: { x: number; z: number }[] = [];
  private serial = 0;
  private center = "";
  constructor(private scene: THREE.Scene, private epoch: number,
    private terrain: (x: number, z: number) => number,
    private fetch: (input: { epoch: number; chunkX: number; chunkZ: number }) => Promise<unknown>,
    private report: (evidence: { status: string; count: number; meshCount?: number; projectionHash?: string; worldRootHash?: string }) => void) {}

  update(position: { x: number; z: number }) {
    if (this.abort.signal.aborted || this.epoch < 1) return;
    const c = splitWorldChunkPositionMm({ x: Math.round(position.x * 1000), z: Math.round(position.z * 1000) }).coordinate;
    const key = `${c.x}:${c.z}`;
    if (this.center === key) return;
    this.center = key; this.desired = [];
    for (let z = c.z - 1; z <= c.z + 1; z++) for (let x = c.x - 1; x <= c.x + 1; x++) if (Math.abs(x) <= 1_000_000 && Math.abs(z) <= 1_000_000) this.desired.push({ x, z });
    const desired = new Set(this.desired.map(p => `${p.x}:${p.z}`));
    for (const [id, group] of this.groups) if (!desired.has(id)) { disposeGroup(group); this.groups.delete(id); }
    this.pump();
  }

  private pump() {
    if (this.abort.signal.aborted) return;
    while (this.pending.size < 2) {
      const index = this.desired.findIndex(p => !this.groups.has(`${p.x}:${p.z}`) && !this.pending.has(`${p.x}:${p.z}`));
      if (index < 0) return;
      const [coordinate] = this.desired.splice(index, 1);
      if (!coordinate) return;
      const key = `${coordinate.x}:${coordinate.z}`;
      const center = this.center, generation = ++this.serial;
      this.pending.add(key);
      void this.fetch({ epoch: this.epoch, chunkX: coordinate.x, chunkZ: coordinate.z }).then(async value => {
        const prepared = await prepareConfirmedChunkProjection(value, this.epoch, coordinate, generation);
        const result = await workerDecode(prepared.job, prepared.bytes, this.abort.signal);
        if (!await matchesWorldChunkProjectionWorkerResultV2(prepared.job, result, prepared.bytes)) throw Error("PROJECTION_WORKER_BINDING_MISMATCH");
        if (this.abort.signal.aborted || center !== this.center) return;
        const group = buildConfirmedChunkMeshes(prepared.decoded, this.terrain);
        this.groups.set(key, group); this.scene.add(group);
        const meshCount = [...this.groups.values()].reduce((total, item) => total + item.children.length, 0);
        this.report({ status: "APPLIED", count: this.groups.size, meshCount, projectionHash: prepared.job.manifest.projectionHash, worldRootHash: prepared.job.manifest.worldCausalRoot });
      }).catch(() => { if (!this.abort.signal.aborted && center === this.center) this.report({ status: "UNPROVABLE", count: this.groups.size }); })
        .finally(() => { this.pending.delete(key); this.pump(); });
    }
  }

  dispose() { this.abort.abort(); for (const group of this.groups.values()) disposeGroup(group); this.groups.clear(); this.desired = []; }
}
