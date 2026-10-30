import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

// Isolated hosted Docker proof. It never creates a player, zone, tick or receipt.
// Authentication and the disabled write boundary are real network exchanges.
const [image, revision] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(revision ?? "") || image !== `echoes-of-aurion:${revision}` || process.env.GITHUB_ACTIONS !== "true") throw new Error("FEED_CONTAINER_PROOF_SCOPE_INVALID");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-feed-container-"));
const tokenFile = path.join(directory, "feed.token");
const token = randomBytes(32).toString("hex");
fs.writeFileSync(tokenFile, token + "\n", { mode: 0o600 });
execFileSync("sudo", ["chown", "0:1000", tokenFile]);
execFileSync("sudo", ["chmod", "0440", tokenFile]);
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let container;
try {
  container = docker(["run", "--detach", "--network", "bridge", "--publish", "127.0.0.1::39220", "--mount", `type=bind,source=${tokenFile},target=/run/secrets/aurion-godot-feed.token,readonly`, "-e", "AURION_GODOT_FEED_TOKEN_FILE=/run/secrets/aurion-godot-feed.token", "-e", "AURION_GODOT_FEED_BIND=0.0.0.0", "-e", "AURION_GODOT_FEED_PORT=39220", image]);
  assert.match(container, /^[a-f0-9]{64}$/);
  const installed = JSON.parse(docker(["inspect", container]))[0];
  const bindings = installed.HostConfig.PortBindings["39220/tcp"];
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].HostIp, "127.0.0.1");
  const endpoint = `ws://127.0.0.1:${bindings[0].HostPort}/feed`;
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
    catch (error) { if (error.message !== "FEED_CONTAINER_NOT_READY") throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.deepEqual(accepted, { accepted: true, writeRejected: true });
  assert.deepEqual(await exchange("incorrect-disposable-test-credential"), { accepted: false });
  assert.equal(installed.Config.Labels["org.opencontainers.image.revision"], revision);
  assert.equal(installed.Config.User, "node");
  assert.equal(installed.Image, JSON.parse(docker(["image", "inspect", image]))[0].Id);
  console.log(JSON.stringify({ status: "AURION_GODOT_HOSTED_CONTAINER_FEED_PASS", sourceRevision: revision, imageId: installed.Image, loopbackOnly: true, protectedFileReadableByNode: true, unauthorizedRejected: true, genericWriteRejected: true, productionEvidence: false }));
} finally {
  if (container) docker(["rm", "--force", container]);
  // The directory is owned by the runner; no secret bytes are printed.
  fs.rmSync(directory, { recursive: true, force: true });
}
