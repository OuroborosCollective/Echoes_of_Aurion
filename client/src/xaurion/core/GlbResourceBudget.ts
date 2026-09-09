/** Presentation allocations only. No receipt, entity or simulation input enters this pool. */
export const assetBudgets = {
  phone: { worldModels: 18, worldInstances: 48, worldCache: 24, actors: 12, animations: 8, decoderJobs: 2, ktxWorkers: 1, cacheModels: 40, textureBytes: 48*1024*1024, decodedBytes: 64*1024*1024, assetWorkingSetBytes: 96*1024*1024, assetBytes: 8*1024*1024, networkBytes: 16*1024*1024 },
  tablet: { worldModels: 24, worldInstances: 64, worldCache: 32, actors: 20, animations: 12, decoderJobs: 2, ktxWorkers: 1, cacheModels: 56, textureBytes: 96*1024*1024, decodedBytes: 128*1024*1024, assetWorkingSetBytes: 192*1024*1024, assetBytes: 12*1024*1024, networkBytes: 24*1024*1024 },
  desktop: { worldModels: 30, worldInstances: 84, worldCache: 40, actors: 32, animations: 20, decoderJobs: 2, ktxWorkers: 2, cacheModels: 80, textureBytes: 192*1024*1024, decodedBytes: 256*1024*1024, assetWorkingSetBytes: 384*1024*1024, assetBytes: 16*1024*1024, networkBytes: 32*1024*1024 },
} as const;
export type AssetTier = keyof typeof assetBudgets;
export const assetTier = (width: number): AssetTier => width < 768 ? "phone" : width < 1200 ? "tablet" : "desktop";
export type GlbAllocation = { decodedBytes: number; textureBytes: number; animations: number };
const integer = (value: number, maximum = 1_073_741_824) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw Error("GLB_RESOURCE_BOUNDS");
  return value;
};

/** Bound decoded allocation before handing authenticated bytes to Meshopt/Basis. */
export function inspectGlbAllocation(bytes: ArrayBuffer): { json: any; allocation: GlbAllocation } {
  const view = new DataView(bytes);
  if (bytes.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw Error("GLB_HEADER");
  const length = view.getUint32(12, true), start = 28+length;
  if (length % 4 || start > bytes.byteLength || view.getUint32(24+length, true) !== 0x004e4942 || view.getUint32(20+length, true) !== bytes.byteLength-start) throw Error("GLB_BIN");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)));
  if (json.asset?.version !== "2.0" || json.buffers?.some((b: any) => b.uri)) throw Error("GLB_EMBEDDED_V2_REQUIRED");
  const images = new Set<number>(); let textureBytes = 0;
  for (const image of json.images ?? []) {
    if (image.uri || !Number.isSafeInteger(image.bufferView)) throw Error("GLB_EMBEDDED_IMAGE_REQUIRED");
    const v = json.bufferViews?.[image.bufferView];
    if (!v) throw Error("GLB_IMAGE_VIEW");
    const offset = start + integer(v.byteOffset ?? 0), size = integer(v.byteLength);
    if (offset + size > bytes.byteLength || size < 28) throw Error("GLB_IMAGE_BOUNDS");
    images.add(image.bufferView);
    const b = new DataView(bytes, offset, size), u = new Uint8Array(bytes, offset, size);
    let width = 0, height = 0;
    if (image.mimeType === "image/ktx2" && b.getUint32(0, true) === 0x58544bab) { width=b.getUint32(20,true); height=b.getUint32(24,true); }
    else if (image.mimeType === "image/png" && b.getUint32(0, false) === 0x89504e47) { width=b.getUint32(16,false); height=b.getUint32(20,false); }
    else if (image.mimeType === "image/webp" && b.getUint32(0, true) === 0x46464952 && b.getUint32(8, true) === 0x50424557) {
      for (let i=12; i+8 <= size;) {
        const kind=b.getUint32(i,true), chunk=integer(b.getUint32(i+4,true));
        if (i+8+chunk > size) throw Error("GLB_WEBP_BOUNDS");
        const p=i+8;
        if (kind===0x58385056 && chunk>=10) { width=1+u[p+4]+(u[p+5]<<8)+(u[p+6]<<16); height=1+u[p+7]+(u[p+8]<<8)+(u[p+9]<<16); break; }
        if (kind===0x4c385056 && chunk>=5 && u[p]===0x2f) { const bits=b.getUint32(p+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;break; }
        if (kind===0x20385056 && chunk>=10 && u[p+3]===0x9d && u[p+4]===1 && u[p+5]===0x2a) {width=b.getUint16(p+6,true)&0x3fff;height=b.getUint16(p+8,true)&0x3fff;break;}
        i+=8+chunk+chunk%2;
      }
    } else if (image.mimeType === "image/jpeg" && b.getUint16(0,false)===0xffd8) {
      for(let i=2;i+4<size;) {const marker=u[i+1],length=b.getUint16(i+2,false);if(u[i]!==255||length<2||i+2+length>size)throw Error("GLB_JPEG_BOUNDS");if([0xc0,0xc1,0xc2].includes(marker)){height=b.getUint16(i+5,false);width=b.getUint16(i+7,false);break;}i+=2+length;}
    }
    if (!width || !height || width>4096 || height>4096) throw Error("GLB_TEXTURE_DIMENSIONS");
    for(let w=width,h=height;;w=Math.max(1,Math.floor(w/2)),h=Math.max(1,Math.floor(h/2))) {textureBytes+=w*h*4;if(w===1&&h===1)break;}
  }
  // Sparse accessors may allocate their declared count without a full buffer
  // view. Count the expanded attribute arrays before the loader sees them.
  const components:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  const accessorBytes=(json.accessors??[]).reduce((sum:number,a:any)=>{
    if(!components[a.type]||![5120,5121,5122,5123,5125,5126].includes(a.componentType))throw Error("GLB_ACCESSOR_TYPE");
    return integer(sum+integer(a.count)*components[a.type]!*4);
  },0);
  integer(json.nodes?.length??0,4096);
  for(const skin of json.skins??[])integer(skin.joints?.length??0,256);
  const geometryBytes = (json.bufferViews ?? []).reduce((sum:number, v:any, i:number) => sum + (images.has(i)?0:integer(v.byteLength)), 0);
  return {json, allocation:{decodedBytes:integer(geometryBytes*2+accessorBytes+textureBytes),textureBytes:integer(textureBytes),animations:integer(json.animations?.length??0,64)}};
}

