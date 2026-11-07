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

type PendingGlbJob = Readonly<{
  bytes: number;
  resolve: () => void;
  reject: (reason: Error) => void;
}>;

export class GlbResourcePool {
  private activeJobs=0; private pending:PendingGlbJob[]=[];
  private models=0; private decoded=0; private textures=0; private network=0;
  private actors=0; private animations=0; private staticInstances=0;
  private peakWorkingSet=0;
  private peakDecoded=0; private peakNetwork=0; private peakJobs=0;
  private fetchedBytes=0; private decodedCount=0; private decodeMs=0; private maximumDecodeMs=0;
  private rejected=0;
  private readonly holds=new Map<string,{decodedBytes:number;textureBytes:number}>();
  // Stable accounting profile for the loaded application. A resize must not
  // retroactively lower the ceiling underneath resources already reserved.
  constructor(readonly tier:AssetTier=assetTier(typeof window === "undefined" ? 412 : window.innerWidth)) {}
  get limits() {return assetBudgets[this.tier];}
  /** Reserve a decoder slot and its estimated network bytes atomically. */
  private canAdmitJob(bytes:number):boolean {
    return this.activeJobs<this.limits.decoderJobs &&
      this.network+bytes<=this.limits.networkBytes &&
      this.decoded+2*(this.network+bytes)<=this.limits.assetWorkingSetBytes;
  }
  private admitJob(bytes:number):void {
    this.activeJobs++;
    this.network+=bytes;
    this.peakJobs=Math.max(this.peakJobs,this.activeJobs);
    this.peakWorkingSet=Math.max(this.peakWorkingSet,this.decoded+2*this.network);
    this.peakNetwork=Math.max(this.peakNetwork,this.network);
  }
  /** FIFO backpressure: contention must not pretend a verified model failed.
   * Keep hard byte ceilings, reject permanently unschedulable work, and never
   * reserve more than the per-device concurrent network allowance. */
  private drainJobs():void {
    while(this.pending.length) {
      const next=this.pending[0]!;
      if(this.canAdmitJob(next.bytes)) {
        this.pending.shift();
        this.admitJob(next.bytes);
        next.resolve();
        continue;
      }
      // No running download can release capacity. Fail closed instead of
      // waiting forever on retained decoded models.
      if(this.activeJobs===0 && this.decoded+2*next.bytes>this.limits.assetWorkingSetBytes) {
        this.pending.shift();
        this.rejected++;
        next.reject(Error("GLB_NETWORK_BUDGET"));
        continue;
      }
      break;
    }
  }
  async job<T>(networkBytes:number, work:()=>Promise<T>):Promise<T> {
    integer(networkBytes);
    if(networkBytes>this.limits.assetBytes ||
       networkBytes>this.limits.networkBytes ||
       2*networkBytes>this.limits.assetWorkingSetBytes ||
       this.pending.length>=64) {
      this.rejected++;
      throw Error("GLB_NETWORK_BUDGET");
    }
    if(this.pending.length || !this.canAdmitJob(networkBytes)) {
      await new Promise<void>((resolve,reject)=>{
        this.pending.push({bytes:networkBytes,resolve,reject});
        this.drainJobs();
      });
    } else this.admitJob(networkBytes);
    try {return await work();}
    finally {
      this.network-=networkBytes;
      this.activeJobs--;
      this.drainJobs();
    }
  }
  /**
   * Keep decoded/texture capacity free for one owner-designated visual (key).
   * Admission is otherwise first come, first served: without a hold, many small
   * models that finish downloading first permanently occupy the budget and a
   * large priority model (the pinned city wall on phones) can never be admitted.
   * Only `reserve(..., key)` may consume a hold; it changes no byte ceiling.
   */
  holdHeadroom(key:string, allocation:Pick<GlbAllocation,"decodedBytes"|"textureBytes">):()=>void {
    integer(allocation.decodedBytes);integer(allocation.textureBytes);
    if(!key||this.holds.has(key))throw Error("GLB_HEADROOM_HOLD_DUPLICATE");
    const hold={decodedBytes:allocation.decodedBytes,textureBytes:allocation.textureBytes};
    this.holds.set(key,hold);
    let released=false;return()=>{if(released)return;released=true;if(this.holds.get(key)===hold)this.holds.delete(key);this.drainJobs();};
  }
  private heldExcept(key:string|undefined) {
    let decodedBytes=0,textureBytes=0;
    for(const [holder,hold] of this.holds) if(holder!==key){decodedBytes+=hold.decodedBytes;textureBytes+=hold.textureBytes;}
    return {decodedBytes,textureBytes};
  }
  reserve(allocation:GlbAllocation, headroomKey?:string):(()=>void)|null {
    integer(allocation.decodedBytes);integer(allocation.textureBytes);
    const l=this.limits;
    const other=this.heldExcept(headroomKey), own=headroomKey?this.holds.get(headroomKey):undefined;
    // The owner's remaining hold stays counted; this reservation is drawn from it first.
    const decodedNeed=Math.max(allocation.decodedBytes,own?.decodedBytes??0), textureNeed=Math.max(allocation.textureBytes,own?.textureBytes??0);
    if(this.models>=l.cacheModels||this.decoded+other.decodedBytes+decodedNeed>l.decodedBytes||this.textures+other.textureBytes+textureNeed>l.textureBytes||this.decoded+other.decodedBytes+decodedNeed+2*this.network>l.assetWorkingSetBytes){this.rejected++;return null;}
    if(own){own.decodedBytes=Math.max(0,own.decodedBytes-allocation.decodedBytes);own.textureBytes=Math.max(0,own.textureBytes-allocation.textureBytes);}
    this.models++;this.decoded+=allocation.decodedBytes;this.textures+=allocation.textureBytes;this.peakDecoded=Math.max(this.peakDecoded,this.decoded);this.peakWorkingSet=Math.max(this.peakWorkingSet,this.decoded+2*this.network);
    let released=false;return()=>{if(released)return;released=true;this.models--;this.decoded-=allocation.decodedBytes;this.textures-=allocation.textureBytes;this.drainJobs();};
  }
  actor(animationActions:number):(()=>void)|null {
    integer(animationActions, 2);
    if(this.actors>=this.limits.actors||this.animations+animationActions>this.limits.animations){this.rejected++;return null;}
    this.actors++;this.animations+=animationActions;let released=false;
    return()=>{if(released)return;released=true;this.actors--;this.animations-=animationActions;};
  }
  /** Static scenery/attachments have their own instance ceiling. They do not
   * consume character or animation slots merely because they use the GLB loader. */
  staticInstance(): (() => void) | null {
    if (this.staticInstances >= this.limits.worldInstances) { this.rejected++; return null; }
    this.staticInstances++;
    let released = false;
    return () => { if (released) return; released = true; this.staticInstances--; };
  }
  /** Animation admission may defer motion while the already admitted model
   * stays visible. It is not a failed asset load and changes no memory limit. */
  animationActions(count: number): (() => void) | null {
    integer(count, 2);
    if (this.animations + count > this.limits.animations) return null;
    this.animations += count;
    let released = false;
    return () => { if (released) return; released = true; this.animations -= count; };
  }
  fetched(bytes:number){this.fetchedBytes+=integer(bytes);}
  decodedModel(milliseconds:number){this.decodedCount++;this.decodeMs+=milliseconds;this.maximumDecodeMs=Math.max(this.maximumDecodeMs,milliseconds);}
  evidence(){return{tier:this.tier,limits:this.limits,models:this.models,actors:this.actors,staticInstances:this.staticInstances,animations:this.animations,decoderJobs:this.activeJobs,pending:this.pending.length,
    assetWorkingSetCeilingBytes:this.decoded+2*this.network,peakAssetWorkingSetCeilingBytes:this.peakWorkingSet,
    reservedDecodedBytes:this.decoded,reservedTextureBytes:this.textures,heldHeadroom:Object.fromEntries([...this.holds].map(([key,hold])=>[key,{...hold}])),networkInFlightBytes:this.network,peakReservedDecodedBytes:this.peakDecoded,peakNetworkInFlightBytes:this.peakNetwork,
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
