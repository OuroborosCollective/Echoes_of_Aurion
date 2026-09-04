import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RPGItem, ItemSlot, WeaponType, ItemRarity } from '../types';

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
  triangleBudget: number;
  boneCount: number;
  fileSizeBytes: number;
  status: string;
  animations: string[];
  description: string;
  referenceUrl?: string;
  author?: string;
  sourceDirectory?: string;
  uploadedAt: string;
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

export class GLBModelManager {
  private static instance: GLBModelManager;
  private loader = new GLTFLoader();
  private cache: Map<string, { scene: THREE.Group; animations: THREE.AnimationClip[] }> = new Map();
  private catalog: GLBModelEntry[] = [];
  private isFetching = false;
  private eventSource: EventSource | null = null;
  private eventListeners: Set<(event: WatcherEvent) => void> = new Set();

  private constructor() {}

  public static getInstance(): GLBModelManager {
    if (!GLBModelManager.instance) {
      GLBModelManager.instance = new GLBModelManager();
    }
    return GLBModelManager.instance;
  }

  public async fetchCatalog(): Promise<GLBModelEntry[]> {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurion:xaurion-glb-catalog-request'));
    }
    return this.catalog;
  }

  public setAuthoritativeCatalog(models: GLBModelEntry[]): void {
    this.catalog = Array.isArray(models) ? models.slice() : [];
  }

  public getCachedCatalog(): GLBModelEntry[] {
    return this.catalog;
  }

  public async scanExternalDirectory(directoryPath?: string): Promise<{
    success: boolean;
    scannedDirectory: string;
    totalModels: number;
    models: GLBModelEntry[];
    watchStatus?: WatchStatus;
  }> {
    return {
      success: false,
      scannedDirectory: directoryPath || 'Aurion server-authoritative asset catalog',
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
      activeDirectory: 'Aurion authority',
      lastScanTime: null,
      lastEventTime: null,
      recentEvents: [],
    };
  }

  public async toggleFileWatcher(_active: boolean, _directory?: string): Promise<boolean> {
    return false;
  }

  public subscribeToWatchEvents(onEvent: (event: WatcherEvent) => void): () => void {
    this.eventListeners.add(onEvent);
    return () => {
      this.eventListeners.delete(onEvent);
    };
  }

  public convertToRpgItem(model: GLBModelEntry): RPGItem {
    let slot: ItemSlot = 'weapon';
    if (model.category === 'shield' || model.equipSlot === 'shield') slot = 'shield';
    else if (model.category === 'offhand' || model.equipSlot === 'offhand') slot = 'shield';
    else if (model.category === 'helmet' || model.equipSlot === 'helmet') slot = 'helmet';
    else if (model.category === 'chest' || model.equipSlot === 'chest') slot = 'chest';
    else if (model.category === 'shoulders' || model.equipSlot === 'shoulders') slot = 'shoulders';
    else if (model.category === 'arms' || model.equipSlot === 'arms') slot = 'arms';
    else if (model.category === 'legs' || model.equipSlot === 'legs') slot = 'legs';
    else if (model.category === 'boots' || model.equipSlot === 'boots') slot = 'boots';
    else if (model.category === 'character_avatar') slot = 'relic';

    let icon = '⚔️';
    if (slot === 'shield') icon = model.category === 'offhand' ? '📖' : '🛡️';
    else if (slot === 'helmet') icon = '🪖';
    else if (slot === 'chest') icon = '🥋';
    else if (model.weaponType === 'marksmanship') icon = '🏹';
    else if (model.weaponType === 'arcane') icon = '🔮';
    else if (model.weaponType === 'heavy_tech') icon = '⚙️';
    else if (model.category === 'character_avatar') icon = '✨';

    return {
      id: `glb_item_${model.id}`,
      name: model.name,
      description: model.description || `Registered 3D asset from ${model.fileName}`,
      icon,
      rarity: model.rarity || 'epic',
      slot,
      weaponType: model.weaponType || (slot === 'weapon' ? 'blade' : undefined),
      levelReq: 1,
      stats: {
        attack: model.itemStats?.attack || 0,
        spellPower: model.itemStats?.spellPower || 0,
        armor: model.itemStats?.armor || 0,
        critChance: model.itemStats?.critChance || 0,
        moveSpeed: model.itemStats?.moveSpeed || 0,
        maxHp: model.itemStats?.maxHp || 0,
        maxResource: model.itemStats?.maxResource || 0,
      },
      valueGold: 500,
      effectDescription: `3D Model Mesh: ${model.fileName} (${model.triangleBudget} tris)`,
      glbModelId: model.id,
      glbModelUrl: model.url,
      isGlbModel: true,
    };
  }

  public async loadModel(urlOrId: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    const found = this.catalog.find((c) => c.id === urlOrId);
    const isDirectUrl = /^(?:https?:)?\/\//.test(urlOrId) || urlOrId.startsWith('/');
    const url = found ? found.url : isDirectUrl ? urlOrId : `/glb-assets/${urlOrId}`;

    if (this.cache.has(url)) {
      const cached = this.cache.get(url)!;
      return {
        scene: cached.scene.clone(true),
        animations: cached.animations,
      };
    }

    return new Promise((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          gltf.scene.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });

          this.cache.set(url, {
            scene: gltf.scene,
            animations: gltf.animations,
          });

          resolve({
            scene: gltf.scene.clone(true),
            animations: gltf.animations,
          });
        },
        undefined,
        (err) => {
          if (!url.includes('/models/glb/')) {
            const fallbackUrl = `/models/glb/${urlOrId.replace(/^.*[\\/]/, '')}`;
            this.loader.load(
              fallbackUrl,
              (gltf) => {
                gltf.scene.traverse((node) => {
                  if ((node as THREE.Mesh).isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                  }
                });
                this.cache.set(url, { scene: gltf.scene, animations: gltf.animations });
                resolve({ scene: gltf.scene.clone(true), animations: gltf.animations });
              },
              undefined,
              (fallbackErr) => {
                console.warn(`Could not load GLB model from ${url} or fallback ${fallbackUrl}, using procedural mesh fallback:`, fallbackErr);
                const fallbackGroup = new THREE.Group();
                const fallbackMesh = new THREE.Mesh(
                  new THREE.BoxGeometry(0.3, 0.3, 0.3),
                  new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3, metalness: 0.8 })
                );
                fallbackGroup.add(fallbackMesh);
                resolve({ scene: fallbackGroup, animations: [] });
              }
            );
          } else {
            console.warn(`Could not load external GLB model from ${url}, using procedural mesh fallback:`, err);
            const fallbackGroup = new THREE.Group();
            const fallbackMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.3, 0.3),
              new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3, metalness: 0.8 })
            );
            fallbackGroup.add(fallbackMesh);
            resolve({ scene: fallbackGroup, animations: [] });
          }
        }
      );
    });
  }

  public async loadEquipmentMesh(modelIdOrUrl: string, slot: string): Promise<THREE.Group | null> {
    try {
      const { scene } = await this.loadModel(modelIdOrUrl);
      const container = new THREE.Group();
      container.name = `glb_socket_${slot}_${modelIdOrUrl}`;

      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);

      let targetScale = 1.0;
      if (slot === 'weapon') {
        targetScale = maxDim > 0 ? 1.4 / maxDim : 1.0;
        scene.position.set(0, 0, 0);
        scene.rotation.set(0, 0, 0);
      } else if (slot === 'shield' || slot === 'offhand') {
        targetScale = maxDim > 0 ? 1.1 / maxDim : 1.0;
        scene.position.set(0, 0, 0);
      } else if (slot === 'helmet' || slot === 'head') {
        targetScale = maxDim > 0 ? 0.9 / maxDim : 1.0;
        scene.position.set(0, 0, 0);
      } else if (slot === 'chest') {
        targetScale = maxDim > 0 ? 1.2 / maxDim : 1.0;
        scene.position.set(0, 0, 0);
      }

      scene.scale.set(targetScale, targetScale, targetScale);
      container.add(scene);
      return container;
    } catch (err) {
      console.warn(`Could not load GLB equipment socket for ${modelIdOrUrl}:`, err);
      return null;
    }
  }

  public async uploadModelExternal(fileName: string, _base64Data: string, metadata: Partial<GLBModelEntry>) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurion:xaurion-glb-upload-request', { detail: { fileName, metadata } }));
    }
    return { success: false, delegated: true, reason: 'AURION_ASSET_AUTHORITY_REQUIRED' };
  }
}

export const glbManager = GLBModelManager.getInstance();
