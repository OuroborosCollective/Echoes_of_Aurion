import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const pin = JSON.parse(await readFile(path.join(root,"config/wasd-npc-capsule.json"),"utf8"));
if (pin.schemaVersion !== "aurion-wasd-npc-pin.v1" || pin.repository !== "OuroborosCollective/Wasd") throw Error("WASD_NPC_PIN_INVALID");
const verifier = await readFile(path.join(root,"scripts/vendor/verify-wasd-npc-capsule.mjs"));
if (createHash("sha256").update(verifier).digest("hex") !== pin.verifierSha256) throw Error("WASD_NPC_VERIFIER_HASH_INVALID");
const { verifyNpcCapsule } = await import("./vendor/verify-wasd-npc-capsule.mjs");
const proof = await verifyNpcCapsule(path.join(root,"vendor/wasd-npc"),pin);
if (proof.sourceSha256 !== pin.sourceSha256) throw Error("WASD_NPC_SOURCE_HASH_INVALID");
console.log(JSON.stringify(proof));
