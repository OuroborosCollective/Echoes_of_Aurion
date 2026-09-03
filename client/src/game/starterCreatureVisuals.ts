import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";

import {
  selectStarterMonsterLod,
  starterCreatureKindForArena,
  type StarterCreatureKind,
  type StarterRuntimeAssetSource,
  type StarterRuntimeAssetSources,
} from "./starterCharacterAssets";

type CreatureClip = "Idle" | "Walk" | "Attack" | "Death";
type LoadedCreature = {
  root: TransformNode;
  animations: AnimationGroup[];
  activeClip: CreatureClip | null;
};

type StarterCreatureFrame = {
  distanceMeters: number;
  moving: boolean;
  attacking: boolean;
  dead: boolean;
};

function findAnimation(groups: AnimationGroup[], clip: CreatureClip): AnimationGroup | undefined {
  const exact = groups.find(group => group.name === clip);
  return exact ?? groups.find(group => group.name.toLowerCase() === clip.toLowerCase());
}

function stopAnimations(asset: LoadedCreature): void {
  asset.animations.forEach(group => group.stop());
  asset.activeClip = null;
}

function playAnimation(asset: LoadedCreature, clip: CreatureClip): void {
  if (asset.activeClip === clip) return;
  asset.animations.forEach(group => group.stop());
  const group = findAnimation(asset.animations, clip);
  if (!group) {
    asset.activeClip = null;
    return;
  }
  group.start(clip !== "Death", 1);
  asset.activeClip = clip;
}

async function loadCreature(
  scene: Scene,
  source: StarterRuntimeAssetSource,
  rootName: string,
  parent: TransformNode,
  targetHeight: number,
): Promise<LoadedCreature> {
  const result = await SceneLoader.ImportMeshAsync("", "", source.storageUrl, scene);
  const visibleMeshes = result.meshes.filter(mesh => mesh.getTotalVertices() > 0);
  if (!visibleMeshes.length) {
    result.animationGroups.forEach(group => group.dispose());
    result.meshes.forEach(mesh => mesh.dispose(false, true));
    throw new Error(`${rootName} contains no visible mesh topology`);
  }

  const root = new TransformNode(rootName, scene);
  const topLevelMeshes = result.meshes.filter(mesh => !mesh.parent);
  topLevelMeshes.forEach(mesh => { mesh.parent = root; });

  const bounds = visibleMeshes.map(mesh => mesh.getBoundingInfo().boundingBox);
  let minimum = bounds[0]!.minimumWorld.clone();
  let maximum = bounds[0]!.maximumWorld.clone();
  bounds.slice(1).forEach(bound => {
    minimum = Vector3.Minimize(minimum, bound.minimumWorld);
    maximum = Vector3.Maximize(maximum, bound.maximumWorld);
  });
  const height = Math.max(0.1, maximum.y - minimum.y);
  const scale = targetHeight / height;
  root.scaling.setAll(scale);
  root.position.y = -minimum.y * scale;
  root.parent = parent;
  root.setEnabled(false);

  return { root, animations: result.animationGroups, activeClip: null };
}

export class StarterCreatureVisuals {
  private spider: LoadedCreature | null = null;
  private beastLods: LoadedCreature[] = [];
  private activeKind: StarterCreatureKind = "procedural";
  private beastLod: 0 | 1 | 2 | 3 = 0;
  private loaded = false;

  constructor(
    private readonly scene: Scene,
    private readonly parent: TransformNode,
    private readonly sources: StarterRuntimeAssetSources,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      if (this.sources.spider) {
        this.spider = await loadCreature(this.scene, this.sources.spider, "starter-spider-visual", this.parent, 1.55);
      }
      if (this.sources.beastLods.every((source): source is StarterRuntimeAssetSource => Boolean(source))) {
        const beastLods: LoadedCreature[] = [];
        for (let index = 0; index < this.sources.beastLods.length; index += 1) {
          beastLods.push(await loadCreature(
            this.scene,
            this.sources.beastLods[index]!,
            `starter-beast-lod${index}-visual`,
            this.parent,
            2.15,
          ));
        }
        this.beastLods = beastLods;
      }
      this.loaded = true;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  setArena(arenaIndex: number): boolean {
    this.activeKind = starterCreatureKindForArena(arenaIndex);
    this.spider?.root.setEnabled(false);
    this.beastLods.forEach(asset => asset.root.setEnabled(false));
    if (!this.loaded) return false;

    if (this.activeKind === "spider" && this.spider) {
      this.spider.root.setEnabled(true);
      playAnimation(this.spider, "Idle");
      return true;
    }
    if (this.activeKind === "beast" && this.beastLods.length === 4) {
      this.beastLods[this.beastLod]!.root.setEnabled(true);
      playAnimation(this.beastLods[this.beastLod]!, "Idle");
      return true;
    }
    return false;
  }

  update(frame: StarterCreatureFrame): void {
    if (!this.loaded || this.activeKind === "procedural") return;
    const clip: CreatureClip = frame.dead ? "Death" : frame.attacking ? "Attack" : frame.moving ? "Walk" : "Idle";

    if (this.activeKind === "spider" && this.spider) {
      playAnimation(this.spider, clip);
      return;
    }
    if (this.activeKind === "beast" && this.beastLods.length === 4) {
      const nextLod = selectStarterMonsterLod(frame.distanceMeters, this.beastLod);
      if (nextLod !== this.beastLod) {
        const previous = this.beastLods[this.beastLod]!;
        previous.root.setEnabled(false);
        stopAnimations(previous);
        this.beastLod = nextLod;
        this.beastLods[this.beastLod]!.root.setEnabled(true);
      }
      playAnimation(this.beastLods[this.beastLod]!, clip);
    }
  }

  dispose(): void {
    if (this.spider) {
      this.spider.animations.forEach(group => { group.stop(); group.dispose(); });
      this.spider.root.dispose(false, true);
    }
    this.beastLods.forEach(asset => {
      asset.animations.forEach(group => { group.stop(); group.dispose(); });
      asset.root.dispose(false, true);
    });
    this.spider = null;
    this.beastLods = [];
    this.activeKind = "procedural";
    this.beastLod = 0;
    this.loaded = false;
  }
}
