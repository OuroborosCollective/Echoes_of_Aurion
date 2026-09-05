// Offline, deterministic importer for the user-supplied optimized city/nature packs.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { Matrix4, Vector3, Quaternion, Box3 } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const input=process.argv[2]; if(!input) throw Error('Provide the extracted world-source directory');
await MeshoptDecoder.ready;
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=[], assets=[];
function audit(bytes, ceiling){
 if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
 const jsonSize=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonSize)),bin=bytes.subarray(28+jsonSize);
 const views=new Map();
 const view=index=>{if(views.has(index))return views.get(index);const v=doc.bufferViews[index],e=v.extensions?.EXT_meshopt_compression;let out;
  if(e){out=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(out,e.count,e.byteStride,bin.subarray(e.byteOffset||0,(e.byteOffset||0)+e.byteLength),e.mode,e.filter);}
  else out=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  views.set(index,out);return out;};
 const bounds=new Box3();let triangles=0;
 const walk=(index,parent)=>{const n=doc.nodes[index],matrix=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));matrix.premultiply(parent);
  for(const primitive of doc.meshes?.[n.mesh]?.primitives||[]){if((primitive.mode??4)!==4)throw Error('Only triangle meshes supported');const a=doc.accessors[primitive.attributes.POSITION];triangles+=(doc.accessors[primitive.indices]?.count??a.count)/3;
   const data=view(a.bufferView),dv=new DataView(data.buffer,data.byteOffset,data.byteLength),component=a.componentType,bytesPer={5120:1,5121:1,5122:2,5123:2,5126:4}[component];if(!bytesPer)throw Error('Position component invalid');const stride=doc.bufferViews[a.bufferView].byteStride||bytesPer*3;
   const number=offset=>{let value=component===5120?dv.getInt8(offset):component===5121?dv.getUint8(offset):component===5122?dv.getInt16(offset,true):component===5123?dv.getUint16(offset,true):dv.getFloat32(offset,true);if(a.normalized)value=Math.max(component===5120||component===5122?-1:0,value/({5120:127,5121:255,5122:32767,5123:65535}[component]));return value;};
   for(let i=0;i<a.count;i++){const offset=(a.byteOffset||0)+i*stride;bounds.expandByPoint(new Vector3(number(offset),number(offset+bytesPer),number(offset+2*bytesPer)).applyMatrix4(matrix));}}
  for(const child of n.children||[])walk(child,matrix);};
 for(const root of doc.scenes[doc.scene||0].nodes)walk(root,new Matrix4());
 if(!Number.isInteger(triangles)||triangles>ceiling||bounds.isEmpty())throw Error(`Asset budget/bounds failed: ${triangles}/${ceiling}`);
 if(!(doc.extensionsUsed||[]).includes('EXT_meshopt_compression'))throw Error('Meshopt missing');
 return {textureHashes:(doc.images||[]).map(image=>sha(view(image.bufferView))),triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},lights:doc.extensions?.KHR_lights_punctual?.lights?.length||0};
}
for(const family of ['city','nature']){
 const manifest=JSON.parse(await readFile(path.join(input,family,'lod_manifest.json'),'utf8'));
 for(const asset of manifest.assets.toSorted((a,b)=>a.asset<b.asset?-1:1)){
  const id=family+'-'+asset.asset.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-'),lods=[];let bound;
  for(let level=0;level<3;level++){const entry=asset.lods.find(l=>l.name===`LOD${level}`),content=await readFile(path.join(input,family,entry.file)),report=audit(content,[1600,800,300][level]);
   if(level===0)bound=report.bounds;
   const file=`${family}/${id}/lod${level}.glb`;files.push({path:file,sha256:sha(content),bytes:content.length,content});lods.push({url:'/world-assets/'+file,sha256:sha(content),bytes:content.length,triangles:report.triangles,bounds:report.bounds,textureHashes:report.textureHashes});}
  let collider=null;
  if(family==='nature'){const content=await readFile(path.join(input,family,asset.asset,asset.asset+'_Collider.glb'));const colliderReport=audit(content,64);const file=`${family}/${id}/collider.glb`;files.push({path:file,sha256:sha(content),bytes:content.length,content});collider={bounds:colliderReport.bounds,url:'/world-assets/'+file,sha256:sha(content),bytes:content.length};}
  const name=asset.asset;const category=family==='city'?/Hut|Market/.test(name)?'building':/Bridge|Foundation/.test(name)?'structure':'prop':/^Tree_/.test(name)?'tree':/^Mountain_/.test(name)?'mountain':/^Rock_|^Log_|^Stump_|^Timber_/.test(name)?'rock':'plant';
  const rawSize=bound.max.map((n,i)=>n-bound.min[i]);const target={building:11,structure:8,prop:2,tree:7,mountain:18,rock:2,plant:1}[category];const scale=target/Math.max(...rawSize);
  assets.push({id,name,family,category,scale:Number(scale.toFixed(8)),bounds:bound,lods,collider});
 }
}
const catalog={version:'aurion-world-assets.v1',sourceArchives:{city:'8ffc2d39d4a80ebff7848b1a10757cabe3a731154f0de399f4eb10a7e314c3a1',nature:'87c6e6437ee728ae927ac55674a331eb653292de9e50b1872f9ecff3578cd25d'},assets};
const table=Buffer.from(JSON.stringify(files.map(({content,...file})=>file))),header=Buffer.alloc(4);header.writeUInt32LE(table.length);
const bundle=brotliCompressSync(Buffer.concat([header,table,...files.map(f=>f.content)]),{params:{[constants.BROTLI_PARAM_QUALITY]:9,[constants.BROTLI_PARAM_LGWIN]:24}});
await mkdir('assets/world',{recursive:true});await writeFile('assets/world/mobile-world-assets.bundle.br',bundle);
await writeFile('shared/worldAssetCatalog.json',JSON.stringify({...catalog,bundleSha256:sha(bundle)},null,2)+'\n');
console.log(JSON.stringify({models:assets.length,files:files.length,uncompressedBytes:files.reduce((n,f)=>n+f.bytes,0),bundleBytes:bundle.length,bundleSha256:sha(bundle),worstGroundOffset:Math.max(...assets.map(a=>Math.abs(a.bounds.min[1])))}));
