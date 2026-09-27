#!/usr/bin/env node

const COUNT = 10000;
const REVISION = "d".repeat(40);
const start = process.hrtime.bigint();

let digest = 0;
for (let i = 0; i < COUNT; i += 1) {
  const importance = i % 4 === 0 ? 0 : i % 3;
  const critical = i % 97 === 0;
  const local = i % 11 === 0;
  const regional = i % 7 === 0;
  const simulationInterest = i % 5 === 0;
  const networkInterest = i % 2 === 0;

  const tier =
    critical || simulationInterest
      ? "FULL"
      : local || networkInterest
        ? "REDUCED"
        : regional || importance > 0
          ? "STRATEGIC"
          : "DORMANT";

  digest = (digest + tier.length + REVISION.charCodeAt(i % REVISION.length)) >>> 0;
}

const elapsedNs = process.hrtime.bigint() - start;
console.log(JSON.stringify({
  protocol: "aurion.npc-causal-budget.v1",
  population: COUNT,
  deterministicSelectionDigest: digest,
  elapsedNs: Number(elapsedNs),
}));
