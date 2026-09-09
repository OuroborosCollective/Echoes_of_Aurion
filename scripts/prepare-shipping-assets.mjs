/** Offline build materialization of the verified shipping and decoder bytes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import path from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const contract=JSON.parse(await readFile('shared/worldAssetShipping.json'));
const catalog=JSON.parse(await readFile('shared/worldAssetCatalog.json')),collision=JSON.parse(await readFile('shared/worldCollisionManifest.json'));
if(contract.manifest.sourceBinding.catalogHash!==catalog.bundleSha256||contract.manifest.sourceBinding.collisionHash!==collision.manifestSha256)throw Error('SHIPPING_SOURCE_BINDING');
const packed=await readFile('assets/world/mobile-shipping.bundle.br');if(hash(packed)!==contract.bundleSha256)throw Error('SHIPPING_BUNDLE_HASH');
const data=brotliDecompressSync(packed,{maxOutputLength:64*1024*1024}),length=data.readUInt32LE(0);
if(length>1_000_000)throw Error('SHIPPING_INDEX_LIMIT');
const index=JSON.parse(data.subarray(4,4+length));let offset=4+length;
const specs=new Map(contract.manifest.assets.flatMap(a=>[...a.lods.flatMap(l=>[l,l.fallback]),...(a.collider?[a.collider]:[])]).map(s=>[s.file,s]));
for(const file of index){
 const spec=specs.get(file.path);if(!spec||file.sha256!==spec.sha256||file.bytes!==spec.bytes||!/^[a-z0-9-]+\/(LOD[012]\.(ktx2|fallback)|collider)\.glb$/.test(file.path))throw Error('SHIPPING_INDEX_ENTRY');
 const bytes=data.subarray(offset,offset+file.bytes);offset+=file.bytes;if(hash(bytes)!==file.sha256)throw Error('SHIPPING_FILE_HASH');
 const target=path.join('client/public/world-shipping',file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);specs.delete(file.path);
}
if(specs.size||offset!==data.length)throw Error('SHIPPING_BUNDLE_INCOMPLETE');
const three=JSON.parse(await readFile('node_modules/three/package.json'));if(three.version!==contract.decoder.threeVersion)throw Error('SHIPPING_DECODER_VERSION');
for(const spec of contract.decoder.files){
 if(!['basis_transcoder.js','basis_transcoder.wasm'].includes(spec.name))throw Error('SHIPPING_DECODER_PATH');
 const bytes=await readFile(`node_modules/three/examples/jsm/libs/basis/${spec.name}`);
 if(bytes.length!==spec.bytes||hash(bytes)!==spec.sha256)throw Error('SHIPPING_DECODER_HASH');
 await mkdir('client/public/basis',{recursive:true});await writeFile(`client/public/basis/${spec.name}`,bytes);
}
console.log(JSON.stringify({shippingFiles:index.length,manifestSha256:contract.manifest.manifestSha256,decoderVersion:three.version,verified:true}));
