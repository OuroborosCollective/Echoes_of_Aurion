export type WorldGlbAudit = Readonly<{
  vertices: ReadonlyArray<readonly [number, number, number]> | undefined;
  textureHashes: readonly string[];
  triangles: number;
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  lights: number;
}>;

export function audit(
  bytes: Buffer,
  ceiling: number,
  options?: Readonly<{ requireMeshopt?: boolean; includeVertices?: boolean; maxMeasuredVertices?: number }>,
): Promise<WorldGlbAudit>;
