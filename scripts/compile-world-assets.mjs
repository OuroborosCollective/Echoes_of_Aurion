// Offline, deterministic importer for the user-supplied optimized city/nature packs.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { audit } from './world-glb-geometry.mjs';
const input=process.argv[2]; if(!input) throw Error('Provide the extracted world-source directory');
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=[], assets=[];

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
