import { glbRuntimeCatalogSchema, type GlbEquipmentSlot, type GlbImportPurpose } from "@shared/glbImportContract";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RPGItem, WeaponType, ItemRarity } from '../types';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { fetchVerifiedGlb, glbResourcePool, inspectGlbAllocation } from './GlbResourceBudget';
import { disposeGlbSource, registerGlbLease } from './GlbModelLease';
import { requireDecodedMaterialTextures } from './GlbTextureEvidence';

export interface GLBModelEntry {
  id: string;
  name: string;
  fileName: string;
  relativePath?: string;
  url: string;
  category:
    | 'character_avatar'
    | 'mob'
    | 'mount'
    | 'weapon'
    | 'shield'
    | 'offhand'
    | 'helmet'
    | 'chest'
    | 'shoulders'
    | 'arms'
    | 'legs'
    | 'boots'
    | 'prop'
    | 'architecture';
  purpose?: GlbImportPurpose;
  subcategory?: string | null;
  equipmentSlot?: GlbEquipmentSlot | null;
  equipSlot?: string;
  weaponType?: WeaponType;
  rarity?: ItemRarity;
  itemStats?: {
    attack?: number;
    spellPower?: number;
    armor?: number;
    critChance?: number;
    moveSpeed?: number;
    maxHp?: number;
    maxResource?: number;
  };
  triangleBudget?: number;
  boneCount?: number;
  fileSizeBytes?: number;
  status: string;
  animations: string[];
  description: string;
  referenceUrl?: string;
  author?: string;
  sourceDirectory?: string;
  uploadedAt?: string;
  lastScannedAt?: string;
}

export interface WatcherEvent {
  id: string;
  timestamp: string;
  type: 'added' | 'modified' | 'deleted' | 'scanned' | 'synced' | 'watcher_started' | 'watcher_stopped';
  fileName: string;
  modelId?: string;
  category?: string;
  directory: string;
  message: string;
  details?: any;
}

export interface WatchStatus {
  isWatching: boolean;
  watchedDirectories: string[];
  totalModels: number;
  activeDirectory: string;
  lastScanTime: string | null;
  lastEventTime: string | null;
  recentEvents: WatcherEvent[];
}

function runtimeCategory(entry: ReturnType<typeof glbRuntimeCatalogSchema.parse>["entries"][number]): GLBModelEntry["category"] {
  if (entry.purpose === "world-environment") return 'architecture';
  if (entry.purpose === "world-nature") return 'prop';
  if (entry.purpose === "equipment" && entry.equipmentSlot) return entry.equipmentSlot;
  if (entry.assetType === 'character') return 'character_avatar';
  if (entry.assetType === 'enemy') return 'mob';
  if (entry.assetType === 'arena') return 'architecture';
  if (entry.assetType === 'weapon') return 'weapon';
  return 'prop';
}

type CachedModel = { scene: THREE.Group; animations: THREE.AnimationClip[]; users: number; access: number; release: () => void };

export class GLBModelManager {
  private static instance: GLBModelManager;
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private cache = new Map<string, CachedModel>();
  private pending = new Map<string, Promise<CachedModel>>();
  private access = 0;
  private catalog: GLBModelEntry[] = [];
  private isFetching = false;
  private eventSource: EventSource | null = null;
  private eventListeners: Set<(event: WatcherEvent) => void> = new Set();

  private constructor() {}

  public static getInstance(): GLBModelManager {
    if (!GLBModelManager.instance) GLBModelManager.instance = new GLBModelManager();
    return GLBModelManager.instance;
  }

