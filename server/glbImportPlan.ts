import { createHash } from "node:crypto";
import { decodeValidatedGlbBase64 } from "./adminProtocol";
import { classifyGlbBase64, type GlbAssetClassification } from "./glbAssetClassifier";
import { GLB_IMPORT_VERSION } from "../shared/glbImportContract";

type Json = Record<string, any>;
function integer(value: unknown, fallback = -1): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback; }
function offset(value: unknown, fallback = 0): number {
  if (value === undefined) return fallback;
  const n = integer(value); if (n < 0) throw new Error("GLB_BUFFER_BOUNDS"); return n;
}
function index(value: unknown, entries: unknown[], code: string) {
  const n = integer(value); if (n < 0 || n >= entries.length) throw new Error(code); return n;
}

/** Uploads are self-contained render data, never external fetch instructions. */
export function validateImportGeometry(bytes: Buffer): void {
  if (bytes.length < 28 || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error("GLB_JSON_FIRST_REQUIRED");
  const jsonLength = bytes.readUInt32LE(12);
  if (jsonLength % 4 || jsonLength < 2 || 20 + jsonLength + 8 > bytes.length) throw new Error("GLB_CHUNK_INVALID");
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  if (binaryLength % 4 || bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942 || binaryHeader + 8 + binaryLength !== bytes.length) throw new Error("GLB_BINARY_CHUNK_INVALID");
  const json = JSON.parse(bytes.subarray(20, binaryHeader).toString("utf8").trim()) as Json;
  if (json.asset?.version !== "2.0") throw new Error("GLB_VERSION_UNSUPPORTED");
  const pending: unknown[] = [json]; let visited = 0;
  while (pending.length) {
    if (++visited > 250_000) throw new Error("GLB_COMPLEXITY_LIMIT");
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri") throw new Error("GLB_EXTERNAL_RESOURCE");
      if (child && typeof child === "object") pending.push(child);
    }
  }
  const required = json.extensionsRequired ?? [];
  const supported = new Set(["KHR_materials_unlit", "KHR_materials_clearcoat", "KHR_materials_transmission", "KHR_materials_ior", "KHR_materials_specular", "KHR_texture_transform", "KHR_mesh_quantization"]);
  if (!Array.isArray(required) || required.some((name: unknown) => typeof name !== "string" || !supported.has(name))) throw new Error("GLB_REQUIRED_EXTENSION_UNSUPPORTED");
  const buffers: Json[] = json.buffers ?? [];
  const views: Json[] = json.bufferViews ?? [];
  const accessors: Json[] = json.accessors ?? [];
  const meshes: Json[] = json.meshes ?? [];
  const nodes: Json[] = json.nodes ?? [];
  const scenes: Json[] = json.scenes ?? [];
  for (const list of [buffers, views, accessors, meshes, nodes, scenes]) if (!Array.isArray(list) || list.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry))) throw new Error("GLB_STRUCTURE_INVALID");
  if (buffers.length !== 1 || !meshes.length || !nodes.length || !scenes.length || nodes.length > 4096 || meshes.length > 512 || accessors.length > 8192 || views.length > 8192) throw new Error("GLB_COMPLEXITY_LIMIT");
  const declared = integer(buffers[0]!.byteLength);
  if (declared < 1 || declared > binaryLength || binaryLength - declared > 3) throw new Error("GLB_BUFFER_BOUNDS");
  for (const view of views) if (view.buffer !== 0 || offset(view.byteOffset) + integer(view.byteLength, declared + 1) > declared || offset(view.byteOffset) < 0 || integer(view.byteLength) < 1) throw new Error("GLB_BUFFER_BOUNDS");
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const widths: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  for (const accessor of accessors) {
    if (accessor.sparse) throw new Error("GLB_SPARSE_ACCESSOR_UNSUPPORTED");
    const view = views[index(accessor.bufferView, views, "GLB_ACCESSOR_BOUNDS")]!;
    const elementSize = (sizes[accessor.componentType] ?? 0) * (widths[accessor.type] ?? 0);
    const count = integer(accessor.count);
    const stride = offset(view.byteStride, elementSize);
    if (!elementSize || count < 1 || count > 1_000_000 || stride < elementSize || stride > 252 || offset(accessor.byteOffset) + (count - 1) * stride + elementSize > view.byteLength) throw new Error("GLB_ACCESSOR_BOUNDS");
  }
  let vertexBudget = 0;
  for (const mesh of meshes) {
    if (!Array.isArray(mesh.primitives) || !mesh.primitives.length || mesh.primitives.length > 256) throw new Error("GLB_MESH_INVALID");
    for (const primitive of mesh.primitives) {
      if (!primitive?.attributes || typeof primitive.attributes !== "object") throw new Error("GLB_MESH_INVALID");
      const position = accessors[index(primitive.attributes.POSITION, accessors, "GLB_POSITION_REQUIRED")]!;
      vertexBudget += position.count;
      if (vertexBudget > 2_000_000) throw new Error("GLB_COMPLEXITY_LIMIT");
      if (position.type !== "VEC3") throw new Error("GLB_POSITION_REQUIRED");
      for (const value of Object.values(primitive.attributes)) index(value, accessors, "GLB_ATTRIBUTE_INVALID");
      if (primitive.indices !== undefined) index(primitive.indices, accessors, "GLB_INDICES_INVALID");
    }
  }
  const parents = new Set<number>();
  const skins: Json[] = json.skins ?? [];
  if (!Array.isArray(skins) || skins.length > 256) throw new Error("GLB_SKIN_INVALID");
  for (const skin of skins) {
    if (!Array.isArray(skin?.joints) || !skin.joints.length || skin.joints.length > 256) throw new Error("GLB_SKIN_INVALID");
    for (const joint of skin.joints) index(joint, nodes, "GLB_SKIN_INVALID");
    if (skin.skeleton !== undefined) index(skin.skeleton, nodes, "GLB_SKIN_INVALID");
    if (skin.inverseBindMatrices !== undefined) {
      const accessor = accessors[index(skin.inverseBindMatrices, accessors, "GLB_SKIN_INVALID")]!;
      if (accessor.type !== "MAT4" || accessor.componentType !== 5126 || accessor.count < skin.joints.length) throw new Error("GLB_SKIN_INVALID");
    }
  }
  for (const node of nodes) {
    if (node.skin !== undefined) index(node.skin, skins, "GLB_SKIN_INVALID");
    for (const [key, length] of [["translation", 3], ["rotation", 4], ["scale", 3], ["matrix", 16]] as const) {
      if (node[key] !== undefined && (!Array.isArray(node[key]) || node[key].length !== length || node[key].some((n: unknown) => typeof n !== "number" || !Number.isFinite(n)))) throw new Error("GLB_TRANSFORM_INVALID");
    }
    for (const child of node.children ?? []) {
      const n = index(child, nodes, "GLB_NODE_INVALID");
      if (parents.has(n)) throw new Error("GLB_NODE_MULTIPLE_PARENTS");
      parents.add(n);
    }
  }
  const colors = new Uint8Array(nodes.length);
  function visit(n: number, depth: number): void {
    if (depth > 128 || colors[n] === 1) throw new Error("GLB_SCENE_CYCLE");
    if (colors[n] === 2) return;
    colors[n] = 1;
    const node = nodes[n]!;
    if (node.mesh !== undefined) index(node.mesh, meshes, "GLB_NODE_MESH_INVALID");
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error("GLB_NODE_INVALID");
    for (const child of node.children ?? []) visit(index(child, nodes, "GLB_NODE_INVALID"), depth + 1);
    colors[n] = 2;
  }
  nodes.forEach((_, n) => visit(n, 0));
  for (const scene of scenes) {
    if (!Array.isArray(scene.nodes) || !scene.nodes.length) throw new Error("GLB_SCENE_INVALID");
    for (const node of scene.nodes) index(node, nodes, "GLB_SCENE_INVALID");
  }
  if (json.scene !== undefined) index(json.scene, scenes, "GLB_SCENE_INVALID");
  for (const image of json.images ?? []) { if (image.mimeType !== "image/png" && image.mimeType !== "image/jpeg") throw new Error("GLB_IMAGE_TYPE_UNSUPPORTED"); index(image.bufferView, views, "GLB_IMAGE_INVALID"); }
}

