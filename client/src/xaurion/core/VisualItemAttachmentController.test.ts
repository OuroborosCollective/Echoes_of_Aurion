import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { GlbCatalogEntry, GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { visualItemDescriptorSchema, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import { AnimatedGlbActor } from "./AnimatedGlbActor";
import { AurionVisualClock } from "./VisualItemMaterialCompiler";
import { VisualItemAttachmentController, type VisualItemModelLoader } from "./VisualItemAttachmentController";

const sha = (char: string) => char.repeat(64);
const anchorNames: Readonly<Record<GlbEquipmentSlot, string>> = Object.freeze({
  weapon: "socketweaponr",
  shield: "socketweaponl",
  helmet: "sockethead",
  chest: "socketchest",
  shoulders: "socketshoulders",
  arms: "socketarms",
  legs: "socketlegs",
  boots: "socketboots",
});

function makeActor(slots: readonly GlbEquipmentSlot[]): { actor: AnimatedGlbActor; model: THREE.Group } {
  const model = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.35), new THREE.MeshBasicMaterial());
  body.position.y = 0.9;
  model.add(body);
  for (const slot of slots) {
    const anchor = new THREE.Group();
    anchor.name = anchorNames[slot];
    model.add(anchor);
  }
  return { actor: new AnimatedGlbActor(model, [], 2), model };
}

function descriptor(values: {
  itemDefinitionId?: string;
  familyId?: string;
  category?: VisualItemDescriptor["category"];
  equipmentSlot?: VisualItemDescriptor["equipmentSlot"];
  glbAssetId?: string | null;
  receipt?: string;
} = {}): VisualItemDescriptor {
  const itemDefinitionId = values.itemDefinitionId ?? "weapon-spear-v2";
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId,
    familyId: values.familyId ?? "spear",
    category: values.category ?? "weapon",
    equipmentSlot: values.equipmentSlot ?? "main_hand",
    quality: "rare",
    affixes: [],
    setId: null,
    visual: {
      itemDefinitionId,
      materialId: "star_iron",
      appearanceId: null,
      materialVariant: null,
      variantTheme: "starforged",
      glbAssetId: values.glbAssetId ?? null,
    },
    source: {
      lootReceiptId: values.receipt ?? "receipt-001",
      contextHash: sha("a"),
      deterministicHash: sha("b"),
      visualEventIndex: 0,
    },
    visualSeed: sha("c"),
  });
}

function entry(values: Partial<GlbCatalogEntry> = {}): GlbCatalogEntry {
  const digest = values.sha256 ?? sha("d");
  return {
    assetId: "glb_exact_weapon",
    sha256: digest,
    displayName: "Equipment · weapon · exact",
    assetType: "weapon",
    storageUrl: `/api/assets/glb/${digest}.glb`,
    targetKey: null,
    purpose: "equipment",
    subcategory: "weapon",
    equipmentSlot: "weapon",
    ...values,
  };
}

function catalog(entries: GlbCatalogEntry[] = []): GlbRuntimeCatalog {
  return { version: "aurion.glb-import.v1", revision: sha("f"), entries };
}

function loadedVisual(name = "loaded-equipment"): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.1), new THREE.MeshBasicMaterial()));
  return group;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}

const armorCases = [
  ["helmet", "head", "armor-heavy-head-v2"],
  ["chest", "chest", "armor-heavy-chest-v2"],
  ["arms", "hands", "armor-heavy-hands-v2"],
  ["legs", "legs", "armor-heavy-legs-v2"],
  ["boots", "feet", "armor-heavy-feet-v2"],
] as const;

