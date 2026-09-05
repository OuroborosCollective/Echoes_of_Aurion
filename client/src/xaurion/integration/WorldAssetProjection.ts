import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { splitWorldChunkPositionMm, type WorldChunkCoordinate } from "@shared/worldChunkProtocol";
import { worldAssetById, worldAssetLod, worldAssetRegionSchema, type WorldAssetPlacement, type WorldAssetRegion } from "@shared/worldAssetProtocol";

type Selection = { placement: WorldAssetPlacement; key: string; lod: 0|1|2; distance: number };
type Cached = { gltf: GLTF; access: number; textures: Set<string> };
function disposeModel(gltf: GLTF, preserveTextures=false) {
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 gltf.scene.traverse(node=>{if(!(node as THREE.Mesh).isMesh)return;const mesh=node as THREE.Mesh;geometry.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);});
 for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
 if(!preserveTextures)for(const texture of textures){texture.dispose();const bitmap=texture.image as {close?:()=>void}|undefined;if(typeof bitmap?.close==="function")bitmap.close();}for(const material of materials)material.dispose();for(const g of geometry)g.dispose();
}
/** View-only projection of the authenticated, versioned server placement plan. */
export class WorldAssetProjection {
 readonly root=new THREE.Group();
 private readonly loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 private readonly cache=new Map<string,Cached>();
 private readonly sharedTextures=new Map<string,{texture:THREE.Texture;refs:number}>();
 private renderedKey="";
 private readonly loading=new Set<string>();
 private readonly failed=new Set<string>();
 private region: WorldAssetRegion|null=null;
 private selected: Selection[]=[];
 private disposed=false;private elapsed=1;private lastCenter="";private readGeneration=0;private access=0;private readFailed=false;
 private previousLod=new Map<string,0|1|2>();
 private rendered=0;private drawCalls=0;private triangles=0;private activeLights=0;
 constructor(scene:THREE.Scene,private readonly camera:THREE.PerspectiveCamera,private readonly terrain:(x:number,z:number)=>number,private readonly fetchRegion:(center:WorldChunkCoordinate)=>Promise<unknown>,private readonly report:(value:ReturnType<WorldAssetProjection["evidence"]>)=>void){this.root.name="aurion-optimized-world-assets";scene.add(this.root);}
 update(delta:number,position:{x:number;z:number},viewportWidth:number){
  if(this.disposed)return;this.elapsed+=delta;if(this.elapsed<0.5)return;this.elapsed=0;
  const center=splitWorldChunkPositionMm({x:Math.round(position.x*1000),z:Math.round(position.z*1000)}).coordinate,key=`${center.x}:${center.z}`;
  if(key!==this.lastCenter){this.lastCenter=key;const generation=++this.readGeneration;void this.fetchRegion(center).then(value=>{if(this.disposed||generation!==this.readGeneration)return;const region=worldAssetRegionSchema.parse(value);if(region.center.x!==center.x||region.center.z!==center.z)throw Error("WORLD_ASSET_CENTER_MISMATCH");this.region=region;this.readFailed=false;this.select(position,viewportWidth);}).catch(()=>{if(!this.disposed&&generation===this.readGeneration){this.readFailed=true;this.report(this.evidence());}});}
  this.select(position,viewportWidth);
 }
 private select(position:{x:number;z:number},width:number){
  if(!this.region||this.disposed)return;const phone=width<768,limit=phone?18:30;
  const selection=this.region.placements.map(placement=>{const asset=worldAssetById.get(placement.assetId)!;const distance=Math.hypot(placement.xMm/1000-this.camera.position.x,placement.zMm/1000-this.camera.position.z,this.camera.position.y-this.terrain(placement.xMm/1000,placement.zMm/1000));const height=(asset.bounds.max[1]!-asset.bounds.min[1]!)*asset.scale;
   let lod=worldAssetLod(height,distance,this.camera.fov,phone);const previous=this.previousLod.get(placement.id);if(previous!==undefined&&previous!==lod){const stable=worldAssetLod(height,distance*(lod>previous?0.9:1.1),this.camera.fov,phone);if(stable!==lod)lod=previous;}this.previousLod.set(placement.id,lod);return {placement,lod,distance,key:`${placement.assetId}:${lod}`};})
   .filter(s=>s.distance<this.camera.far*0.9).sort((a,b)=>a.distance-b.distance||a.placement.id.localeCompare(b.placement.id));
  const keys=new Set<string>();this.selected=[];
  for(const entry of selection){if(!keys.has(entry.key)&&keys.size>=limit)continue;keys.add(entry.key);this.selected.push(entry);if(this.selected.length>=(phone?48:84))break;}
  for(const key of [...this.previousLod.keys()])if(!selection.some(s=>s.placement.id===key))this.previousLod.delete(key);
  this.trim(phone?24:40);this.rebuild();this.pump();
 }
 private pump(){
  if(this.disposed)return;
  for(const s of this.selected){if(this.loading.size>=2)break;if(this.cache.has(s.key)||this.loading.has(s.key)||this.failed.has(s.key))continue;
   this.loading.add(s.key);const spec=worldAssetById.get(s.placement.assetId)!.lods[s.lod]!;
   void fetch(spec.url,{signal:AbortSignal.timeout(20_000)}).then(async response=>{if(!response.ok)throw Error("WORLD_ASSET_HTTP");const bytes=await response.arrayBuffer();if(bytes.byteLength!==spec.bytes)throw Error("WORLD_ASSET_LENGTH");const digest=await crypto.subtle.digest("SHA-256",bytes);const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");if(hex!==spec.sha256)throw Error("WORLD_ASSET_HASH");const jsonLength=new DataView(bytes).getUint32(12,true);const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength)));return {gltf:await this.loader.parseAsync(bytes,""),json};}).then(({gltf,json})=>{if(this.disposed){disposeModel(gltf);return;}gltf.scene.updateMatrixWorld(true);const textures=this.adoptTextures(gltf,json,spec.textureHashes);this.cache.set(s.key,{gltf,access:++this.access,textures});}).catch(()=>{if(!this.disposed)this.failed.add(s.key);}).finally(()=>{this.loading.delete(s.key);if(!this.disposed){this.rebuild();this.pump();}});
  }
 }
 private adoptTextures(gltf:GLTF,json:any,hashes:string[]):Set<string>{
  const used=new Set<string>(),images=new Set<any>();
  gltf.scene.traverse(node=>{if(!(node as THREE.Mesh).isMesh)return;const mesh=node as THREE.Mesh;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   for(const [property,value] of Object.entries(material)){if(!(value instanceof THREE.Texture))continue;images.add(value.image);const index=gltf.parser.associations.get(value)?.textures;if(index===undefined)throw Error("WORLD_TEXTURE_INDEX_REQUIRED");const source=json.textures[index];const image=source?.extensions?.EXT_texture_webp?.source??source?.source;const hash=hashes[image];if(!hash)throw Error("WORLD_TEXTURE_PROVENANCE_REQUIRED");
    const key=JSON.stringify([hash,value.colorSpace,value.wrapS,value.wrapT,value.magFilter,value.minFilter,value.channel,value.flipY,value.offset.toArray(),value.repeat.toArray(),value.rotation,value.center.toArray()]);let shared=this.sharedTextures.get(key);
    if(!shared){shared={texture:value,refs:0};this.sharedTextures.set(key,shared);}else if(shared.texture!==value){(material as any)[property]=shared.texture;value.dispose();}
    if(!used.has(key)){shared.refs++;used.add(key);}
   }
  }});
  const retained=new Set([...this.sharedTextures.values()].map(s=>s.texture.image));for(const image of images)if(!retained.has(image)&&typeof image?.close==="function")image.close();return used;
 }
 private release(cached:Cached){disposeModel(cached.gltf,true);const images=new Set<any>();for(const key of cached.textures){const shared=this.sharedTextures.get(key);if(shared&&--shared.refs===0){shared.texture.dispose();images.add(shared.texture.image);this.sharedTextures.delete(key);}}const retained=new Set([...this.sharedTextures.values()].map(s=>s.texture.image));for(const image of images)if(!retained.has(image)&&typeof image?.close==="function")image.close();}
 private clearInstances(){for(const child of [...this.root.children]){child.removeFromParent();if(child instanceof THREE.InstancedMesh)child.dispose();}}
 private rebuild(){
  if(this.disposed)return;const signature=this.selected.map(s=>`${s.placement.id}:${s.key}:${this.cache.has(s.key)}:${s.distance<28}:${this.terrain(s.placement.xMm/1000,s.placement.zMm/1000).toFixed(3)}`).join("|");if(signature===this.renderedKey){this.report(this.evidence());return;}this.renderedKey=signature;this.clearInstances();this.rendered=0;this.drawCalls=0;this.triangles=0;this.activeLights=0;
  const batches=new Map<string,Selection[]>();for(const s of this.selected){const batch=batches.get(s.key)||[];batch.push(s);batches.set(s.key,batch);}
  for(const [key,entries] of batches){const cached=this.cache.get(key);if(!cached)continue;cached.access=++this.access;const first=entries[0]!,asset=worldAssetById.get(first.placement.assetId)!,bounds=asset.lods[first.lod]!.bounds;
   const anchor=new THREE.Matrix4().makeTranslation(-(bounds.min[0]!+bounds.max[0]!)/2,-bounds.min[1]!,-(bounds.min[2]!+bounds.max[2]!)/2);
   const matrices=entries.map(({placement:p})=>new THREE.Matrix4().compose(new THREE.Vector3(p.xMm/1000,this.terrain(p.xMm/1000,p.zMm/1000),p.zMm/1000),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rotation*Math.PI/2),new THREE.Vector3(asset.scale,asset.scale,asset.scale)).multiply(anchor));
   let meshCount=0;cached.gltf.scene.traverse(node=>{if(!(node as THREE.Mesh).isMesh)return;const source=node as THREE.Mesh;if((source as THREE.SkinnedMesh).isSkinnedMesh)throw Error("STATIC_WORLD_ASSET_REQUIRED");
    const mesh=new THREE.InstancedMesh(source.geometry,source.material,entries.length);mesh.name=`world:${key}:${meshCount++}`;mesh.castShadow=false;mesh.receiveShadow=true;
    entries.forEach((_,i)=>mesh.setMatrixAt(i,matrices[i]!.clone().multiply(source.matrixWorld)));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.root.add(mesh);this.drawCalls+=Array.isArray(mesh.material)?mesh.material.length:1;
   });
   // Embedded emissive geometry is always retained. Only two nearby imported lights
   // are active; no shadows and no synthetic per-instance particles.
   cached.gltf.scene.traverse(node=>{if(!(node instanceof THREE.PointLight))return;for(let i=0;i<entries.length&&this.activeLights<2;i++){if(entries[i]!.distance>28)continue;const light=node.clone();light.castShadow=false;light.distance=Math.min(15,node.distance||15);light.position.setFromMatrixPosition(matrices[i]!.clone().multiply(node.matrixWorld));this.root.add(light);this.activeLights++;}});
   this.rendered+=entries.length;this.triangles+=asset.lods[first.lod]!.triangles*entries.length;
  }
  this.report(this.evidence());
 }
 private trim(limit:number){const active=new Set(this.selected.map(s=>s.key));for(const [key,value] of [...this.cache].sort((a,b)=>a[1].access-b[1].access)){if(this.cache.size<=limit)break;if(active.has(key))continue;this.release(value);this.cache.delete(key);}}
 evidence(){return {version:this.region?.version??null,catalogHash:this.region?.catalogHash??null,planned:this.region?.placements.length??0,rendered:this.rendered,models:this.cache.size,textures:this.sharedTextures.size,loading:this.loading.size,failed:this.failed.size+(this.readFailed?1:0),drawCalls:this.drawCalls,triangles:this.triangles,lights:this.activeLights,selected:this.selected.map(s=>({id:s.placement.assetId,lod:s.lod}))};}
 dispose(){if(this.disposed)return;this.disposed=true;this.readGeneration++;this.clearInstances();this.root.removeFromParent();for(const entry of this.cache.values())this.release(entry);this.cache.clear();this.previousLod.clear();}
}
