/** Small renderable GLB for isolated tests; never a production game asset. */
export function testGlb(name = "Aurion_Spear_Weapon", extra: Record<string, unknown> = {}): Buffer {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const source = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: positions.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }], ...extra };
  const raw = Buffer.from(JSON.stringify(source));
  const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(json);
  const result = Buffer.alloc(12 + 8 + json.length + 8 + positions.length);
  result.write("glTF"); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(positions.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); positions.copy(result, 28 + json.length);
  return result;
}