export class GlbResourcePool {
  private activeJobs=0; private pending:Array<()=>void>=[];
  private models=0; private decoded=0; private textures=0; private network=0;
  private actors=0; private animations=0;
  private peakWorkingSet=0;
  private peakDecoded=0; private peakNetwork=0; private peakJobs=0;
  private fetchedBytes=0; private decodedCount=0; private decodeMs=0; private maximumDecodeMs=0;
  private rejected=0;
  // Stable accounting profile for the loaded application. A resize must not
  // retroactively lower the ceiling underneath resources already reserved.
  constructor(readonly tier:AssetTier=assetTier(typeof window === "undefined" ? 412 : window.innerWidth)) {}
  get limits() {return assetBudgets[this.tier];}
  async job<T>(networkBytes:number, work:()=>Promise<T>):Promise<T> {
    integer(networkBytes);
    if (networkBytes>this.limits.assetBytes || this.pending.length>=64) {this.rejected++;throw Error("GLB_NETWORK_BUDGET");}
    if(this.activeJobs>=this.limits.decoderJobs) await new Promise<void>(resolve=>this.pending.push(resolve));
    else this.activeJobs++;
    const releaseJob=()=>{const next=this.pending.shift();if(next)next();else this.activeJobs--;};
    this.peakJobs=Math.max(this.peakJobs,this.activeJobs);
    if(this.network+networkBytes>this.limits.networkBytes||this.decoded+2*(this.network+networkBytes)>this.limits.assetWorkingSetBytes) {releaseJob();this.rejected++;throw Error("GLB_NETWORK_BUDGET");}
    this.network+=networkBytes;this.peakWorkingSet=Math.max(this.peakWorkingSet,this.decoded+2*this.network);this.peakNetwork=Math.max(this.peakNetwork,this.network);
    try{return await work();}finally{this.network-=networkBytes;releaseJob();}
  }
  reserve(allocation:GlbAllocation):(()=>void)|null {
    integer(allocation.decodedBytes);integer(allocation.textureBytes);
    const l=this.limits;
    if(this.models>=l.cacheModels||this.decoded+allocation.decodedBytes>l.decodedBytes||this.textures+allocation.textureBytes>l.textureBytes||this.decoded+allocation.decodedBytes+2*this.network>l.assetWorkingSetBytes){this.rejected++;return null;}
    this.models++;this.decoded+=allocation.decodedBytes;this.textures+=allocation.textureBytes;this.peakDecoded=Math.max(this.peakDecoded,this.decoded);this.peakWorkingSet=Math.max(this.peakWorkingSet,this.decoded+2*this.network);
    let released=false;return()=>{if(released)return;released=true;this.models--;this.decoded-=allocation.decodedBytes;this.textures-=allocation.textureBytes;};
  }
  actor(animationActions:number):(()=>void)|null {
    integer(animationActions, 2);
    if(this.actors>=this.limits.actors||this.animations+animationActions>this.limits.animations){this.rejected++;return null;}
    this.actors++;this.animations+=animationActions;let released=false;
    return()=>{if(released)return;released=true;this.actors--;this.animations-=animationActions;};
  }
  fetched(bytes:number){this.fetchedBytes+=integer(bytes);}
  decodedModel(milliseconds:number){this.decodedCount++;this.decodeMs+=milliseconds;this.maximumDecodeMs=Math.max(this.maximumDecodeMs,milliseconds);}
  evidence(){return{tier:this.tier,limits:this.limits,models:this.models,actors:this.actors,animations:this.animations,decoderJobs:this.activeJobs,pending:this.pending.length,
    assetWorkingSetCeilingBytes:this.decoded+2*this.network,peakAssetWorkingSetCeilingBytes:this.peakWorkingSet,
    reservedDecodedBytes:this.decoded,reservedTextureBytes:this.textures,networkInFlightBytes:this.network,peakReservedDecodedBytes:this.peakDecoded,peakNetworkInFlightBytes:this.peakNetwork,
    peakDecoderJobs:this.peakJobs,fetchedBytes:this.fetchedBytes,decodedCount:this.decodedCount,totalDecodeMs:this.decodeMs,maxDecodeMs:this.maximumDecodeMs,rejected:this.rejected};}
}
export const glbResourcePool = new GlbResourcePool();

export async function fetchVerifiedGlb(spec:{url:string;bytes?:number;sha256:string},signal:AbortSignal):Promise<ArrayBuffer> {
  const limit=spec.bytes??glbResourcePool.limits.assetBytes;
  const response=await fetch(spec.url,{signal,credentials:"same-origin"});
  if(!response.ok||!response.body)throw Error("GLB_HTTP");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;glbResourcePool.fetched(value.byteLength);if(length>limit)throw Error("GLB_LENGTH");chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  if(spec.bytes!==undefined&&length!==spec.bytes)throw Error("GLB_LENGTH");
  const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  const digest=await crypto.subtle.digest("SHA-256",data);
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  if(hex!==spec.sha256)throw Error("GLB_HASH");
  return data.buffer;
}
