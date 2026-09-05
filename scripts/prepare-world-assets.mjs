/** Materialize only the hash-verified game assets, without downloading at build time. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const catalog=JSON.parse(await readFile('shared/worldAssetCatalog.json','utf8'));
const packed=await readFile('assets/world/mobile-world-assets.bundle.br');
if(sha(packed)!==catalog.bundleSha256)throw Error('WORLD_ASSET_BUNDLE_HASH_MISMATCH');
const data=brotliDecompressSync(packed,{maxOutputLength:50_000_000}),length=data.readUInt32LE(0);
if(length>1_000_000)throw Error('WORLD_ASSET_INDEX_TOO_LARGE');
const index=JSON.parse(data.subarray(4,4+length));let offset=4+length;
const expected=new Map(catalog.assets.flatMap(a=>[...a.lods,...(a.collider?[a.collider]:[])].map(l=>[l.url.replace('/world-assets/',''),l])));
if(index.length!==expected.size)throw Error('WORLD_ASSET_COUNT_MISMATCH');
for(const file of index){const spec=expected.get(file.path);if(!/^(nature|city)\/[a-z0-9-]+\/(lod[012]|collider)\.glb$/.test(file.path)||!spec||file.bytes!==spec.bytes||file.sha256!==spec.sha256)throw Error('WORLD_ASSET_ENTRY_INVALID');
 const content=data.subarray(offset,offset+file.bytes);offset+=file.bytes;if(sha(content)!==file.sha256)throw Error('WORLD_ASSET_FILE_HASH_MISMATCH');expected.delete(file.path);
 if(!process.argv.includes('--check')){const target=path.join('client/public/world-assets',file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content);}}
if(expected.size||offset!==data.length)throw Error('WORLD_ASSET_BUNDLE_INCOMPLETE');
console.log(JSON.stringify({worldAssetFiles:index.length,bundleSha256:catalog.bundleSha256,verified:true}));
