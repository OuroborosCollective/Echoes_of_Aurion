/** Shared presentation-only GLB budgets.
 * This contract is consumed by both server-side admission and the renderer.
 * It never grants gameplay, simulation, inventory, collision or world authority. */
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

/** Bound decoded allocation before authenticated bytes reach Meshopt/Basis/Three.js. */
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
