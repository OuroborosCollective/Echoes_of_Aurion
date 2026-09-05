import { describe, expect, it, vi } from "vitest";
import { decodeNpcSnapshot, decodeOwnedNpcPacket, encodeNpcSnapshot, NPC_SNAPSHOT_MAX_BYTES, type PublicNpcSnapshot } from "@shared/npcSnapshotProtocol";
const npc:PublicNpcSnapshot={npcId:"lyra",regionId:"observatory_threshold",resolutionIndex:12,goal:"seek_safety",needs:{safety:.65,resources:.25,belonging:0,status:1,wealth:.123456789,power:.4},memoryCount:2,decisionHash:"ab".repeat(32)};
// Re-sign corrupt protocol fields so semantic validation is exercised independently of checksum failure.
function resign(bytes:Uint8Array){let hash=2166136261;bytes.forEach((value,index)=>{if(index<16||index>=20)hash=Math.imul(hash^value,16777619);});new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(16,hash>>>0);return bytes;}
describe("AURS v2 bounded NPC transport",()=>{
 it("replays exact needs, stable actor IDs and receipt ticks without time or entropy",()=>{
  const clock=vi.spyOn(Date,"now").mockImplementation(()=>{throw Error("clock");}),random=vi.spyOn(Math,"random").mockImplementation(()=>{throw Error("entropy");});
  try {const bytes=encodeNpcSnapshot([{...npc,npcId:"orun"},npc]);expect(encodeNpcSnapshot([npc,{...npc,npcId:"orun"}])).toEqual(bytes);
   const result=decodeNpcSnapshot(bytes);expect(result.npcs).toEqual([npc,{...npc,npcId:"orun"}]);expect(result.resolutionIndex).toBe(12);
   expect(Object.isFrozen(result.npcs[0].needs)).toBe(true);expect(Object.isFrozen(result.npcs)).toBe(true);
   const envelope={userId:7,format:"aurion-public-npc.v2",data:btoa(String.fromCharCode(...bytes))};expect(decodeOwnedNpcPacket(envelope,7)).toEqual(result);expect(()=>decodeOwnedNpcPacket(envelope,8)).toThrow();
   const offset=new Uint8Array(bytes.length+12);offset.set(bytes,6);expect(decodeNpcSnapshot(offset.subarray(6,6+bytes.length))).toEqual(result);
  }finally{clock.mockRestore();random.mockRestore();}
 });
 it("rejects every truncation and bounded-header corruption without partial results",()=>{
  const bytes=encodeNpcSnapshot([npc]);
  for(let size=0;size<bytes.length;size++)expect(()=>decodeNpcSnapshot(bytes.slice(0,size))).toThrow();
  for(const index of [0,4,6,8,12,16,20,24,bytes.length-1]){const corrupt=bytes.slice();corrupt[index]^=255;expect(()=>decodeNpcSnapshot(corrupt)).toThrow();}
  expect(()=>decodeNpcSnapshot(new Uint8Array(NPC_SNAPSHOT_MAX_BYTES+1))).toThrow();
  const extra=new Uint8Array(bytes.length+1);extra.set(bytes);expect(()=>decodeNpcSnapshot(extra)).toThrow();
 });
 it("rejects invalid enums, nonfinite/out-of-range needs, aliases and inconsistent counts even with valid checksum",()=>{
  const bytes=encodeNpcSnapshot([npc]),fixed=24+1+npc.npcId.length+1+npc.regionId.length;
  for(const corrupt of [(()=>{const b=bytes.slice();b[fixed+4]=255;return b;})(),(()=>{const b=bytes.slice();b[fixed+5]=25;return b;})(),(()=>{const b=bytes.slice();new DataView(b.buffer).setFloat64(fixed+6,NaN);return b;})(),(()=>{const b=bytes.slice();new DataView(b.buffer).setFloat64(fixed+6,1.1);return b;})(),(()=>{const b=bytes.slice();new DataView(b.buffer).setUint16(6,0);return b;})(),(()=>{const b=bytes.slice();new DataView(b.buffer).setUint32(8,13);return b;})()])expect(()=>decodeNpcSnapshot(resign(corrupt))).toThrow();
  expect(()=>encodeNpcSnapshot([npc,npc])).toThrow();expect(()=>encodeNpcSnapshot([{...npc,npcId:"lyra😀"}])).toThrow();expect(()=>encodeNpcSnapshot(Array.from({length:129},(_,i)=>({...npc,npcId:`npc_${i}`})))).toThrow();
  expect(decodeNpcSnapshot(encodeNpcSnapshot([]))).toEqual({resolutionIndex:0,npcs:[]});
  expect(()=>decodeOwnedNpcPacket({userId:1,format:"aurion-public-npc.v2",data:"A".repeat(90000)},1)).toThrow();
 });
});
