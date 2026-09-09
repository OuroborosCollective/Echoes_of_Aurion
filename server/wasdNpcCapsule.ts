import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { npcAuthority } from "../vendor/wasd-npc/index.js";

// File/manifest verification runs before the production bundle is built.
// Immutable runtime source literals must also agree with the reviewed consumer pin.
const authority = npcAuthority();
if (authority.sourceRevision !== pin.sourceRevision || authority.sourceSha256 !== pin.sourceSha256) {
  throw new Error("WASD_NPC_RUNTIME_SOURCE_MISMATCH");
}
export * from "../vendor/wasd-npc/index.js";