export function automaticGlbTarget(classification: GlbAssetClassification): string | null {
  if (classification.assetType === "character") return "starter_player";
  if (classification.assetType === "enemy") {
    if (classification.subcategory === "spider") return "starter_spider";
    if (classification.lod !== null && classification.lod >= 0 && classification.lod <= 3) return `starter_beast_lod${classification.lod}`;
    return classification.lod === null ? "starter_beast_lod0" : null;
  }
  if (classification.assetType === "arena") return "asterion_courtyard";
  const names = classification.nodeNames.join(" ").toLowerCase();
  const rules = classification.assetType === "weapon"
    ? { blade: /sword|blade|dagger|axe/, spear: /spear|lance|polearm/, staff: /staff|wand/, focus: /focus|orb|tome/, marksmanship: /bow|rifle|pistol/, heavy_tech: /cannon|hammer/ }
    : { head: /helm|hat/, chest: /chest|cuirass/, arms: /gauntlet|bracer|glove/, legs: /leg|greave/, boots: /boot|shoe/, shoulders: /shoulder|pauldron/ };
  const matches = Object.entries(rules).filter(([, expression]) => expression.test(names));
  return matches.length === 1 ? `${classification.assetType}_${matches[0]![0]}` : null;
}

export function buildGlbImportPlan(contentBase64: string) {
  const payload = decodeValidatedGlbBase64(contentBase64);
  validateImportGeometry(payload.bytes);
  const classification = classifyGlbBase64(contentBase64);
  const targetKey = automaticGlbTarget(classification);
  const identity = { version: GLB_IMPORT_VERSION, sha256: payload.sha256, bytes: payload.bytes.length, assetType: classification.assetType, subcategory: classification.subcategory, targetKey };
  return { ...identity, classification, assetId: `glb_${payload.sha256.slice(0, 48)}`, planSha256: createHash("sha256").update(JSON.stringify(identity)).digest("hex") };
}
