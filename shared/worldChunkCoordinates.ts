/** The canonical Aurion chunk spans 64 m, centered on coordinate × 64 m. */
export const WORLD_CHUNK_SIZE_MM = 64_000 as const;
export const WORLD_CHUNK_COORDINATE_LIMIT = 1_000_000 as const;

/** Inverse of splitWorldChunkPositionMm; rejects invalid/unbounded inputs. */
export function joinWorldChunkPositionMm(input: {
  coordinate: { x: number; z: number };
  localPositionMm: { x: number; z: number };
}): { x: number; z: number } {
  const axis = (chunk: number, local: number) => {
    if (!Number.isSafeInteger(chunk) || Math.abs(chunk) > WORLD_CHUNK_COORDINATE_LIMIT) {
      throw new Error("world chunk coordinate out of bounds");
    }
    if (!Number.isSafeInteger(local) || local < 0 || local >= WORLD_CHUNK_SIZE_MM) {
      throw new Error("local chunk position out of bounds");
    }
    return chunk * WORLD_CHUNK_SIZE_MM + local - WORLD_CHUNK_SIZE_MM / 2;
  };
  return {
    x: axis(input.coordinate.x, input.localPositionMm.x),
    z: axis(input.coordinate.z, input.localPositionMm.z),
  };
}
