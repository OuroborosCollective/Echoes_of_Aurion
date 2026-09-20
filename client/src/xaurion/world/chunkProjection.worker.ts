import { decodeChunkAssetWorkerPayload } from "@shared/worldChunkProjectionPayload";
import type { WorldChunkProjectionWorkerJobV2 } from "@shared/worldChunkProjectionV2";

self.onmessage = async (event: MessageEvent<{ job: WorldChunkProjectionWorkerJobV2; payload: Uint8Array }>) => {
  try {
    const { result } = await decodeChunkAssetWorkerPayload(event.data.job, event.data.payload);
    self.postMessage({ status: "DECODED", result });
  } catch {
    self.postMessage({ status: "REJECTED" });
  }
};
