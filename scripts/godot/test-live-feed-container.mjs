import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { hello } from "../../deploy/readback-aurion-godot-bridge.mjs";

// Isolated hosted Docker proof. It never creates a player, zone, tick or receipt.
// Authentication and the disabled write boundary are real network exchanges.
const [image, revision] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(revision ?? "") || image !== `echoes-of-aurion:${revision}` || process.env.GITHUB_ACTIONS !== "true") throw new Error("FEED_CONTAINER_PROOF_SCOPE_INVALID");
// The production process requires a real database. Reuse only this Actions
// run's already-provisioned disposable MariaDB; never weaken its startup gate.
const databaseNetwork = process.env.AURION_FEED_TEST_DATABASE_NETWORK;
let database;
try { database = new URL(process.env.DATABASE_URL ?? ""); }
catch { throw new Error("FEED_CONTAINER_DATABASE_SCOPE_INVALID"); }
const runId = process.env.GITHUB_RUN_ID ?? "";
if (!/^\d+$/.test(runId) || databaseNetwork !== `aurion-runtime-database-verify-${runId}`
    || database.protocol !== "mysql:" || database.hostname !== "mariadb" || database.port !== "3306"
    || database.pathname !== "/aurion_runtime" || database.username !== "aurion_runtime"
    || !/^[a-f0-9]{48}$/.test(database.password) || database.search || database.hash) {
  throw new Error("FEED_CONTAINER_DATABASE_SCOPE_INVALID");
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-feed-container-"));
const tokenFile = path.join(directory, "feed.token");
const token = randomBytes(32).toString("hex");
fs.writeFileSync(tokenFile, token + "\n", { mode: 0o600 });
execFileSync("sudo", ["chown", "0:1000", tokenFile]);
execFileSync("sudo", ["chmod", "0440", tokenFile]);
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let container;
let bridge;
try {
  container = docker(["run", "--detach", "--network", databaseNetwork, "--env", "DATABASE_URL", "--publish", "127.0.0.1::39220", "--mount", `type=bind,source=${tokenFile},target=/run/secrets/aurion-godot-feed.token,readonly`, "-e", "AURION_GODOT_FEED_TOKEN_FILE=/run/secrets/aurion-godot-feed.token", "-e", "AURION_GODOT_FEED_BIND=0.0.0.0", "-e", "AURION_GODOT_FEED_PORT=39220", image]);
  assert.match(container, /^[a-f0-9]{64}$/);
  const installed = JSON.parse(docker(["inspect", container]))[0];
  const bindings = installed.HostConfig.PortBindings["39220/tcp"];
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].HostIp, "127.0.0.1");
  // HostConfig retains the requested empty port for an ephemeral publication.
  // Only NetworkSettings reports the host port Docker actually assigned.
  const published = installed.NetworkSettings.Ports["39220/tcp"];
  assert.equal(published?.length, 1);
  assert.equal(published[0].HostIp, "127.0.0.1");
  assert.match(published[0].HostPort, /^[1-9][0-9]{0,4}$/);
  assert.ok(Number(published[0].HostPort) <= 65535);
  const endpoint = `ws://127.0.0.1:${published[0].HostPort}/feed`;
  const exchange = (credential, checkWrite = false) => new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    let hello;
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error("FEED_CONTAINER_PROOF_TIMEOUT")); }, 1500);
    const finish = (error, value) => { clearTimeout(timeout); ws.close(); error ? reject(error) : resolve(value); };
    ws.on("error", () => finish(new Error("FEED_CONTAINER_NOT_READY")));
    ws.on("open", () => ws.send(JSON.stringify({ t: "feed.auth", token: credential })));
    ws.on("message", data => {
      try {
        const message = JSON.parse(data.toString());
        if (message.t === "feed.hello") {
          assert.equal(message.worldId, "echoes-of-aurion-global");
          assert.equal(message.edit, false);
          hello = message;
          if (checkWrite) ws.send(JSON.stringify({ t: "feed.cmd", id: "ci-disabled-write", cmd: { op: "entity.remove", id: "ci-never-created" } }));
          else finish(null, { accepted: true });
        } else if (message.t === "feed.ack") {
          assert.ok(hello);
          assert.equal(message.id, "ci-disabled-write");
          assert.equal(message.ok, false);
          assert.equal(message.error, "not_supported");
          finish(null, { accepted: true, writeRejected: true });
        }
      } catch { finish(new Error("FEED_CONTAINER_PROTOCOL_MISMATCH")); }
    });
    ws.on("close", code => { if (code === 4003) finish(null, { accepted: false }); });
  });
  let accepted;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { accepted = await exchange(token, true); break; }
    catch (error) {
      if (error.message !== "FEED_CONTAINER_NOT_READY") throw error;
      const state = JSON.parse(docker(["inspect", container]))[0].State;
      if (state.Status !== "running") throw new Error(`FEED_CONTAINER_EXITED:${state.ExitCode}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (accepted === undefined) {
    const observed = JSON.parse(docker(["inspect", container]))[0];
    console.error(JSON.stringify({ status: "FEED_CONTAINER_READINESS_NOT_ESTABLISHED", containerStatus: observed.State.Status, exitCode: observed.State.ExitCode, health: observed.State.Health?.Status ?? null }));
  }
  assert.deepEqual(accepted, { accepted: true, writeRejected: true });
  assert.deepEqual(await exchange("incorrect-disposable-test-credential"), { accepted: false });
  // Exercise the same builtin-WebSocket readback used after a real promotion,
  // through the actual sealed bridge bundle and its protected credential files.
  await hello(endpoint, "feed.auth", token);
  const editorToken = randomBytes(32).toString("hex");
  const hostFeed = path.join(directory, "bridge-feed.token");
  const hostEditor = path.join(directory, "bridge-editor.token");
  fs.writeFileSync(hostFeed, token + "\n", { mode: 0o600 });
  fs.writeFileSync(hostEditor, editorToken + "\n", { mode: 0o600 });
  bridge = spawn(process.execPath, [path.resolve("dist-traefik-runtime/godot-bridge/aurion-godot-bridge.mjs")], {
    env: { ...process.env, UPSTREAM_PROTOCOL: "feed", UPSTREAM_URL: endpoint, UPSTREAM_TOKEN_FILE: hostFeed, BRIDGE_HOST: "127.0.0.1", BRIDGE_PORT: "8765", BRIDGE_TOKEN_FILE: hostEditor, BRIDGE_EDIT: "0", BRIDGE_AUDIT_LOG: path.join(directory, "audit-unused.jsonl") },
    stdio: ["ignore", "ignore", "ignore"],
  });
  let bridgeAuthenticated = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    if (bridge.exitCode !== null) throw new Error("SEALED_BRIDGE_PROCESS_EXITED");
    try { await hello("ws://127.0.0.1:8765/godot", "auth", editorToken); bridgeAuthenticated = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  assert.equal(bridgeAuthenticated, true);
  assert.equal(installed.Config.Labels["org.opencontainers.image.revision"], revision);
  assert.equal(installed.Config.User, "node");
  assert.equal(installed.Image, JSON.parse(docker(["image", "inspect", image]))[0].Id);
  console.log(JSON.stringify({ status: "AURION_GODOT_HOSTED_CONTAINER_FEED_PASS", sourceRevision: revision, imageId: installed.Image, loopbackOnly: true, protectedFileReadableByNode: true, unauthorizedRejected: true, genericWriteRejected: true, sealedBridgeAuthenticated: true, productionEvidence: false }));
} finally {
  if (bridge && bridge.exitCode === null && bridge.signalCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(() => { bridge.kill("SIGKILL"); resolve(); }, 3000);
      bridge.once("exit", () => { clearTimeout(timer); resolve(); });
      bridge.kill("SIGTERM");
    });
  }
  if (container) docker(["rm", "--force", container]);
  // The directory is owned by the runner; no secret bytes are printed.
  fs.rmSync(directory, { recursive: true, force: true });
}
