/** Isolated real Aurion tick -> authenticated WS feed -> bridge -> actual Godot. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AuthoritativeMovementZone } from "../../server/zoneRuntime";
import { AurionTickRecorder } from "../../server/causality/tickRecorder";
import { projectCommittedTick } from "../../server/godotBridge/aurionAdapter";
import { attachAurionFeed } from "../../server/godotBridge/feed/aurionFeed";
import { startBridge } from "../../server/godotBridge/bridge/app";
import { silentLogger } from "../../server/godotBridge/bridge/log";
import { ZONE_TICK_MS } from "../../server/zoneProtocol";

const revision = process.env.AURION_EXPECTED_REVISION ?? "";
assert.match(revision, /^[a-f0-9]{40}$/);
assert.equal(ZONE_TICK_MS, 100);
const recorder = new AurionTickRecorder(100);
const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
zone.sourceRevisionOverride = revision;
const identity = { sourceRevision: revision, runtimeImageDigest: "UNVERIFIED", streamInstance: "11111111-1111-4111-8111-111111111111" };
zone.tick();
let projection = projectCommittedTick(recorder.getEntry(zone.zoneId, zone.getTickNumber())!, identity);
const feedToken = randomBytes(32).toString("hex");
const bridgeToken = randomBytes(32).toString("hex");
const feed = attachAurionFeed({ token: feedToken, port: 0, host: {
  worldId: projection.identity.worldId,
  getTick: () => projection.identity.tick, getIdentity: () => projection.identity,
  getEntities: () => projection.entities, getRegions: () => projection.regions,
} });
const feedPort = await feed.ready;
const bridge = await startBridge({
  upstreamUrl: `ws://127.0.0.1:${feedPort}/feed`, upstreamToken: feedToken,
  upstreamProtocol: "feed", coords: "xz", reconnectMinMs: 100, reconnectMaxMs: 500,
  host: "127.0.0.1", port: 0, token: bridgeToken, edit: true, editRate: 5,
  auditLog: "", maxBuffer: 1048576, requireCanonical: true,
}, silentLogger);
const timer = setInterval(() => {
  zone.tick();
  const entry = recorder.getEntry(zone.zoneId, zone.getTickNumber())!;
  projection = projectCommittedTick(entry, { ...identity,
    previousReceipt: recorder.getReceipt(zone.zoneId, entry.receipt.tick - 1),
  });
  feed.onTick(zone.getTickNumber());
}, ZONE_TICK_MS);
let stdout = "", stderr = "";
try {
  const code = await new Promise<number>((done, fail) => {
    const child = spawn(resolve(process.env.AURION_GODOT_BIN ?? ".aurion-godot/editor/Godot_v4.7.2-stable_linux.x86_64"), ["--headless", "--path", "godot-client", "--script", "res://tests/live_bridge_probe.gd"], {
      env: { ...process.env, AURION_BRIDGE_URL: `ws://127.0.0.1:${bridge.port}/godot`, AURION_BRIDGE_TOKEN: bridgeToken },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => child.kill("SIGTERM"), 30000);
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    child.once("error", fail);
    child.once("exit", code => { clearTimeout(timeout); done(code ?? 1); });
  });
  console.log(stdout);
  if (stderr) console.error(stderr);
  assert.equal(code, 0);
  assert.match(stdout, /\[probe\] OK/);
  assert.doesNotMatch(stderr, /SCRIPT ERROR|Parse Error/);
  assert.equal(bridge.upstream.supportsEdit, false, "No write handler must never advertise editing");
  assert.equal(bridge.world.identity!.sourceRevision, revision);
  const output = process.env.AURION_BRIDGE_EVIDENCE ?? ".aurion-godot/live-bridge-evidence";
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "isolated-runtime.json"), JSON.stringify({
    schema: "aurion.godot.isolated-runtime-proof.v1", sourceRevision: revision,
    environment: "isolated-ci-authority", productionEvidence: false, tickMs: ZONE_TICK_MS,
    identity: bridge.world.identity, godotExit: code, editing: false,
    scope: "confirmed player/mob markers; no terrain or asset-model claim",
  }, null, 2) + "\n");
} finally {
  clearInterval(timer);
  await bridge.close();
  await feed.close();
}

