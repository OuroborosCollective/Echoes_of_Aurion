import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, symlink, rm, chown } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synchronizeApprovedGlbs, approvedPhysicalAssets, sha256, atomicWrite } from './sync-approved-glbs.mjs';

const base = 'https://arelogic.space';
const makeGlb = text => {
  let data = Buffer.from(JSON.stringify({ asset: { version: '2.0', generator: text }, scenes: [{ nodes: [] }], scene: 0 }));
  while (data.length % 4) data = Buffer.concat([data, Buffer.from(' ')]);
  const buffer = Buffer.alloc(20 + data.length);
  buffer.write('glTF', 0); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(data.length, 12); buffer.write('JSON', 16);
  data.copy(buffer, 20);
  return buffer;
};
const catalogFor = (...items) => ({version:'aurion.glb-import.v1', revision:'a'.repeat(64),entries:items});
const entryFor = (bytes, lods) => {
  const sha = sha256(bytes);
  return {assetId:'glb_'+sha.slice(0,48),sha256:sha,displayName:'Test mesh',purpose:'world-environment',assetType:'arena',bytes:bytes.length,storageUrl:`/api/assets/glb/${sha}.glb`,...(lods?{lods}:{} )};
};
const resource = ({sha256,bytes,assetId}) => ({sha256,bytes:bytes.length,assetId,storageUrl:`/api/assets/glb/${sha256}.glb`});
const reader = (catalog, objects, {badHeader=false}={}) => {
  const requested=[];
  const fetcher = async url => {
    const path = String(url);
    requested.push(path);
    if (path === base+'/api/game/glb-catalog') return new Response(JSON.stringify(catalog),{status:200,headers:{'Content-Type':'application/json'}});
    const sha = path.split('/').at(-1)?.slice(0,-4);
    if (objects.has(sha)) return new Response(objects.get(sha),{status:200,headers:{'Content-Type':badHeader?'text/html':'model/gltf-binary'}});
    return new Response('missing',{status:404});
  };
  return { fetcher, requested };
};
async function project(run) {
 const root=await mkdtemp(join(tmpdir(),'aurion-glb-catalog-'));
 try {await mkdir(join(root,'assets'));await writeFile(join(root,'project.godot'),'config_version=5\n');return await run(root)}
 finally {await rm(root,{force:true,recursive:true});}
}

test('TDD: a missing approved binary is downloaded with exact SHA and recorded in the Godot manifest', async()=>project(async root=>{
 const bytes=makeGlb('first'); const e=entryFor(bytes);const {fetcher,requested}=reader(catalogFor(e),new Map([[e.sha256,bytes]]));
 const result=await synchronizeApprovedGlbs({projectDirectory:root,fetcher});
 assert.equal(result.physicalCount,1);assert.equal(result.downloaded,1);assert.equal(result.reused,0);
 assert.equal(sha256(await readFile(join(root,'assets/aurion-catalog-sync',`${e.sha256}.glb`))),e.sha256);
 assert.equal(result.models[0].resourcePath,`res://assets/aurion-catalog-sync/${e.sha256}.glb`);
 assert.deepEqual(requested,[base+'/api/game/glb-catalog',base+e.storageUrl]);
 const manifest=JSON.parse(await readFile(join(root,'assets/aurion-catalog-sync','catalog-manifest.json'),'utf8'));
 assert.equal(manifest.catalogRevision,'a'.repeat(64));
}));

test('TDD: byte-identical models already inside Godot are reused instead of downloading duplicate files',async()=>project(async root=>{
 const bytes=makeGlb('existing');const e=entryFor(bytes);await mkdir(join(root,'assets/manual'));await writeFile(join(root,'assets/manual/stone.glb'),bytes);
 const {fetcher,requested}=reader(catalogFor(e),new Map());const report=await synchronizeApprovedGlbs({projectDirectory:root,fetcher});
 assert.equal(report.downloaded,0);assert.equal(report.reused,1);assert.equal(report.models[0].resourcePath,'res://assets/manual/stone.glb');
 assert.deepEqual(requested,[base+'/api/game/glb-catalog']);
}));

test('TDD: all physical LOD variants are synchronized, not only the first family model',async()=>project(async root=>{
 const a=makeGlb('lod0'),b=makeGlb('lod1');const e=entryFor(a);const l=resource({sha256:sha256(b),bytes:b,assetId:'glb_'+sha256(b).slice(0,48)});e.lods=[{level:0,...resource({sha256:e.sha256,bytes:a,assetId:e.assetId})},{level:1,...l}];
 const {fetcher}=reader(catalogFor(e),new Map([[e.sha256,a],[l.sha256,b]]));
 const result=await synchronizeApprovedGlbs({projectDirectory:root,fetcher});
 assert.equal(result.physicalCount,2);assert.equal(result.downloaded,2);
}));

test('TDD: rejects a tampered GLB and leaves no successful manifest',async()=>project(async root=>{
 const good=makeGlb('good');const bad=makeGlb('evil');const e=entryFor(good);
 const {fetcher}=reader(catalogFor(e),new Map([[e.sha256,bad]]));
 await assert.rejects(synchronizeApprovedGlbs({projectDirectory:root,fetcher}),/CATALOG_GLB_SHA_MISMATCH/);
 const names=await readdir(join(root,'assets/aurion-catalog-sync'));
 assert.ok(!names.includes('catalog-manifest.json'));
}));

