#!/usr/bin/env node
import { constants } from 'node:fs';
import { mkdir, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
export const NPC_FALLBACK_ANIMATIONS = Object.freeze(['Attack 2', 'Cast Spell', 'Death', 'Fight', 'Idle', 'Run', 'Walk']);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function integer(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}
function align4(value) { return (value + 3) & ~3; }

export function parseGlbBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 28 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB_HEADER_INVALID');
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length || length % 4) throw new Error('GLB_CHUNK_INVALID');
    if (type === JSON_CHUNK && json === null) json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/[\u0000\u0020]+$/g, ''));
    else if (type === BIN_CHUNK && binary === null) binary = bytes.subarray(start, end);
    offset = end;
  }
  if (!json || !binary || offset !== bytes.length || json.asset?.version !== '2.0') throw new Error('GLB_STRUCTURE_INVALID');
  return { json, binary };
}

function collectAccessorReferences(json, animations) {
  const accessors = new Set();
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    for (const value of Object.values(primitive.attributes ?? {})) accessors.add(integer(value, 'GLB_ACCESSOR_REFERENCE_INVALID'));
    if (primitive.indices !== undefined) accessors.add(integer(primitive.indices, 'GLB_ACCESSOR_REFERENCE_INVALID'));
    for (const target of primitive.targets ?? []) for (const value of Object.values(target)) accessors.add(integer(value, 'GLB_ACCESSOR_REFERENCE_INVALID'));
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) accessors.add(integer(skin.inverseBindMatrices, 'GLB_ACCESSOR_REFERENCE_INVALID'));
  for (const animation of animations) for (const sampler of animation.samplers ?? []) {
    accessors.add(integer(sampler.input, 'GLB_ACCESSOR_REFERENCE_INVALID'));
    accessors.add(integer(sampler.output, 'GLB_ACCESSOR_REFERENCE_INVALID'));
  }
  return accessors;
}

function rewriteAccessorReferences(json, animations, accessorMap) {
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes ?? {}).map(([key, value]) => [key, accessorMap.get(value)]));
    if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices);
    if (primitive.targets) primitive.targets = primitive.targets.map(target => Object.fromEntries(Object.entries(target).map(([key, value]) => [key, accessorMap.get(value)])));
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorMap.get(skin.inverseBindMatrices);
  for (const animation of animations) for (const sampler of animation.samplers ?? []) {
    sampler.input = accessorMap.get(sampler.input);
    sampler.output = accessorMap.get(sampler.output);
  }
}

/**
 * Lossless for the supplied Quaternius bundle: keeps meshes, skins, materials,
 * images and exactly the seven canonical animation clips, then compacts only
 * accessors/bufferViews no longer referenced by those retained surfaces.
 * Unknown glTF extensions are rejected instead of rewriting indices blindly.
 */
