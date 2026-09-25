import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import { npcAuthority } from "../vendor/wasd-npc/index.js";

// File/manifest verification runs before the production bundle is built.
// Migrated deterministic implementation must agree with its historical provenance pin; the pin is not a live external authority.
const authority = npcAuthority();
if (authority.sourceRevision !== pin.sourceRevision || authority.sourceSha256 !== pin.sourceSha256) {
  throw new Error("WASD_NPC_RUNTIME_SOURCE_MISMATCH");
}
export * from "../vendor/wasd-npc/index.js";