  public async fetchCatalog(): Promise<GLBModelEntry[]> {
    const response = await fetch('/api/game/glb-catalog', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('GLB_CATALOG_UNAVAILABLE');
    const catalog = glbRuntimeCatalogSchema.parse(await response.json());
    this.setAuthoritativeCatalog(catalog.entries.map(entry => ({
      id: entry.assetId,
      name: entry.displayName,
      fileName: `${entry.sha256}.glb`,
      url: entry.storageUrl,
      category: runtimeCategory(entry),
      purpose: entry.purpose,
      subcategory: entry.subcategory,
      equipmentSlot: entry.equipmentSlot,
      equipSlot: entry.equipmentSlot ?? undefined,
      status: 'approved',
      animations: [],
      description: `Aurion catalog: ${entry.purpose}:${entry.subcategory ?? entry.targetKey ?? entry.assetType}`,
    })));
    return this.catalog;
  }

  public setAuthoritativeCatalog(models: GLBModelEntry[]): void { this.catalog = Array.isArray(models) ? models.slice() : []; }
  public getCachedCatalog(): GLBModelEntry[] { return this.catalog; }

  public async scanExternalDirectory(directoryPath?: string): Promise<{ success: boolean; scannedDirectory: string; totalModels: number; models: GLBModelEntry[]; watchStatus?: WatchStatus }> {
    return { success: false, scannedDirectory: directoryPath || 'Aurion server-authoritative asset catalog', totalModels: this.catalog.length, models: this.catalog.slice(), watchStatus: (await this.getWatchStatus()) || undefined };
  }
  public async getWatchStatus(): Promise<WatchStatus | null> { return { isWatching: false, watchedDirectories: [], totalModels: this.catalog.length, activeDirectory: 'Aurion authority', lastScanTime: null, lastEventTime: null, recentEvents: [] }; }
  public async toggleFileWatcher(_active: boolean, _directory?: string): Promise<boolean> { return false; }
  public subscribeToWatchEvents(onEvent: (event: WatcherEvent) => void): () => void { this.eventListeners.add(onEvent); return () => { this.eventListeners.delete(onEvent); }; }

  public convertToRpgItem(_model: GLBModelEntry): RPGItem {
    throw new Error('GLB_VISUAL_CATALOG_CANNOT_GRANT_ITEMS');
  }

  /** Idle cache entries can be evicted; resources used by a live clone cannot. */
  public trimIdle(): void {
    for (const [url, entry] of [...this.cache].sort((a, b) => a[1].access - b[1].access)) {
      if (entry.users || this.pending.has(url)) continue;
      this.cache.delete(url); disposeGlbSource(entry.scene); entry.release();
    }
  }

  private async decode(url: string, sha256: string): Promise<CachedModel> {
    return glbResourcePool.job(glbResourcePool.limits.assetBytes, async () => {
      const signal = AbortSignal.timeout(20_000);
      const bytes = await fetchVerifiedGlb({url, sha256}, signal);
      const {allocation, json} = inspectGlbAllocation(bytes);
      let release = glbResourcePool.reserve(allocation);
      if (!release) { this.trimIdle(); release = glbResourcePool.reserve(allocation); }
      if (!release) throw Error('GLB_DECODED_BUDGET');
      const started = performance.now();
      let retired = false, abort: (() => void) | undefined, decoded: THREE.Group | undefined;
      const parse = this.loader.parseAsync(bytes, '').then(gltf => {
        if (retired || signal.aborted) { disposeGlbSource(gltf.scene); throw Error('GLB_DECODE_RETIRED'); }
        return gltf;
      });
      try {
        signal.throwIfAborted();
        const gltf = await Promise.race([parse, new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason); signal.addEventListener('abort', abort, {once: true});
        })]);
        decoded = gltf.scene;
        requireDecodedMaterialTextures(gltf, json);
        gltf.scene.traverse(node => { if ((node as THREE.Mesh).isMesh) { node.castShadow = true; node.receiveShadow = true; } });
        glbResourcePool.decodedModel(performance.now() - started);
        const entry = {scene: gltf.scene, animations: gltf.animations, users: 0, access: ++this.access, release};
        this.cache.set(url, entry);
        return entry;
      } catch (error) { if (decoded) disposeGlbSource(decoded); release(); throw error; }
      finally { retired = true; if (abort) signal.removeEventListener('abort', abort); }
    });
  }

  public async loadModel(urlOrId: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    const found = this.catalog.find(entry => entry.id === urlOrId);
    const url = found?.url ?? urlOrId;
    const match = /^\/api\/assets\/glb\/([a-f0-9]{64})\.glb$/.exec(url);
    if (!match) throw Error('GLB_SOURCE_HASH_REQUIRED');
    let entry = this.cache.get(url);
    if (!entry) {
      let pending = this.pending.get(url);
      if (!pending) {
        pending = this.decode(url, match[1]!);
        this.pending.set(url, pending);
      }
      try { entry = await pending; }
      finally { if (this.pending.get(url) === pending) this.pending.delete(url); }
    }
    const releaseActor = glbResourcePool.actor(Math.min(entry.animations.length, 2));
    if (!releaseActor) throw Error('GLB_ACTOR_BUDGET');
    entry.users++; entry.access = ++this.access;
    let scene: THREE.Group;
    try { scene = cloneSkeleton(entry.scene) as THREE.Group; }
    catch (error) { entry.users--; releaseActor(); throw error; }
    const borrowed = entry;
    registerGlbLease(scene, () => { releaseActor(); borrowed.users--; });
    return {scene, animations: entry.animations};
  }

  public async loadEquipmentMesh(modelIdOrUrl: string, slot: string): Promise<THREE.Group | null> {
    try {
      const { scene } = await this.loadModel(modelIdOrUrl);
      const container = new THREE.Group(); container.name = `glb_socket_${slot}_${modelIdOrUrl}`;
      const box = new THREE.Box3().setFromObject(scene); const size = new THREE.Vector3(); box.getSize(size); const maxDim = Math.max(size.x, size.y, size.z);
      let targetScale = 1.0;
      if (slot === 'weapon') { targetScale = maxDim > 0 ? 1.4 / maxDim : 1.0; scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); }
      else if (slot === 'shield' || slot === 'offhand') { targetScale = maxDim > 0 ? 1.1 / maxDim : 1.0; scene.position.set(0, 0, 0); }
      else if (slot === 'helmet' || slot === 'head') { targetScale = maxDim > 0 ? 0.9 / maxDim : 1.0; scene.position.set(0, 0, 0); }
      else if (slot === 'chest') { targetScale = maxDim > 0 ? 1.2 / maxDim : 1.0; scene.position.set(0, 0, 0); }
      scene.scale.set(targetScale, targetScale, targetScale); container.add(scene); return container;
    } catch (err) { console.warn(`Could not load GLB equipment socket for ${modelIdOrUrl}:`, err); return null; }
  }

  public async uploadModelExternal(fileName: string, _base64Data: string, metadata: Partial<GLBModelEntry>) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aurion:xaurion-glb-upload-request', { detail: { fileName, metadata } }));
    return { success: false, delegated: true, reason: 'AURION_ASSET_AUTHORITY_REQUIRED' };
  }
}

export const glbManager = GLBModelManager.getInstance();