test('TDD: fail-closed on arbitrary download paths, even with a valid SHA',()=>{
 const bytes=makeGlb('any');const e=entryFor(bytes);e.storageUrl='https://example.com/override.glb';
 assert.throws(()=>approvedPhysicalAssets(catalogFor(e)),/CATALOG_URL_UNTRUSTED/);
});

test('TDD: repeat sync is idempotent and a new approved hash updates the manifest',async()=>project(async root=>{
 const first=makeGlb('first'),second=makeGlb('second');const e1=entryFor(first),e2=entryFor(second);
 let current=catalogFor(e1);const objects=new Map([[e1.sha256,first],[e2.sha256,second]]);
 const fetcher=async (...args)=>reader(current,objects).fetcher(...args);
 let result=await synchronizeApprovedGlbs({projectDirectory:root,fetcher});assert.equal(result.downloaded,1);
 result=await synchronizeApprovedGlbs({projectDirectory:root,fetcher});assert.equal(result.downloaded,0);
 current={...catalogFor(e2),revision:'b'.repeat(64)};
 result=await synchronizeApprovedGlbs({projectDirectory:root,fetcher});
 assert.equal(result.downloaded,1);assert.equal(result.models[0].sha256,e2.sha256);assert.equal(result.catalogRevision,'b'.repeat(64));
 const names=await readdir(join(root,'assets/aurion-catalog-sync'));
 assert.ok(names.includes(e1.sha256+'.glb'),'historical content is retained safely');
}));

test('TDD: unsafe managed directory symlink is rejected without mutation',async()=>project(async root=>{
 const bytes=makeGlb('symlink'),e=entryFor(bytes);
 const elsewhere=await mkdtemp(join(tmpdir(),'aurion-glb-escape-'));
 try{await symlink(elsewhere,join(root,'assets/aurion-catalog-sync'));
 const {fetcher}=reader(catalogFor(e),new Map([[e.sha256,bytes]]));
 await assert.rejects(synchronizeApprovedGlbs({projectDirectory:root,fetcher}),/CATALOG_DIRECTORY_UNSAFE/);
 assert.deepEqual(await readdir(elsewhere),[]);
 }finally{await rm(elsewhere,{recursive:true,force:true})}
}));

test('TDD: requires the server-approved catalog and refuses unvalidated inventory',()=>{
 const e=entryFor(makeGlb('version'));
 assert.throws(()=>approvedPhysicalAssets({...catalogFor(e),version:'custom.catalog.v1'}),/CATALOG_VERSION_INVALID/);
 assert.throws(()=>approvedPhysicalAssets({...catalogFor(e),revision:'not-a-hash'}),/CATALOG_REVISION_INVALID/);
});

// Review (Devin on 8dda2584): a failed write must not leave its temporary file behind.
test('TDD: a failed atomic write removes its temporary file', async()=>project(async root=>{
 const target=join(root,'assets','manifest.json');
 await assert.rejects(atomicWrite(target, 42));
 assert.deepEqual((await readdir(join(root,'assets'))).filter(name=>name.endsWith('.tmp')),[]);
}));

// Review (Devin on 8dda2584): the mirror never writes into a project owned by another
// account, so a workspace user cannot redirect privileged writes through path swaps.
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
test('TDD: refuses a project directory owned by another account', {skip: !asRoot && 'needs root to create a foreign-owned directory'}, async()=>project(async root=>{
 await chown(root, 65534, 65534);
 const bytes=makeGlb('foreign'),e=entryFor(bytes);const {fetcher,requested}=reader(catalogFor(e),new Map([[e.sha256,bytes]]));
 await assert.rejects(synchronizeApprovedGlbs({projectDirectory:root,fetcher}),/CATALOG_PROJECT_OWNER_MISMATCH/);
 assert.deepEqual(requested,[]);
 assert.ok(!(await readdir(join(root,'assets'))).includes('aurion-catalog-sync'));
}));

test('TDD: the command-line mirror refuses to run as root', {skip: !asRoot && 'needs root'}, ()=>{
 const script=fileURLToPath(new URL('./sync-approved-glbs.mjs', import.meta.url));
 let stderr='';
 try { execFileSync(process.execPath,[script,'--project','/nonexistent'],{stdio:['ignore','pipe','pipe']}); }
 catch(error){ stderr=String(error.stderr); }
 assert.match(stderr,/CATALOG_ROOT_FORBIDDEN/);
});

// Review (CodeRabbit on 8dda2584): systemd launches the script through the `current`
// release symlink; main() must still run (it used to exit 0 silently).
test('TDD: the command-line mirror runs when launched through a release symlink', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aurion-glb-release-'));
 try {
  await mkdir(join(dir,'releases','abc'),{recursive:true});
  await writeFile(join(dir,'releases','abc','sync-approved-glbs.mjs'),await readFile(new URL('./sync-approved-glbs.mjs', import.meta.url)));
  await symlink(join(dir,'releases','abc'),join(dir,'current'));
  let stderr='',status=0;
  try { execFileSync(process.execPath,[join(dir,'current','sync-approved-glbs.mjs')],{stdio:['ignore','pipe','pipe']}); }
  catch(error){ stderr=String(error.stderr); status=error.status; }
  // Without arguments main() rejects the usage (or root): it ran and failed closed.
  assert.equal(status,1);
  assert.match(stderr,/CATALOG_(USAGE_INVALID|ROOT_FORBIDDEN)/);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
