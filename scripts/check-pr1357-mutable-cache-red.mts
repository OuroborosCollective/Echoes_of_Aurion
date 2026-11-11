/** Negative control executed in the immutable, known-broken 0484b955 source tree.
 * The candidate's independent regression must subsequently demonstrate GREEN.
 * This is isolated source behavior, never production evidence.
 */
import assert from "node:assert/strict";
import { snapshotWorldNatureCollision } from "../server/worldNatureCollision";
const ids:string[]=[];
const first=snapshotWorldNatureCollision(ids);
const id=first.obstaclesForChunk({x:3,z:3})[0]?.id;
assert.ok(id,"REAL_GENERATED_COLLIDER_REQUIRED");
ids.push(id);
const second=snapshotWorldNatureCollision(ids);
const stale=second.obstaclesForChunk({x:3,z:3}).some(o=>o.id===id);
// Execute the desired regression assertion against the unchanged old source;
// only this precise assertion failure constitutes the expected RED control.
assert.throws(()=>assert.equal(stale,false),{code:"ERR_ASSERTION",actual:true,expected:false});
console.log(JSON.stringify({status:"RED_REPRODUCED",brokenSourceRevision:"0484b9552dd44e18183e532a00a2ff7ba9d6bc4a",boundary:"mutable-array identity cache",productionEvidence:false}));
