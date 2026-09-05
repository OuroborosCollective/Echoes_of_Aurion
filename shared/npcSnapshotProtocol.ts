/** Aurion AURS v2: bounded public NPC projection. Logical receipt indices replace wall-clock timestamps. */
export const NPC_SNAPSHOT_VERSION = 2;
export const NPC_SNAPSHOT_MAX_BYTES = 65_536;
export const NPC_SNAPSHOT_MAX_COUNT = 128;
export const npcSnapshotNeeds = ["safety","resources","belonging","status","wealth","power"] as const;
export const npcSnapshotGoals = ["seek_safety","gather_resources","socialize","gain_reputation","trade","expand_influence"] as const;
export type PublicNpcSnapshot = Readonly<{ npcId: string; regionId: string; resolutionIndex: number; goal: typeof npcSnapshotGoals[number]; needs: Readonly<Record<typeof npcSnapshotNeeds[number],number>>; memoryCount: number; decisionHash: string }>;
const HEADER = 24, MAGIC = 0x41555253;
function invalid(): never { throw new Error("NPC_SNAPSHOT_INVALID"); }
const identity = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
function validRow(row: PublicNpcSnapshot) {
  if (!row || !identity(row.npcId) || !identity(row.regionId) || !Number.isSafeInteger(row.resolutionIndex) || row.resolutionIndex < 0 || row.resolutionIndex > 2147483647 || !npcSnapshotGoals.includes(row.goal) || !Number.isInteger(row.memoryCount) || row.memoryCount < 0 || row.memoryCount > 24 || !/^[a-f0-9]{64}$/.test(row.decisionHash) || !row.needs || npcSnapshotNeeds.some(key => !Number.isFinite(row.needs[key]) || row.needs[key] < 0 || row.needs[key] > 1)) invalid();
}
/** Corruption checksum, not an authentication mechanism. Authentication remains at the HTTP/session boundary. */
function checksum(bytes: Uint8Array): number {
  let hash = 2166136261;
  for (let i=0;i<bytes.length;i++) { if(i>=16 && i<20) continue; hash = Math.imul(hash ^ bytes[i],16777619); }
  return hash >>> 0;
}
export function encodeNpcSnapshot(input: readonly PublicNpcSnapshot[]): Uint8Array {
  if (!Array.isArray(input) || input.length > NPC_SNAPSHOT_MAX_COUNT) invalid();
  const rows = [...input].sort((a,b)=>a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0);
  let size = HEADER, maximumIndex = 0;
  for (const [i,row] of rows.entries()) {
    validRow(row); if(i && rows[i-1].npcId===row.npcId) invalid();
    size += 88 + row.npcId.length + row.regionId.length;
    maximumIndex = Math.max(maximumIndex,row.resolutionIndex);
  }
  if(size > NPC_SNAPSHOT_MAX_BYTES) invalid();
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  view.setUint32(0,MAGIC); view.setUint16(4,NPC_SNAPSHOT_VERSION); view.setUint16(6,rows.length);
  view.setUint32(8,maximumIndex); view.setUint32(12,size-HEADER);
  let offset=HEADER;
  const writeId=(id:string)=>{view.setUint8(offset++,id.length);for(let i=0;i<id.length;i++)view.setUint8(offset++,id.charCodeAt(i));};
  for(const row of rows) {
    writeId(row.npcId);writeId(row.regionId);view.setUint32(offset,row.resolutionIndex);offset+=4;
    view.setUint8(offset++,npcSnapshotGoals.indexOf(row.goal));view.setUint8(offset++,row.memoryCount);
    for(const key of npcSnapshotNeeds){view.setFloat64(offset,row.needs[key]);offset+=8;}
    for(let i=0;i<64;i+=2)view.setUint8(offset++,Number.parseInt(row.decisionHash.slice(i,i+2),16));
  }
  if(offset!==size) invalid();
  view.setUint32(16,checksum(bytes));return bytes;
}
export function decodeNpcSnapshot(bytes: Uint8Array): Readonly<{ resolutionIndex: number; npcs: readonly PublicNpcSnapshot[] }> {
  if(!(bytes instanceof Uint8Array) || bytes.byteLength<HEADER || bytes.byteLength>NPC_SNAPSHOT_MAX_BYTES) invalid();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), count=view.getUint16(6), maximumIndex=view.getUint32(8);
  if(view.getUint32(0)!==MAGIC || view.getUint16(4)!==NPC_SNAPSHOT_VERSION || count>NPC_SNAPSHOT_MAX_COUNT || maximumIndex>2147483647 || view.getUint32(12)!==bytes.length-HEADER || view.getUint32(20)!==0 || HEADER+count*90>bytes.length || view.getUint32(16)!==checksum(bytes)) invalid();
  let offset=HEADER;
  const requireBytes=(count:number)=>{if(offset+count>bytes.length)invalid();};
  const readId=()=>{requireBytes(1);const size=view.getUint8(offset++);if(size<1||size>96)invalid();requireBytes(size);let id="";for(let i=0;i<size;i++)id+=String.fromCharCode(view.getUint8(offset++));if(!identity(id))invalid();return id;};
  const npcs: PublicNpcSnapshot[]=[]; let observedMaximum=0;
  for(let i=0;i<count;i++) {
    const npcId=readId(),regionId=readId();requireBytes(86);
    const resolutionIndex=view.getUint32(offset);offset+=4;
    const goal=npcSnapshotGoals[view.getUint8(offset++)],memoryCount=view.getUint8(offset++);
    const needs={} as Record<typeof npcSnapshotNeeds[number],number>;
    for(const key of npcSnapshotNeeds){needs[key]=view.getFloat64(offset);offset+=8;}
    let decisionHash="";for(let n=0;n<32;n++)decisionHash+=view.getUint8(offset++).toString(16).padStart(2,"0");
    const row={npcId,regionId,resolutionIndex,goal,needs:Object.freeze(needs),memoryCount,decisionHash};validRow(row);
    if(i && npcs[i-1].npcId>=npcId)invalid();
    observedMaximum=Math.max(observedMaximum,resolutionIndex);npcs.push(Object.freeze(row));
  }
  if(offset!==bytes.length || observedMaximum!==maximumIndex)invalid();
  return Object.freeze({resolutionIndex:maximumIndex,npcs:Object.freeze(npcs)});
}
export function decodeOwnedNpcPacket(input: unknown, userId: number) {
  if(!Number.isSafeInteger(userId)||userId<1)invalid();
  if(!input || typeof input!=="object" || !("userId" in input) || input.userId!==userId || !("format" in input) || input.format!=="aurion-public-npc.v2" || !("data" in input) || typeof input.data!=="string" || input.data.length>Math.ceil(NPC_SNAPSHOT_MAX_BYTES/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data)) invalid();
  const raw=atob(input.data);if(btoa(raw)!==input.data)invalid();
  return decodeNpcSnapshot(Uint8Array.from(raw,c=>c.charCodeAt(0)));
}
