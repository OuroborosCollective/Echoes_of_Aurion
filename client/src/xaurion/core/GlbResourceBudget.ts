import {
  assetBudgets,
  assetTier,
  inspectGlbAllocation,
  type AssetTier,
  type GlbAllocation,
} from "@shared/glbPresentationBudget";

export { assetBudgets, assetTier, inspectGlbAllocation };
export type { AssetTier, GlbAllocation };

const integer = (value: number, maximum = 1_073_741_824) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw Error("GLB_RESOURCE_BOUNDS");
  return value;
};

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