describe("VisualItemAttachmentController", () => {
  it("attaches procedural fallback visuals through the real AnimatedGlbActor anchors", async () => {
    const slots: GlbEquipmentSlot[] = ["weapon", "shield", "helmet", "chest", "arms", "legs", "boots"];
    const { actor } = makeActor(slots);
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), vi.fn());

    expect((await controller.apply(descriptor(), 0, catalog())).status).toBe("attached");
    expect((await controller.apply(descriptor({ itemDefinitionId: "weapon-shield-v2", familyId: "shield", equipmentSlot: "off_hand", receipt: "receipt-shield" }), 0, catalog())).status).toBe("attached");
    for (const [catalogSlot, uiSlot, itemDefinitionId] of armorCases) {
      const outcome = await controller.apply(descriptor({ itemDefinitionId, familyId: "heavy", category: "armor", equipmentSlot: uiSlot, receipt: `receipt-${catalogSlot}` }), 1, catalog());
      expect(outcome).toMatchObject({ status: "attached", slot: catalogSlot, source: "procedural" });
    }

    expect(actor.evidence().equipmentSlots).toEqual(["arms", "boots", "chest", "helmet", "legs", "shield", "weapon"]);
    expect(controller.evidence().map(value => value.slot)).toEqual(["arms", "boots", "chest", "helmet", "legs", "shield", "weapon"]);
    controller.dispose();
    actor.dispose();
  });

  it("loads an exact catalog GLB clone and attaches it without disposing shared loader resources", async () => {
    const { actor } = makeActor(["weapon"]);
    const scene = loadedVisual();
    const mesh = scene.children[0] as THREE.Mesh;
    const geometrySpy = vi.spyOn(mesh.geometry, "dispose");
    const materialSpy = vi.spyOn(mesh.material as THREE.Material, "dispose");
    const loadModel = vi.fn<VisualItemModelLoader>(async () => ({ scene, animations: [] }));
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), loadModel);
    const source = entry();

    const outcome = await controller.apply(descriptor({ glbAssetId: source.assetId }), 0, catalog([source]));
    expect(outcome).toMatchObject({ status: "attached", slot: "weapon", source: "glb", detail: source.assetId });
    expect(loadModel).toHaveBeenCalledWith(source.storageUrl);
    expect(actor.evidence().equipmentSlots).toEqual(["weapon"]);
    controller.detach("weapon");
    expect(geometrySpy).not.toHaveBeenCalled();
    expect(materialSpy).not.toHaveBeenCalled();
    actor.dispose();
  });

  it("rejects stale async GLB loads before they can replace a newer confirmed visual", async () => {
    const { actor } = makeActor(["weapon"]);
    const pending = deferred<Readonly<{ scene: THREE.Group; animations: readonly THREE.AnimationClip[] }>>();
    const loadModel: VisualItemModelLoader = () => pending.promise;
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), loadModel);
    const exact = entry();

    const stalePromise = controller.apply(descriptor({ glbAssetId: exact.assetId, receipt: "receipt-old" }), 0, catalog([exact]));
    const current = await controller.apply(descriptor({ glbAssetId: null, receipt: "receipt-new" }), 0, catalog([exact]));
    expect(current).toMatchObject({ status: "attached", source: "procedural" });
    pending.resolve({ scene: loadedVisual("late-glb"), animations: [] });
    const stale = await stalePromise;
    expect(stale).toMatchObject({ status: "stale", source: "glb", detail: "STALE_REQUEST" });
    expect(controller.evidence()).toHaveLength(1);
    expect(controller.evidence()[0]?.identity).toContain("receipt-new");
    expect(controller.evidence()[0]?.source).toBe("procedural");
    controller.dispose(); actor.dispose();
  });

  it("keeps the previously attached confirmed visual on GLB load failure", async () => {
    const { actor } = makeActor(["weapon"]);
    const exact = entry();
    let rejectLoads = false;
    const loadModel: VisualItemModelLoader = async () => {
      if (rejectLoads) throw new Error("network");
      return { scene: loadedVisual("first-glb"), animations: [] };
    };
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), loadModel);
    const first = await controller.apply(descriptor({ glbAssetId: exact.assetId, receipt: "receipt-first" }), 0, catalog([exact]));
    expect(first.status).toBe("attached");
    const before = controller.evidence()[0];
    rejectLoads = true;
    const failed = await controller.apply(descriptor({ glbAssetId: exact.assetId, receipt: "receipt-second" }), 0, catalog([exact]));
    expect(failed.status).toBe("load_failed");
    expect(controller.evidence()[0]).toEqual(before);
    expect(actor.evidence().equipmentSlots).toEqual(["weapon"]);
    controller.dispose(); actor.dispose();
  });

  it("rejects rigged equipment GLBs and empty/non-finite visual bounds without touching the actor slot", async () => {
    const exact = entry();
    for (const kind of ["rigged", "empty"] as const) {
      const { actor } = makeActor(["weapon"]);
      const loadModel: VisualItemModelLoader = async () => {
        const scene = new THREE.Group();
        if (kind === "rigged") {
          scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.1), new THREE.MeshBasicMaterial()));
          scene.add(new THREE.Bone());
        }
        return { scene, animations: [] };
      };
      const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), loadModel);
      const outcome = await controller.apply(descriptor({ glbAssetId: exact.assetId }), 0, catalog([exact]));
      expect(outcome.status).toBe("invalid_glb");
      expect(outcome.detail).toBe(kind === "rigged" ? "RIGGED_EQUIPMENT_UNSUPPORTED" : "GLB_BOUNDS_INVALID");
      expect(actor.evidence().equipmentSlots).toEqual([]);
      controller.dispose(); actor.dispose();
    }
  });

  it("fails closed on a missing real actor anchor and disposes the unattachable procedural resources", async () => {
    const { actor } = makeActor([]);
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), vi.fn());
    const outcome = await controller.apply(descriptor(), 0, catalog());
    expect(outcome).toMatchObject({ status: "anchor_missing", slot: "weapon", source: "procedural" });
    expect(actor.evidence().equipmentSlots).toEqual([]);
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    geometryDispose.mockRestore(); materialDispose.mockRestore();
    controller.dispose(); actor.dispose();
  });

  it("disposes controller-owned procedural geometry/materials on confirmed detach", async () => {
    const { actor, model } = makeActor(["weapon"]);
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock(), vi.fn());
    expect((await controller.apply(descriptor(), 0, catalog())).status).toBe("attached");
    let holder: THREE.Object3D | null = null;
    model.traverse(node => { if (node.name === "aurion-confirmed-equipment:weapon") holder = node; });
    expect(holder).not.toBeNull();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    holder!.traverse(node => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      geometries.add(mesh.geometry);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
    });
    const geometrySpies = [...geometries].map(value => vi.spyOn(value, "dispose"));
    const materialSpies = [...materials].map(value => vi.spyOn(value, "dispose"));
    controller.detach("weapon");
    geometrySpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(actor.evidence().equipmentSlots).toEqual([]);
    expect(controller.evidence()).toEqual([]);
    controller.dispose(); actor.dispose();
  });
});
