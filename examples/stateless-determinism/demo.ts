import { createHash } from "node:crypto";
import { deterministicStep, stableJsonForTest } from "./deterministic-step.ts";

const result = deterministicStep({
  tick: 7,
  entity: { id: "entity-1", x: 10, y: 20 },
  direction: "right",
  distance: 3,
});

const independentlyVerified = createHash("sha256")
  .update(stableJsonForTest(result.output), "utf8")
  .digest("hex");

if (independentlyVerified !== result.evidenceSha256) {
  throw new Error("digest verification failed");
}

console.log(JSON.stringify(result.output));
console.log(result.evidenceSha256);
