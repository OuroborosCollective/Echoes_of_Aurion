import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { ZONE_COMBAT_CONTRACT_VERSION } from "@shared/zoneCombatContract";
import { MobCatalogProjection, CLOCKWORK_STALKER_GLB_SHA as sha } from "./MobCatalogProjection";
import { acceptConfirmedZoneCombat, projectConfirmedZoneSnapshot } from "./zoneCombatBridge";

const catalog: GlbRuntimeCatalog = { version: "aurion.glb-import.v1", revision: "b".repeat(64), entries: [{ assetId: `glb_${sha.slice(0,48)}`, sha256: sha, displayName: "Clockwork Stalker", purpose: "auto", assetType: "enemy", subcategory: null, targetKey: null, equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` }] };
const lod1Sha = "1".repeat(64), lod2Sha = "2".repeat(64);
const lodCatalog: GlbRuntimeCatalog = { version: "aurion.glb-import.v1", revision: "c".repeat(64), entries: [{
  ...catalog.entries[0]!,
  lods: [
    { level: 0, assetId: `glb_${sha.slice(0,48)}`, sha256: sha, bytes: 1200, storageUrl: `/api/assets/glb/${sha}.glb`, targetKey: null },
    { level: 1, assetId: "glb_clockwork_stalker_lod1", sha256: lod1Sha, bytes: 800, storageUrl: `/api/assets/glb/${lod1Sha}.glb`, targetKey: null },
    { level: 2, assetId: "glb_clockwork_stalker_lod2", sha256: lod2Sha, bytes: 400, storageUrl: `/api/assets/glb/${lod2Sha}.glb`, targetKey: null },
  ],
}] };
function loaded() {
  const scene = new THREE.Group(), bone = new THREE.Bone(); bone.name = "Spine";
  const geometry = new THREE.BoxGeometry(1, 2, 1); geometry.translate(0, 1, 0);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); scene.add(mesh);
  const animations = ["Idle","Walk","Run","Attack","Death"].map(name => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0,.5,1], [0,0,0,1,.1,0,0,.995,0,0,0,1])]));
  return { scene, animations };
}
function setup(count = 1) {
  const scene = new THREE.Scene();
  const mobs = Array.from({ length: count }, (_, i) => {
    const group = new THREE.Group(); group.position.set(i * 2, 0, 0); group.userData.aurionConfirmedMob = true;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.5, 1), new THREE.MeshBasicMaterial()); group.add(body); scene.add(group);
    return { data: { id: `mob_${i+1}`, type: "clockwork_stalker", hp: 100, maxHp: 100, x: i*2, y: 0, z: 0 }, group, body, hpBar: new THREE.Mesh() };
  });
  return { scene, mobs, engine: { scene, mobManager: { mobs }, player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => 2 } } } };
}
async function step(p: MobCatalogProjection, dt=.5) { p.update(dt); await Promise.resolve(); await Promise.resolve(); }

describe("approved confirmed mob GLB presentation", () => {
  it("uses the exact catalog binding and confirmed archetype, retaining the placeholder until loading completes", async () => {
    const s=setup(3); s.mobs[1]!.data.type="aether_wisp";s.mobs[2]!.group.userData.aurionConfirmedMob=false;
    let resolve!: (v: ReturnType<typeof loaded>)=>void;
    const p=new MobCatalogProjection(s.engine as never,()=>new Promise(r=>{resolve=r;}));p.setCatalog(catalog);p.update(.5);
    expect(s.mobs[0]!.body.visible).toBe(true);
    resolve(loaded());await Promise.resolve();await step(p);
    expect(p.evidence().projected).toBe(1);expect(s.mobs[0]!.body.visible).toBe(false);expect(s.mobs[1]!.body.visible).toBe(true);expect(s.mobs[2]!.body.visible).toBe(true);
    const actor=s.scene.getObjectByName("aurion-confirmed-mob-glb:mob_1")!;
    expect(actor.position.y).toBe(2);expect(actor.scale.y).toBeCloseTo(.825);
    p.dispose();expect(s.mobs.every(m=>m.body.visible)).toBe(true);
  });
  it("switches only the physical GLB member when confirmed distance crosses the existing actor LOD bands", async()=>{
    const s=setup();
    const load=vi.fn(async()=>loaded());
    const p=new MobCatalogProjection(s.engine as never,load);p.setCatalog(lodCatalog);await step(p);
    expect(load).toHaveBeenCalledWith(`/api/assets/glb/${sha}.glb`);
    expect(p.evidence().physicalLods[0]).toMatchObject({level:0,sha256:sha});
    s.engine.player.position.x=30;
    await step(p);await step(p);
    expect(load).toHaveBeenCalledWith(`/api/assets/glb/${lod1Sha}.glb`);
    expect(p.evidence().physicalLods[0]).toMatchObject({level:1,sha256:lod1Sha});
    s.engine.player.position.x=60;
    await step(p);await step(p);
    expect(load).toHaveBeenCalledWith(`/api/assets/glb/${lod2Sha}.glb`);
    expect(p.evidence().physicalLods[0]).toMatchObject({level:2,sha256:lod2Sha});
    p.dispose();
  });
  it("follows confirmed coordinates and plays a bounded corpse without editing health or targetability", async()=>{
    const s=setup(),p=new MobCatalogProjection(s.engine as never,async()=>loaded());p.setCatalog(catalog);await step(p);
    const m=s.mobs[0]!;m.data.x=3;m.group.position.x=3;await step(p);
    const actor=s.scene.getObjectByName("aurion-confirmed-mob-glb:mob_1")!;expect(actor.position.x).toBe(3);expect(actor.rotation.y).toBeCloseTo(Math.PI/2);
    m.data.hp=0;m.group.visible=false;await step(p,.1);
    expect(actor.visible).toBe(true);expect(m.group.visible).toBe(false);expect(m.data.hp).toBe(0);
    await step(p,2);expect(p.evidence().projected).toBe(0);expect(m.data.hp).toBe(0);p.dispose();
  });
  it("accepts only valid increasing server combat sequences for the loaded attacker", async()=>{
    const s=setup(),p=new MobCatalogProjection(s.engine as never,async()=>loaded());p.setCatalog(catalog);await step(p);
    const event={type:"combat",contractVersion:ZONE_COMBAT_CONTRACT_VERSION,tick:2,sequence:3,action:"melee",skillId:null,skillSourceRevision:null,attackerEntityId:"mob_1",defenderEntityId:"player:1",hit:true,damage:4,crit:false,killed:false,defenderHealth:96,attackerStamina:100,gameplaySourceRevision:"a".repeat(40)} as const;
    p.acceptCombat({...event,sequence:-1});expect(p.evidence().lastAttackSequences[0]!.sequence).toBe(0);
    projectConfirmedZoneSnapshot({selfEntityId:"player:1",mobs:[],combatants:[]});
    acceptConfirmedZoneCombat(event);acceptConfirmedZoneCombat({...event,sequence:2});expect(p.evidence().lastAttackSequences[0]!.sequence).toBe(3);p.dispose();
  });
  it("restores on catalog revocation and never attaches a late decode to a disposed world",async()=>{
    const s=setup(),p=new MobCatalogProjection(s.engine as never,async()=>loaded());p.setCatalog(catalog);await step(p);p.setCatalog({...catalog,entries:[]});expect(s.mobs[0]!.body.visible).toBe(true);expect(p.evidence().projected).toBe(0);p.dispose();
    let resolve!: (v:ReturnType<typeof loaded>)=>void;
    const q=new MobCatalogProjection(s.engine as never,()=>new Promise(r=>{resolve=r;}));q.setCatalog(catalog);q.update(.5);q.dispose();resolve(loaded());await Promise.resolve();expect(q.evidence().projected).toBe(0);
  });
  it("caps phone actors, shares the manager load path and bounds failed retries",async()=>{
    const old=window.innerWidth;Object.defineProperty(window,"innerWidth",{value:412,configurable:true});
    try {
      const s=setup(16),p=new MobCatalogProjection(s.engine as never,async()=>loaded());p.setCatalog(catalog);for(let i=0;i<10;i++)await step(p);expect(p.evidence().projected).toBe(8);p.dispose();
      const load=vi.fn(async()=>{throw Error("decode failure");});const q=new MobCatalogProjection(setup().engine as never,load);q.setCatalog(catalog);for(let i=0;i<12;i++)await step(q,6);expect(load).toHaveBeenCalledTimes(3);expect(q.evidence().projected).toBe(0);q.dispose();
    } finally {Object.defineProperty(window,"innerWidth",{value:old,configurable:true});}
  });
});
