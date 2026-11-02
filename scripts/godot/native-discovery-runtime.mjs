import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const [godot, project] = process.argv.slice(2);
assert.ok(godot && project);
const sha = c => 'sha256:' + c.repeat(64);
let reads = 0, writes = 0, failure;
const slice = known => ({status: known ? 'VERIFIED' : 'FOGGED', connectionId:'zone_peer_discovery', mutationAuthority:'none', fingerprint:sha('e'), slice:{
  schema:'aurion.world-slice.v1',policy:'actor-observed-current-epoch.v1',worldId:'echoes-of-aurion-global',zoneId:'observatory_threshold',actorId:'player:1',epoch:1,observedAtTick:12,worldRoot:sha('a'),sourceRevision:'b'.repeat(40),coordinate:{x:0,z:0},radius:0,lod:'full',knowledgeHash:known?sha('c'):null,
  chunks: known ? [{coordinate:{x:0,z:0},authorityReceiptHash:sha('d'),tiles:Array.from({length:256},(_,i)=>({x:i%16,z:Math.floor(i/16),heightMm:0,surface:'grass'})),structures:[],roads:[]}] : [], entities:[{entityId:'player:1',position:{x:0,z:0}}]}});
const json = (res, value) => res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify(value));
const server = createServer(async (req,res) => {
  try {
    assert.equal(req.headers.authorization,'Bearer synthetic-local-test-only');
    if(req.method==='GET') {
      assert.equal(req.url,'/api/game/world-slice?x=0&z=0&radius=0&lod=full');
      reads++;
      const value=slice(reads===2);
      if(reads>=4) setTimeout(()=>json(res,value),200); else json(res,value);
    } else {
      assert.equal(req.method,'POST');
      assert.equal(req.url,'/api/trpc/gameplay.recordExplorationDiscovery');
      let body=''; for await(const chunk of req) body+=chunk;
      assert.deepEqual(JSON.parse(body),{json:{epoch:1,chunkX:0,chunkZ:0,observedAtLogicalFrame:12}});
      writes++;
      json(res,{result:{data:{json:{status:'VERIFIED',mutationAuthority:'none',memory:{schema:'aurion.exploration-memory.v1',userId:writes===2?2:1,worldId:'echoes-of-aurion-global',worldEpoch:1,chunkX:0,chunkZ:0,firstDiscoveryReceiptHash:sha('d'),latestConfirmedVisitSequence:12,latestProjectionHash:sha('f'),sourceRevision:'b'.repeat(40),memoryHash:sha('c')}}}}});
    }
  } catch(error) { failure ??=error; res.writeHead(500).end(); }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3000,'127.0.0.1',resolve);});
const child=spawn(godot,['--headless','--path',project,'--script','tests/test_native_discovery.gd'],{stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
clearTimeout(timer);await new Promise(resolve=>server.close(resolve));
process.stdout.write(output);
assert.ifError(failure);assert.equal(code,0);assert.equal(reads,7);assert.equal(writes,3);assert.match(output,/NATIVE_DISCOVERY_HTTP_PASS/);assert.doesNotMatch(output,/SCRIPT ERROR|ERROR:/);
