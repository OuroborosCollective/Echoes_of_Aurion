/** Seal reviewed shipping variants alongside the unchanged world/collision catalog. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {brotliCompressSync,constants} from 'node:zlib';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'');if(!process.argv[2])throw Error('SHIPPING_ROOT_REQUIRED');
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0)):x);
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json')));
const {manifestSha256,...payload}=manifest;
if(manifest.version!=='aurion-glb-shipping.v1'||manifestSha256!==hash(canonical(payload)))throw Error('SHIPPING_MANIFEST_HASH');
const catalogBytes=await readFile('shared/worldAssetCatalog.json'),collisionBytes=await readFile('shared/worldCollisionManifest.json');
const catalog=JSON.parse(catalogBytes),collision=JSON.parse(collisionBytes),binding=manifest.sourceBinding;
if(binding.catalogHash!==catalog.bundleSha256||binding.catalogFileSha256!==hash(catalogBytes)||binding.collisionHash!==collision.manifestSha256||binding.collisionFileSha256!==hash(collisionBytes))throw Error('SHIPPING_AUTHORITY_BINDING');
const files=new Map();
for(const item of manifest.assets){
 const original=catalog.assets.find(a=>a.id===item.asset);if(!original)throw Error('SHIPPING_CATALOG_ID');
 const topology=collision.colliders.find(c=>c.assetId===item.asset)??null;
 if(canonical(item.topology.confirmedCollider)!==canonical(topology)||item.topology.collisionManifestSha256!==collision.manifestSha256)throw Error('SHIPPING_TOPOLOGY_CHANGED');
 for(const [i,lod] of item.lods.entries()){
  if(lod.name!==`LOD${i}`||lod.sourceSha256!==original.lods[i].sha256||lod.animations||lod.skins)throw Error('SHIPPING_STATIC_LOD_SOURCE');
 }
 if(original.collider?.sha256!==item.collider?.sha256)throw Error('SHIPPING_COLLIDER_CHANGED');
 for(const spec of [...item.lods.flatMap(l=>[l,l.fallback]),...(item.collider?[item.collider]:[])]){
  if(!/^[a-z0-9-]+\/(LOD[012]\.(ktx2|fallback)|collider)\.glb$/.test(spec.file))throw Error('SHIPPING_FILE_PATH');
  const bytes=await readFile(path.join(root,spec.file));if(hash(bytes)!==spec.sha256||bytes.length!==spec.bytes)throw Error('SHIPPING_OUTPUT_HASH');
  files.set(spec.file,{path:spec.file,bytes:bytes.length,sha256:hash(bytes),content:bytes});
 }
}
const entries=[...files.values()].sort((a,b)=>a.path<b.path?-1:1);
const table=Buffer.from(JSON.stringify(entries.map(({content,...entry})=>entry))),header=Buffer.alloc(4);header.writeUInt32LE(table.length);
const bundle=brotliCompressSync(Buffer.concat([header,table,...entries.map(f=>f.content)]),{params:{[constants.BROTLI_PARAM_QUALITY]:9,[constants.BROTLI_PARAM_LGWIN]:24}});
const decoderFiles=[];
for(const name of ['basis_transcoder.js','basis_transcoder.wasm']){
 const bytes=await readFile(`node_modules/three/examples/jsm/libs/basis/${name}`);decoderFiles.push({name,bytes:bytes.length,sha256:hash(bytes)});
}
await mkdir('assets/world',{recursive:true});await writeFile('assets/world/mobile-shipping.bundle.br',bundle);
await writeFile('shared/worldAssetShipping.json',JSON.stringify({manifest,bundleSha256:hash(bundle),decoder:{threeVersion:JSON.parse(await readFile('node_modules/three/package.json')).version,files:decoderFiles}},null,2)+'\n');
console.log(JSON.stringify({files:entries.length,manifestSha256,bundleSha256:hash(bundle),bundleBytes:bundle.length}));
