import {
  glbCatalogLods,
  glbRuntimeCatalogSchema,
  type GlbCatalogEntry,
  type GlbCatalogLodVariant,
  type GlbEquipmentSlot,
  type GlbImportPurpose,
} from "@shared/glbImportContract";
import type { GlbNormalizationManifest } from "@shared/glbNormalizationContract";
import { AURION_STARTER_CITY_WALL_HEADROOM_KEY, isStarterCityWallSource, starterCityWallAllocation } from "@shared/aurionStarterCityWallContract";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RPGItem, WeaponType, ItemRarity } from "../types";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  assetBudgets,
  fetchVerifiedGlb,
  glbResourcePool,
  inspectGlbAllocation,
  type AssetTier,
  type GlbResourcePool,
} from "./GlbResourceBudget";
import {
  disposeGlbSource,
  registerGlbLease,
  releaseGlbTree,
} from "./GlbModelLease";
import { requireDecodedMaterialTextures } from "./GlbTextureEvidence";
import { canDownsampleGlbTextures, GlbTextureDownsamplePlugin, texturesByImage } from "./GlbTextureDownsample";
import { embeddedImageHashes, glbSharedTextures } from "./GlbSharedTextures";
import { MIN_TEXTURE_DIMENSION, mipChainBytes, type GlbAllocation, type GlbImageSize } from "@shared/glbPresentationBudget";

