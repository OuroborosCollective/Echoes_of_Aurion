import { afterEach, describe, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial, Scene } from "three";
import { DeterministicSimulation } from "@shared/deterministicSimulation";
import { OpenWorldPlayer } from "./OpenWorldPlayer";
import { webcrypto } from "node:crypto";
import { testAnimatedPlayerGlb } from "../../../../server/glbImportFixtures";
import { buildGlbImportPlan } from "../../../../server/glbImportPlan";
import { glbManager } from "../core/GLBModelManager";

describe("OpenWorldPlayer equipment aura", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps a repeated equipment aura visible for the full lifetime of the latest change", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
    } as unknown as CanvasRenderingContext2D);

    const player = new OpenWorldPlayer(
      new Scene(),
      "knight",
      new DeterministicSimulation("equipment-aura-proof", 0),
    );
    const shield = (player as unknown as { shieldBubble: Mesh }).shieldBubble;
    const material = shield.material as MeshStandardMaterial;

    player.emitEquipmentAura();
    vi.advanceTimersByTime(200);
    player.emitEquipmentAura();
    vi.advanceTimersByTime(100);

    expect(material.opacity).toBe(0.45);

    vi.advanceTimersByTime(200);
    expect(material.opacity).toBe(0);

    player.disposePresentation();
  });

  it("reports the decoded equipped GLB visibility independently of the hidden procedural avatar", async () => {
    vi.stubGlobal("crypto",webcrypto);
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),fillText:vi.fn(),arc:vi.fn(),fill:vi.fn(),createLinearGradient:()=>({addColorStop:vi.fn()})} as unknown as CanvasRenderingContext2D);
    const bytes=testAnimatedPlayerGlb("startup-character",true);
    const plan=await buildGlbImportPlan(bytes.toString("base64"));
    glbManager.setAuthoritativeCatalog([{id:"startup-visibility",name:"Synthetic visibility control",fileName:plan.sha256+".glb",url:"/api/assets/glb/"+plan.sha256+".glb",category:"character_avatar",normalization:plan.normalization,status:"approved",animations:[],description:"Explicit synthetic decoded GLB control"}]);
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(Uint8Array.from(bytes))));
    const scene=new Scene();
    const player=new OpenWorldPlayer(scene,"knight",new DeterministicSimulation("startup-glb-visibility",0));
    try {
      expect(await player.equipGlbModel("startup-visibility")).toBe(true);
      expect(player.rootGroup.visible).toBe(false);
      expect(player.glbAvatarGroup.children.length).toBe(1);
      expect(player.glbPresentationEvidence()).toMatchObject({visible:true});
      player.glbAvatarGroup.visible=false;
      expect(player.glbPresentationEvidence()).toMatchObject({visible:false});
      player.glbAvatarGroup.visible=true;
      player.group.visible=false;
      expect(player.glbPresentationEvidence()).toMatchObject({visible:false});
      player.group.visible=true;
      player.group.removeFromParent();
      expect(player.glbPresentationEvidence()).toMatchObject({visible:false});
    } finally {
      player.disposePresentation();
      glbManager.setAuthoritativeCatalog([]);glbManager.trimIdle();vi.unstubAllGlobals();
    }
  });
});
