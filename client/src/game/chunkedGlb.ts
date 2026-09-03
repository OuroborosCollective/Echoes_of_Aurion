import type { ChunkedGlbAsset } from "./starterCharacterAssets";

export type MaterializedGlb = Readonly<{
  url: string;
  sha256: string;
  bytes: number;
  revoke: () => void;
}>;

function asHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  return asHex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

function validateGlbHeader(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 12) throw new Error("GLB payload is shorter than its header");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("GLB magic does not match glTF");
  if (view.getUint32(4, true) !== 2) throw new Error("Only glTF 2.0 GLBs are accepted");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB declared length does not match the decoded payload");
}

export async function materializeChunkedGlb(asset: ChunkedGlbAsset): Promise<MaterializedGlb> {
  if (typeof DecompressionStream !== "function") throw new Error("Browser gzip decompression is unavailable");
  if (!asset.parts.length) throw new Error(`${asset.id} has no payload parts`);

  const parts = await Promise.all(asset.parts.map(async partUrl => {
    const response = await fetch(partUrl, { cache: "force-cache" });
    if (!response.ok) throw new Error(`${asset.id} payload part failed: ${partUrl} (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }));
  const compressedLength = parts.reduce((total, part) => total + part.byteLength, 0);
  if (compressedLength !== asset.compressedBytes) {
    throw new Error(`${asset.id} compressed byte length mismatch: ${compressedLength} !== ${asset.compressedBytes}`);
  }

  const compressed = new Uint8Array(compressedLength);
  let cursor = 0;
  for (const part of parts) {
    compressed.set(part, cursor);
    cursor += part.byteLength;
  }
  if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) throw new Error(`${asset.id} is not a gzip stream`);

  const compressedBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
  const compressedHash = await sha256(compressedBuffer);
  if (compressedHash !== asset.compressedSha256) {
    throw new Error(`${asset.id} compressed SHA-256 mismatch`);
  }

  const decompressedStream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const glbBytes = await new Response(decompressedStream).arrayBuffer();
  if (glbBytes.byteLength !== asset.glbBytes) {
    throw new Error(`${asset.id} GLB byte length mismatch: ${glbBytes.byteLength} !== ${asset.glbBytes}`);
  }
  validateGlbHeader(glbBytes);
  const glbHash = await sha256(glbBytes);
  if (glbHash !== asset.glbSha256) throw new Error(`${asset.id} GLB SHA-256 mismatch`);

  const url = URL.createObjectURL(new Blob([glbBytes], { type: "model/gltf-binary" }));
  window.dispatchEvent(new CustomEvent("aurion:starter-asset-evidence", { detail: {
    assetId: asset.id,
    compressedSha256: compressedHash,
    glbSha256: glbHash,
    compressedBytes: compressedLength,
    glbBytes: glbBytes.byteLength,
    partCount: asset.parts.length,
  } }));
  return Object.freeze({
    url,
    sha256: glbHash,
    bytes: glbBytes.byteLength,
    revoke: () => URL.revokeObjectURL(url),
  });
}