export function normalizeNpcFallbackGlb(bytes) {
  const parsed = parseGlbBytes(bytes);
  const json = clone(parsed.json);
  if ((json.extensionsUsed?.length ?? 0) || (json.extensionsRequired?.length ?? 0)) throw new Error('GLB_NORMALIZE_EXTENSION_REVIEW_REQUIRED');
  if (!Array.isArray(json.accessors) || !Array.isArray(json.bufferViews) || !Array.isArray(json.buffers) || json.buffers.length !== 1) throw new Error('GLB_NORMALIZE_STRUCTURE_INVALID');
  if (json.accessors.some(accessor => accessor?.sparse)) throw new Error('GLB_NORMALIZE_SPARSE_UNSUPPORTED');

  const exactAnimations = new Map();
  for (const animation of json.animations ?? []) if (NPC_FALLBACK_ANIMATIONS.includes(animation?.name) && !exactAnimations.has(animation.name)) exactAnimations.set(animation.name, animation);
  for (const name of NPC_FALLBACK_ANIMATIONS) if (!exactAnimations.has(name)) throw new Error('GLB_NPC_CANONICAL_ANIMATIONS_REQUIRED');
  const animations = NPC_FALLBACK_ANIMATIONS.map(name => exactAnimations.get(name));

  const usedAccessors = collectAccessorReferences(json, animations);
  for (const index of usedAccessors) if (index >= json.accessors.length) throw new Error('GLB_ACCESSOR_REFERENCE_INVALID');
  const usedViews = new Set();
  for (const index of usedAccessors) {
    const accessor = json.accessors[index];
    if (accessor.bufferView !== undefined) usedViews.add(integer(accessor.bufferView, 'GLB_BUFFERVIEW_REFERENCE_INVALID'));
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined) usedViews.add(integer(image.bufferView, 'GLB_BUFFERVIEW_REFERENCE_INVALID'));
  for (const index of usedViews) if (index >= json.bufferViews.length) throw new Error('GLB_BUFFERVIEW_REFERENCE_INVALID');

  const accessorIndices = [...usedAccessors].sort((left, right) => left - right);
  const viewIndices = [...usedViews].sort((left, right) => left - right);
  const accessorMap = new Map(accessorIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const viewMap = new Map(viewIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  rewriteAccessorReferences(json, animations, accessorMap);

  const outputChunks = [];
  const bufferViews = [];
  let binaryOffset = 0;
  for (const oldIndex of viewIndices) {
    const original = json.bufferViews[oldIndex];
    const start = integer(original.byteOffset ?? 0, 'GLB_BUFFERVIEW_BOUNDS');
    const length = integer(original.byteLength, 'GLB_BUFFERVIEW_BOUNDS');
    if (start + length > parsed.binary.length) throw new Error('GLB_BUFFERVIEW_BOUNDS');
    const aligned = align4(binaryOffset);
    if (aligned > binaryOffset) outputChunks.push(Buffer.alloc(aligned - binaryOffset));
    binaryOffset = aligned;
    const next = clone(original);
    next.byteOffset = binaryOffset;
    bufferViews.push(next);
    outputChunks.push(parsed.binary.subarray(start, start + length));
    binaryOffset += length;
  }
  if (align4(binaryOffset) > binaryOffset) outputChunks.push(Buffer.alloc(align4(binaryOffset) - binaryOffset));
  const binary = Buffer.concat(outputChunks);

  const accessors = accessorIndices.map(oldIndex => {
    const next = clone(json.accessors[oldIndex]);
    if (next.bufferView !== undefined) next.bufferView = viewMap.get(next.bufferView);
    return next;
  });
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);

  json.animations = animations;
  json.accessors = accessors;
  json.bufferViews = bufferViews;
  json.buffers = [{ ...json.buffers[0], byteLength: binary.length }];
  delete json.buffers[0].uri;

  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonPadding = align4(rawJson.length) - rawJson.length;
  const jsonChunk = jsonPadding ? Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]) : rawJson;
  const result = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binary.length);
  result.write('glTF', 0, 'ascii'); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonChunk.length, 12); result.writeUInt32LE(JSON_CHUNK, 16); jsonChunk.copy(result, 20);
  const binaryHeader = 20 + jsonChunk.length;
  result.writeUInt32LE(binary.length, binaryHeader); result.writeUInt32LE(BIN_CHUNK, binaryHeader + 4); binary.copy(result, binaryHeader + 8);
  return Object.freeze({
    bytes: result,
    originalBytes: bytes.length,
    normalizedBytes: result.length,
    originalAnimationCount: parsed.json.animations?.length ?? 0,
    animationCount: animations.length,
    originalAccessorCount: parsed.json.accessors.length,
    accessorCount: accessors.length,
    originalBufferViewCount: parsed.json.bufferViews.length,
    bufferViewCount: bufferViews.length,
  });
}

async function readRegularFile(filename) {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error('GLB_FILE_REQUIRED');
    const bytes = await file.readFile();
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size) throw new Error('GLB_FILE_CHANGED');
    return bytes;
  } finally { await file.close(); }
}

export async function normalizeNpcFallbackFile(input, output) {
  const normalized = normalizeNpcFallbackGlb(await readRegularFile(input));
  await mkdir(path.dirname(output), { recursive: true });
  const file = await open(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try { await file.writeFile(normalized.bytes); }
  finally { await file.close(); }
  return normalized;
}

async function main(args) {
  if (args.length !== 2 || args.includes('--help')) {
    process.stdout.write('Usage: node scripts/glb-npc-fallback-normalize.mjs INPUT_DIRECTORY OUTPUT_DIRECTORY\nThe output directory must be new/empty; only top-level .glb files are processed.\n');
    return;
  }
  const [inputDirectory, outputDirectory] = args.map(value => path.resolve(value));
  await mkdir(outputDirectory, { recursive: true });
  const existing = await readdir(outputDirectory);
  if (existing.length) throw new Error('GLB_OUTPUT_DIRECTORY_NOT_EMPTY');
  const entries = (await readdir(inputDirectory, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.glb')).sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (!entries.length) throw new Error('GLB_INPUT_EMPTY');
  for (const entry of entries) {
    const result = await normalizeNpcFallbackFile(path.join(inputDirectory, entry.name), path.join(outputDirectory, entry.name));
    process.stdout.write(`${JSON.stringify({ file: entry.name, originalBytes: result.originalBytes, normalizedBytes: result.normalizedBytes, originalAnimationCount: result.originalAnimationCount, animationCount: result.animationCount, originalAccessorCount: result.originalAccessorCount, accessorCount: result.accessorCount, originalBufferViewCount: result.originalBufferViewCount, bufferViewCount: result.bufferViewCount })}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error && /^GLB_[A-Z_]+$/.test(error.message) ? error.message : 'GLB_NORMALIZE_FAILED'}\n`);
    process.exitCode = 1;
  });
}