export interface GLBModelEntry {
  id: string;
  name: string;
  fileName: string;
  relativePath?: string;
  url: string;
  category:
    | "character_avatar"
    | "mob"
    | "mount"
    | "weapon"
    | "shield"
    | "offhand"
    | "helmet"
    | "chest"
    | "shoulders"
    | "arms"
    | "legs"
    | "boots"
    | "prop"
    | "architecture";
  purpose?: GlbImportPurpose;
  subcategory?: string | null;
  equipmentSlot?: GlbEquipmentSlot | null;
  normalization: GlbNormalizationManifest;
  lods?: readonly GlbCatalogLodVariant[];
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
  type:
    | "added"
    | "modified"
    | "deleted"
    | "scanned"
    | "synced"
    | "watcher_started"
    | "watcher_stopped";
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

function runtimeCategory(
  entry: ReturnType<typeof glbRuntimeCatalogSchema.parse>["entries"][number]
): GLBModelEntry["category"] {
  if (entry.purpose === "world-environment") return "architecture";
  if (entry.purpose === "world-nature") return "prop";
  if (entry.purpose === "equipment" && entry.equipmentSlot)
    return entry.equipmentSlot;
  if (entry.assetType === "character") return "character_avatar";
  if (entry.assetType === "enemy") return "mob";
  if (entry.assetType === "arena") return "architecture";
  if (entry.assetType === "weapon") return "weapon";
  return "prop";
}

const CATALOG_LOD_HYSTERESIS = 0.1;

/**
 * Admit physical LODs under the unchanged device byte ceiling.
 * The SHA-pinned textured city wall is a single world object: retaining its
 * full three-level family exhausts tablet texture/decoded memory before any
 * other scenery can be projected. Mobile clients therefore request only its
 * cheapest approved physical LOD. Desktop retains the full distance LOD set.
 * Unknown or mismatched hashes never receive the wall exception.
 */
export function selectStaticWorldLodVariants(
  entry: GlbCatalogEntry,
  tier: AssetTier = glbResourcePool.tier,
): readonly GlbCatalogLodVariant[] {
  const variants = glbCatalogLods(entry)
    .filter(variant => variant.bytes === null || variant.bytes <= assetBudgets[tier].assetBytes)
    .slice()
    .sort((left, right) => left.level - right.level || left.sha256.localeCompare(right.sha256));
  // Phones keep one physical LOD per family: each LOD carries its own full
  // texture set, so a family would multiply texture memory for a 360 px screen.
  if (!isStarterCityWallSource(entry.sha256)) return tier === "phone" ? variants.slice(0, 1) : variants;
  if (tier === "desktop") return variants;
  // Never claim unknown bytes as the SHA-pinned city wall family.
  if (variants.some(variant => !isStarterCityWallSource(variant.sha256))) return [];
  // Preserve all LODs where the doubled tablet budget admits the measured 88 MB
  // texture family; on phones, display the high-detail wall without loading
  // three redundant resident texture sets at once.
  return tier === "tablet" ? variants : variants.slice(0, 1);
}

/**
 * Decoded/texture headroom the pinned city wall needs on this device tier: the
 * pinned allocation of exactly the LODs `selectStaticWorldLodVariants` admits.
 * Null for every other model and for a family that cannot be the pinned wall.
 */
export function starterCityWallHeadroom(
  entry: GlbCatalogEntry,
  tier: AssetTier = glbResourcePool.tier,
): { decodedBytes: number; textureBytes: number } | null {
  if (!isStarterCityWallSource(entry.sha256)) return null;
  const variants = selectStaticWorldLodVariants(entry, tier);
  if (variants.length === 0) return null;
  let decodedBytes = 0, textureBytes = 0;
  for (const variant of variants) {
    const allocation = starterCityWallAllocation(variant.sha256);
    if (!allocation) return null;
    decodedBytes += allocation.decodedBytes;
    textureBytes += allocation.textureBytes;
  }
  return { decodedBytes, textureBytes };
}

/**
 * Admit one GLB into the device pool. Textures are decoded at most at the tier's
 * edge; while the budget is still exhausted (after evicting idle models) the edge
 * is halved down to MIN_TEXTURE_DIMENSION, so the model appears with less texture
 * detail instead of not at all. No byte ceiling is raised. Null if even the
 * minimum edge does not fit.
 */
export function admitGlbAllocation<T extends { allocation: GlbAllocation; images: readonly (GlbImageSize | null)[]; parts?: readonly (GlbAllocation & { countsModel?: boolean })[] }>(
  pool: GlbResourcePool,
  inspect: (maxTextureDimension: number) => T,
  options: { headroomKey?: string; resizable: boolean; trimIdle?: () => void },
): { inspected: T; release: () => void; partReleases: (() => void)[]; textureDimension: number } | null {
  const initialDimension: number = options.resizable ? pool.limits.textureDimension : 4096;
  let textureDimension = initialDimension;
  let inspected = inspect(textureDimension);
  // Fair share: no single model may claim more than its share of the texture
  // budget, whatever order downloads finish in. Already resident shared images
  // cost nothing here. The headroom owner is exempt.
  const share = pool.limits.textureShareModels > 0 && !options.headroomKey ? pool.limits.textureBytes / pool.limits.textureShareModels : Infinity;
  const canHalve = () => options.resizable && textureDimension > MIN_TEXTURE_DIMENSION
    && inspected.images.some(size => size && Math.max(size.decodedWidth, size.decodedHeight) > MIN_TEXTURE_DIMENSION);
  while (inspected.allocation.textureBytes > share && canHalve()) {
    textureDimension = Math.max(MIN_TEXTURE_DIMENSION, textureDimension / 2);
    inspected = inspect(textureDimension);
  }
  const reserve = () => pool.reserveParts(inspected.parts ?? [{ ...inspected.allocation, countsModel: true }], options.headroomKey);
  let reserved = reserve();
  if (!reserved && options.trimIdle) {
    options.trimIdle();
    reserved = reserve();
  }
  while (!reserved && canHalve()) {
    textureDimension = Math.max(MIN_TEXTURE_DIMENSION, textureDimension / 2);
    inspected = inspect(textureDimension);
    reserved = reserve();
  }
  // Count every admission below the tier edge, whether fair share or pressure reduced it.
  if (reserved && textureDimension < initialDimension) pool.reducedTextures();
  return reserved ? { inspected, release: reserved.release, partReleases: reserved.parts, textureDimension } : null;
}

/**
 * Allocation of one GLB given the images that are already resident in the shared
 * texture cache: those cost nothing; every other distinct image is its own part
 * (handed to the cache after decoding); geometry is the model's own part.
 */
export function sharedGlbAllocation(
  inspected: { allocation: GlbAllocation; images: readonly (GlbImageSize | null)[] },
  hashes: readonly string[],
  resident: ReadonlySet<string>,
) {
  const geometryBytes = inspected.allocation.decodedBytes - inspected.allocation.textureBytes;
  const parts: (GlbAllocation & { countsModel?: boolean })[] = [{ decodedBytes: geometryBytes, textureBytes: 0, animations: inspected.allocation.animations, countsModel: true }];
  const fresh: string[] = [];
  let textureBytes = 0;
  inspected.images.forEach((size, index) => {
    const hash = hashes[index];
    if (!size || hash === undefined || resident.has(hash) || fresh.includes(hash)) return;
    const bytes = mipChainBytes(size.decodedWidth, size.decodedHeight);
    parts.push({ decodedBytes: bytes, textureBytes: bytes, animations: 0 });
    fresh.push(hash);
    textureBytes += bytes;
  });
  return { allocation: { decodedBytes: geometryBytes + textureBytes, textureBytes, animations: inspected.allocation.animations }, parts, fresh };
}

function closeImage(data: unknown): void {
  const image = data as { close?: () => void } | null;
  if (typeof image?.close === "function") image.close();
}

/** Textures built from a resident shared image must never close that image on dispose. */
function markResidentTextures(gltf: GLTF, hashes: readonly string[], resident: ReadonlySet<string>): void {
  for (const [source, textures] of texturesByImage(gltf)) {
    const hash = hashes[source];
    if (hash !== undefined && resident.has(hash)) for (const texture of textures) texture.userData.aurionSharedImage = hash;
  }
}

type CachedModel = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  hasRig: boolean;
  users: number;
  access: number;
  release: () => void;
  /** Shared images this decoded model holds one reference on. */
  sharedHashes: readonly string[];
};

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
    if (!GLBModelManager.instance)
      GLBModelManager.instance = new GLBModelManager();
    return GLBModelManager.instance;
  }

  public async fetchCatalog(): Promise<GLBModelEntry[]> {
    const response = await fetch("/api/game/glb-catalog", {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("GLB_CATALOG_UNAVAILABLE");
    const catalog = glbRuntimeCatalogSchema.parse(await response.json());
    this.setAuthoritativeCatalog(
      catalog.entries.map(entry => ({
        id: entry.assetId,
        name: entry.displayName,
        fileName: `${entry.sha256}.glb`,
        url: entry.storageUrl,
        category: runtimeCategory(entry),
        purpose: entry.purpose,
        subcategory: entry.subcategory,
        equipmentSlot: entry.equipmentSlot,
        normalization: entry.normalization,
        lods: entry.lods,
        equipSlot: entry.equipmentSlot ?? undefined,
        status: "approved",
        animations: [],
        description: `Aurion catalog: ${entry.purpose}:${entry.subcategory ?? entry.targetKey ?? entry.assetType}`,
      }))
    );
    return this.catalog;
  }

  public setAuthoritativeCatalog(models: GLBModelEntry[]): void {
    this.catalog = Array.isArray(models) ? models.slice() : [];
  }
  public getCachedCatalog(): GLBModelEntry[] {
    return this.catalog;
  }

  public async scanExternalDirectory(
    directoryPath?: string
  ): Promise<{
    success: boolean;
    scannedDirectory: string;
    totalModels: number;
    models: GLBModelEntry[];
    watchStatus?: WatchStatus;
  }> {
    return {
      success: false,
      scannedDirectory:
        directoryPath || "Aurion server-authoritative asset catalog",
      totalModels: this.catalog.length,
      models: this.catalog.slice(),
      watchStatus: (await this.getWatchStatus()) || undefined,
    };
  }
  public async getWatchStatus(): Promise<WatchStatus | null> {
    return {
      isWatching: false,
      watchedDirectories: [],
      totalModels: this.catalog.length,
      activeDirectory: "Aurion authority",
      lastScanTime: null,
      lastEventTime: null,
      recentEvents: [],
    };
  }
  public async toggleFileWatcher(
    _active: boolean,
    _directory?: string
  ): Promise<boolean> {
    return false;
  }
  public subscribeToWatchEvents(
    onEvent: (event: WatcherEvent) => void
  ): () => void {
    this.eventListeners.add(onEvent);
    return () => {
      this.eventListeners.delete(onEvent);
    };
  }

  public convertToRpgItem(_model: GLBModelEntry): RPGItem {
    throw new Error("GLB_VISUAL_CATALOG_CANNOT_GRANT_ITEMS");
  }

  /** Idle cache entries can be evicted; resources used by a live clone cannot. */
  public trimIdle(): void {
    for (const [url, entry] of [...this.cache].sort(
      (a, b) => a[1].access - b[1].access
    )) {
      if (entry.users || this.pending.has(url)) continue;
      this.cache.delete(url);
      disposeGlbSource(entry.scene);
      entry.release();
      for (const hash of entry.sharedHashes) glbSharedTextures.releaseRef(hash);
    }
  }

  /** Reserve decoded memory for one GLB (see `admitGlbAllocation` and `sharedGlbAllocation`). */
  private admitDecodedModel(bytes: ArrayBuffer, sha256: string, hashes: readonly string[], resident: ReadonlySet<string>) {
    // The pinned wall draws on the headroom its projection holds for it.
    const headroomKey = isStarterCityWallSource(sha256) ? AURION_STARTER_CITY_WALL_HEADROOM_KEY : undefined;
    const admitted = admitGlbAllocation(glbResourcePool, edge => {
      const inspected = inspectGlbAllocation(bytes, edge);
      return { ...inspected, ...sharedGlbAllocation(inspected, hashes, resident) };
    }, { headroomKey, resizable: canDownsampleGlbTextures(), trimIdle: () => this.trimIdle() });
    if (!admitted) throw Error("GLB_DECODED_BUDGET");
    return admitted;
  }

  private async decode(url: string, sha256: string): Promise<CachedModel> {
    return glbResourcePool.job(glbResourcePool.limits.assetBytes, async () => {
      const signal = AbortSignal.timeout(20_000);
      const bytes = await fetchVerifiedGlb({ url, sha256 }, signal);
      const hashes = await embeddedImageHashes(bytes, inspectGlbAllocation(bytes).json);
      // Images already decoded for another model are reused; hold them so that
      // evicting idle models during admission cannot free them underneath us.
      const owned = new Set<string>();
      for (const hash of new Set(hashes)) if (glbSharedTextures.acquire(hash)) owned.add(hash);
      const resident = new Set(owned);
      let admitted: ReturnType<GLBModelManager["admitDecodedModel"]>;
      try {
        admitted = this.admitDecodedModel(bytes, sha256, hashes, resident);
      } catch (error) {
        for (const hash of owned) glbSharedTextures.releaseRef(hash);
        throw error;
      }
      const { inspected, partReleases, textureDimension } = admitted;
      const release = partReleases[0]!;
      const freshParts = new Map(inspected.fresh.map((hash, index) => [hash, partReleases[index + 1]!] as const));
      const { json } = inspected;
      const started = performance.now();
      let retired = false,
        abort: (() => void) | undefined,
        decoded: THREE.Group | undefined;
      const residentData = new Map<number, unknown>();
      hashes.forEach((hash, index) => { if (resident.has(hash)) residentData.set(index, glbSharedTextures.peek(hash)!.source.data); });
      const downsampled = inspected.images.some(size => size && (size.decodedWidth !== size.width || size.decodedHeight !== size.height));
      const loader = downsampled || residentData.size
        ? new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(parser => new GlbTextureDownsamplePlugin(parser, inspected.images, residentData))
        : this.loader;
      const parse = loader.parseAsync(bytes, "").then(gltf => {
        if (retired || signal.aborted) {
          markResidentTextures(gltf, hashes, resident);
          disposeGlbSource(gltf.scene);
          throw Error("GLB_DECODE_RETIRED");
        }
        return gltf;
      });
      try {
        signal.throwIfAborted();
        const gltf = await Promise.race([
          parse,
          new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
          }),
        ]);
        decoded = gltf.scene;
        markResidentTextures(gltf, hashes, resident);
        requireDecodedMaterialTextures(gltf, json);
        const byImage = texturesByImage(gltf);
        // Fail closed if the browser produced larger textures than were budgeted.
        for (const [source, textures] of byImage) {
          if (resident.has(hashes[source]!)) continue;
          const size = inspected.images[source], image = textures[0]!.image as { width?: number; height?: number } | undefined;
          if (size && Math.max(image?.width ?? 0, image?.height ?? 0) > Math.max(size.decodedWidth, size.decodedHeight)) throw Error("GLB_TEXTURE_DOWNSAMPLE_UNAVAILABLE");
        }
        // Hand every freshly decoded image to the shared cache (or reuse a copy
        // another decode registered meanwhile); all textures point at one source.
        for (const [source, textures] of byImage) {
          const hash = hashes[source]!;
          let shared = glbSharedTextures.peek(hash)?.source;
          if (!owned.has(hash)) {
            const part = freshParts.get(hash);
            if (!part) throw Error("GLB_SHARED_TEXTURE_UNBUDGETED");
            const image = textures[0]!.image as { width: number; height: number };
            const result = glbSharedTextures.adopt(hash, textures[0]!.source as THREE.Source<unknown>, { width: image.width, height: image.height }, mipChainBytes(image.width, image.height), part);
            freshParts.delete(hash);
            owned.add(hash);
            if (!result.adopted) closeImage(textures[0]!.source.data);
            shared = result.source;
          } else if (shared !== textures[0]!.source) {
            if (!resident.has(hash)) closeImage(textures[0]!.source.data);
          }
          for (const texture of textures) {
            texture.source = shared! as typeof texture.source;
            texture.userData.aurionSharedImage = hash;
          }
        }
        for (const part of freshParts.values()) part();
        freshParts.clear();
        gltf.scene.userData.aurionTextureDimension = textureDimension;
        let hasRig = false;
        gltf.scene.traverse(node => {
          if ((node as THREE.Bone).isBone || (node as THREE.SkinnedMesh).isSkinnedMesh) hasRig = true;
          if ((node as THREE.Mesh).isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        glbResourcePool.decodedModel(performance.now() - started);
        const entry = {
          scene: gltf.scene,
          animations: gltf.animations,
          hasRig,
          users: 0,
          access: ++this.access,
          release,
          sharedHashes: Object.freeze([...owned]),
        };
        this.cache.set(url, entry);
        return entry;
      } catch (error) {
        if (decoded) disposeGlbSource(decoded);
        release();
        for (const part of freshParts.values()) part();
        for (const hash of owned) glbSharedTextures.releaseRef(hash);
        throw error;
      } finally {
        retired = true;
        if (abort) signal.removeEventListener("abort", abort);
      }
    });
  }

  public async loadModel(
    urlOrId: string,
    normalizationOverride?: GlbNormalizationManifest
  ): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    let found = this.catalog.find(
      entry =>
        entry.id === urlOrId ||
        entry.url === urlOrId ||
        entry.lods?.some(lod => lod.storageUrl === urlOrId)
    );
    // Runtime consumers may receive a confirmed storage URL before the
    // operational catalog hook has completed. Bind the server-authoritative
    // catalog before decoding so normalization is never guessed or omitted.
    if (
      !found &&
      this.catalog.length === 0 &&
      !normalizationOverride &&
      /^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/.test(urlOrId)
    ) {
      await this.fetchCatalog();
      found = this.catalog.find(
        entry =>
          entry.id === urlOrId ||
          entry.url === urlOrId ||
          entry.lods?.some(lod => lod.storageUrl === urlOrId)
      );
    }
    const variant = found?.lods?.find(lod => lod.storageUrl === urlOrId);
    const url = found?.id === urlOrId ? found.url : urlOrId;
    const match = /^\/api\/assets\/glb\/([a-f0-9]{64})\.glb$/.exec(url);
    if (!match) throw Error("GLB_SOURCE_HASH_REQUIRED");
    const normalization =
      normalizationOverride ?? variant?.normalization ?? found?.normalization;
    if (!normalization) throw Error("GLB_NORMALIZATION_REQUIRED");
    if (normalization.sourceSha256 !== match[1])
      throw Error("GLB_NORMALIZATION_SOURCE_IDENTITY");
    let entry = this.cache.get(url);
    if (!entry) {
      let pending = this.pending.get(url);
      if (!pending) {
        pending = this.decode(url, match[1]!);
        this.pending.set(url, pending);
      }
      try {
        entry = await pending;
      } finally {
        if (this.pending.get(url) === pending) this.pending.delete(url);
      }
    }
    const actor = entry.hasRig || entry.animations.length > 0
      || (found !== undefined && ["character_avatar", "mob", "mount"].includes(found.category));
    const releaseInstance = actor
      ? glbResourcePool.actor(0)
      : glbResourcePool.staticInstance();
    if (!releaseInstance) throw Error(actor ? "GLB_ACTOR_BUDGET" : "GLB_STATIC_INSTANCE_BUDGET");
    entry.users++;
    entry.access = ++this.access;
    let scene: THREE.Group;
    try {
      scene = cloneSkeleton(entry.scene) as THREE.Group;
    } catch (error) {
      entry.users--;
      releaseInstance();
      throw error;
    }
    scene.scale.setScalar(normalization.scaleE8 / 100_000_000);
    scene.position.set(
      normalization.translationMm[0] / 1000,
      normalization.translationMm[1] / 1000,
      normalization.translationMm[2] / 1000
    );
    scene.userData.aurionNormalization = Object.freeze({
      revision: normalization.revision,
      sourceSha256: normalization.sourceSha256,
      transformSha256: normalization.transformSha256,
      manifestSha256: normalization.manifestSha256,
    });
    const borrowed = entry;
    registerGlbLease(scene, () => {
      releaseInstance();
      borrowed.users--;
    });
    return { scene, animations: entry.animations };
  }

  /**
   * Hold decoded/texture headroom for the pinned city wall until it is rendered,
   * so models that finish downloading earlier cannot exhaust the device budget
   * first. Returns null for every other model (no hold is taken).
   */
  public holdStaticWorldHeadroom(entry: GlbCatalogEntry): (() => void) | null {
    const headroom = starterCityWallHeadroom(entry);
    return headroom ? glbResourcePool.holdHeadroom(AURION_STARTER_CITY_WALL_HEADROOM_KEY, headroom) : null;
  }

  /** Builds one presentation-only Three.js LOD node from one logical catalog model.
   * Physical variants stay hash-verified and share the normal decoded-model cache. */
  public async loadStaticLodFamily(
    entry: GlbCatalogEntry,
    tier: AssetTier = glbResourcePool.tier
  ): Promise<{
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
    lodLevels: readonly number[];
  }> {
    const variants = selectStaticWorldLodVariants(entry, tier);
    if (variants.length === 0) throw Error("GLB_NO_SUPPORTED_LOD");
    for (const variant of variants) {
      if (variant.normalization.lod.level !== variant.level || variant.normalization.sourceSha256 !== variant.sha256)
        throw Error("GLB_LOD_MANIFEST_IDENTITY_MISMATCH");
    }
    if (variants.length === 1) {
      const loaded = await this.loadModel(
        variants[0]!.storageUrl,
        variants[0]!.normalization
      );
      if (loaded.animations.length) {
        releaseGlbTree(loaded.scene);
        throw Error("GLB_STATIC_LOD_ANIMATIONS_FORBIDDEN");
      }
      return { ...loaded, lodLevels: Object.freeze([variants[0]!.level]) };
    }
    const root = new THREE.Group();
    root.name = `aurion-glb-lod-family:${entry.assetId}`;
    const lod = new THREE.LOD();
    lod.name = `aurion-glb-lod:${entry.assetId}`;
    const borrowed: THREE.Group[] = [];
    try {
      for (const variant of variants) {
        const loaded = await this.loadModel(
          variant.storageUrl,
          variant.normalization
        );
        borrowed.push(loaded.scene);
        if (loaded.animations.length)
          throw Error("GLB_STATIC_LOD_ANIMATIONS_FORBIDDEN");
        lod.addLevel(
          loaded.scene,
          variant.normalization.lod.maxRenderDistanceMm / 1000,
          CATALOG_LOD_HYSTERESIS
        );
      }
      root.add(lod);
      root.userData.aurionCatalogLod = Object.freeze({
        assetId: entry.assetId,
        levels: Object.freeze(variants.map(variant => variant.level)),
        maxRenderDistancesMeters: Object.freeze(
          variants.map(
            variant => variant.normalization.lod.maxRenderDistanceMm / 1000
          )
        ),
        hysteresis: CATALOG_LOD_HYSTERESIS,
      });
      return {
        scene: root,
        animations: [],
        lodLevels: Object.freeze(variants.map(variant => variant.level)),
      };
    } catch (error) {
      for (const scene of borrowed) releaseGlbTree(scene);
      throw error;
    }
  }

  public async loadEquipmentMesh(
    modelIdOrUrl: string,
    slot: string
  ): Promise<THREE.Group | null> {
    try {
      const { scene } = await this.loadModel(modelIdOrUrl);
      const container = new THREE.Group();
      container.name = `glb_socket_${slot}_${modelIdOrUrl}`;
      scene.position.set(0, 0, 0);
      scene.rotation.set(0, 0, 0);
      container.add(scene);
      return container;
    } catch (err) {
      console.warn(
        `Could not load GLB equipment socket for ${modelIdOrUrl}:`,
        err
      );
      return null;
    }
  }

  public async uploadModelExternal(
    fileName: string,
    _base64Data: string,
    metadata: Partial<GLBModelEntry>
  ) {
    if (typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("aurion:xaurion-glb-upload-request", {
          detail: { fileName, metadata },
        })
      );
    return {
      success: false,
      delegated: true,
      reason: "AURION_ASSET_AUTHORITY_REQUIRED",
    };
  }
}

export const glbManager = GLBModelManager.getInstance();
