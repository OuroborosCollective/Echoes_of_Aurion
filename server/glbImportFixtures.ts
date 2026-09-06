/** Small renderable GLB for isolated tests; never a production game asset. */
export function testGlb(name = "Aurion_Spear_Weapon", extra: Record<string, unknown> = {}): Buffer {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const source = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: positions.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }], ...extra };
  return encodeGlb(source, positions);
}

/** Renderable player fixture with real Idle and Attack animation clips.
 * The mesh remains deliberately tiny; the animation contract is what matters.
 */
export function testAnimatedPlayerGlb(name = "Aurion_Player"): Buffer {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const times = Buffer.alloc(8);
  times.writeFloatLE(0, 0); times.writeFloatLE(1, 4);
  const idleTranslations = Buffer.alloc(24);
  const attackTranslations = Buffer.alloc(24);
  [0, 0, 0, 0.15, 0, 0].forEach((value, index) => attackTranslations.writeFloatLE(value, index * 4));
  const binary = Buffer.concat([positions, times, idleTranslations, attackTranslations]);
  const source = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ name, mesh: 0 }, { name: "root_joint" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    skins: [{ joints: [1], skeleton: 1 }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length },
      { buffer: 0, byteOffset: positions.length, byteLength: times.length },
      { buffer: 0, byteOffset: positions.length + times.length, byteLength: idleTranslations.length },
      { buffer: 0, byteOffset: positions.length + times.length + idleTranslations.length, byteLength: attackTranslations.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" },
    ],
    animations: [
      { name: "Idle", samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 1, path: "translation" } }] },
      { name: "Attack", samplers: [{ input: 1, output: 3, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 1, path: "translation" } }] },
    ],
  };
  return encodeGlb(source, binary);
}

function encodeGlb(source: Record<string, unknown>, binary: Buffer): Buffer {
  const raw = Buffer.from(JSON.stringify(source));
  const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(json);
  const paddedBinary = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(paddedBinary);
  const result = Buffer.alloc(12 + 8 + json.length + 8 + paddedBinary.length);
  result.write("glTF"); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(paddedBinary.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); paddedBinary.copy(result, 28 + json.length);
  return result;
}
