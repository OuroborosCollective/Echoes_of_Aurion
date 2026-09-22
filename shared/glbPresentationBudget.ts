export type AssetTier = "mobile" | "tablet" | "desktop" | "ultra";

export interface GlbAllocation {
  decodedBytes: number;
  textureBytes: number;
  animations?: number;
}

export interface GlbTierBudget {
  assetBytes: number;
  networkBytes: number;
  assetWorkingSetBytes: number;
  cacheModels: number;
  decodedBytes: number;
  textureBytes: number;
  actors: number;
  animations: number;
  decoderJobs: number;
  worldModels: number;
  ktxWorkers: number;
  worldInstances: number;
  worldCache: number;
}

export const assetBudgets: Record<AssetTier, GlbTierBudget> = {
  mobile: {
    assetBytes: 15 * 1024 * 1024,
    networkBytes: 30 * 1024 * 1024,
    assetWorkingSetBytes: 120 * 1024 * 1024,
    cacheModels: 32,
    decodedBytes: 60 * 1024 * 1024,
    textureBytes: 80 * 1024 * 1024,
    actors: 16,
    animations: 32,
    decoderJobs: 2,
    worldModels: 24,
    ktxWorkers: 2,
    worldInstances: 64,
    worldCache: 16,
  },
  tablet: {
    assetBytes: 25 * 1024 * 1024,
    networkBytes: 50 * 1024 * 1024,
    assetWorkingSetBytes: 200 * 1024 * 1024,
    cacheModels: 64,
    decodedBytes: 100 * 1024 * 1024,
    textureBytes: 128 * 1024 * 1024,
    actors: 32,
    animations: 64,
    decoderJobs: 4,
    worldModels: 48,
    ktxWorkers: 4,
    worldInstances: 128,
    worldCache: 32,
  },
  desktop: {
    assetBytes: 50 * 1024 * 1024,
    networkBytes: 100 * 1024 * 1024,
    assetWorkingSetBytes: 400 * 1024 * 1024,
    cacheModels: 128,
    decodedBytes: 200 * 1024 * 1024,
    textureBytes: 256 * 1024 * 1024,
    actors: 64,
    animations: 128,
    decoderJobs: 8,
    worldModels: 96,
    ktxWorkers: 4,
    worldInstances: 256,
    worldCache: 64,
  },
  ultra: {
    assetBytes: 100 * 1024 * 1024,
    networkBytes: 200 * 1024 * 1024,
    assetWorkingSetBytes: 800 * 1024 * 1024,
    cacheModels: 256,
    decodedBytes: 400 * 1024 * 1024,
    textureBytes: 512 * 1024 * 1024,
    actors: 128,
    animations: 256,
    decoderJobs: 12,
    worldModels: 160,
    ktxWorkers: 6,
    worldInstances: 512,
    worldCache: 128,
  },
};

export function assetTier(viewportWidth: number): AssetTier {
  if (viewportWidth < 640) return "mobile";
  if (viewportWidth < 1024) return "tablet";
  if (viewportWidth < 1600) return "desktop";
  return "ultra";
}

export interface GlbInspectionResult {
  allocation: GlbAllocation;
  json: any;
  decodedBytes: number;
  textureBytes: number;
  animations?: number;
}

export function inspectGlbAllocation(input: ArrayBuffer | number): GlbInspectionResult {
  if (typeof input === "number") {
    const safe = Math.max(0, Math.trunc(input));
    const alloc: GlbAllocation = {
      decodedBytes: safe * 2,
      textureBytes: Math.trunc(safe * 1.5),
      animations: 0,
    };
    return {
      allocation: alloc,
      json: {},
      decodedBytes: alloc.decodedBytes,
      textureBytes: alloc.textureBytes,
      animations: 0,
    };
  }

  const bytes = input;
  if (bytes.byteLength < 20) {
    throw new Error("GLB_HEADER_INVALID");
  }
  const view = new DataView(bytes);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error("GLB_MAGIC_INVALID");
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    throw new Error("GLB_VERSION_INVALID");
  }
  const totalLength = view.getUint32(8, true);
  if (totalLength > bytes.byteLength) {
    throw new Error("GLB_LENGTH_INVALID");
  }

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("GLB_JSON_CHUNK_INVALID");
  }
  if (20 + jsonChunkLength > bytes.byteLength) {
    throw new Error("GLB_JSON_BOUNDS");
  }

  const jsonBytes = new Uint8Array(bytes, 20, jsonChunkLength);
  const jsonText = new TextDecoder().decode(jsonBytes);
  const json = JSON.parse(jsonText);

  if (Array.isArray(json.images)) {
    for (const img of json.images) {
      if (img && typeof img.uri === "string") {
        throw new Error("GLB_EMBEDDED_IMAGE_REQUIRED");
      }
    }
  }

  let totalDecoded = 0;
  if (Array.isArray(json.accessors)) {
    for (const acc of json.accessors) {
      if (!acc) continue;
      const count = acc.count;
      if (typeof count !== "number" || count < 0 || count > 10_000_000) {
        throw new Error("GLB_RESOURCE_BOUNDS");
      }
      let components = 1;
      switch (acc.type) {
        case "VEC2": components = 2; break;
        case "VEC3": components = 3; break;
        case "VEC4": components = 4; break;
        case "MAT2": components = 4; break;
        case "MAT3": components = 9; break;
        case "MAT4": components = 16; break;
      }
      let componentSize = 4;
      switch (acc.componentType) {
        case 5120: case 5121: componentSize = 1; break;
        case 5122: case 5123: componentSize = 2; break;
        case 5125: case 5126: componentSize = 4; break;
      }
      const byteSize = count * components * componentSize;
      if (byteSize > 200_000_000) {
        throw new Error("GLB_RESOURCE_BOUNDS");
      }
      totalDecoded += byteSize;
    }
  }

  let totalTextures = 0;
  if (Array.isArray(json.images)) {
    for (const img of json.images) {
      if (img && typeof img.bufferView === "number" && Array.isArray(json.bufferViews) && json.bufferViews[img.bufferView]) {
        totalTextures += (json.bufferViews[img.bufferView].byteLength ?? 0) * 4;
      } else {
        totalTextures += 1024 * 1024;
      }
    }
  }

  const animationCount = Array.isArray(json.animations) ? json.animations.length : 0;
  const decodedBytes = Math.max(bytes.byteLength, totalDecoded);
  const textureBytes = Math.max(0, totalTextures);

  const allocation: GlbAllocation = {
    decodedBytes,
    textureBytes,
    animations: animationCount,
  };

  return {
    allocation,
    json,
    decodedBytes,
    textureBytes,
    animations: animationCount,
  };
}
