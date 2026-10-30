import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function hello(endpoint, type, token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let done = false;
    const finish = (error, message) => {
      if (done) return;
      done = true; clearTimeout(timer); socket.close();
      error ? reject(error) : resolve(message);
    };
    const timer = setTimeout(() => finish(new Error("BRIDGE_AUTH_TIMEOUT")), 1500);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ t: type, token })));
    socket.addEventListener("error", () => finish(new Error("BRIDGE_AUTH_UNAVAILABLE")));
    socket.addEventListener("close", () => finish(new Error("BRIDGE_AUTH_CLOSED")));
    socket.addEventListener("message", event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.t !== (type === "feed.auth" ? "feed.hello" : "hello")) return;
        assert.equal(message.proto, 1);
        assert.equal(message.worldId, "echoes-of-aurion-global");
        assert.equal(message.edit, false);
        finish(null, message);
      } catch { finish(new Error("BRIDGE_AUTH_CONTRACT_MISMATCH")); }
    });
  });
}

function listening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function service(property) {
  return execFileSync("systemctl", ["show", "aurion-godot-bridge.service", "--property", property, "--value"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export async function readback(release, revision, containerId, enabled) {
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.match(containerId, /^[a-f0-9]{64}$/);
  const manifest = JSON.parse(fs.readFileSync(path.join(release, "manifest.json"), "utf8"));
  assert.equal(manifest.revision, revision);
  const [container] = JSON.parse(execFileSync("docker", ["inspect", containerId], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  assert.equal(container.Config.Labels["org.opencontainers.image.revision"], revision);
  assert.equal(container.Image, manifest.runtimeImage.id);
  const base = { schema: "aurion.godot.bridge-installation.v1", sourceRevision: revision, containerId, enabled, productionWorldEvidence: false, mutationAuthority: "none", secretValuesReturned: false };
  if (!enabled) {
    assert.equal(await listening(8765), false);
    if (fs.existsSync("/etc/systemd/system/aurion-godot-bridge.service")) {
      assert.notEqual(service("ActiveState"), "active");
      assert.notEqual(service("UnitFileState"), "enabled");
    }
    return { ...base, status: "DISABLED", transportReady: false };
  }
  const directory = fs.realpathSync("/srv/serverin/tools/aurion-godot-bridge/current");
  assert.equal(path.basename(directory), path.basename(release));
  const bundle = fs.readFileSync(path.join(directory, "aurion-godot-bridge.mjs"));
  const bundleHash = createHash("sha256").update(bundle).digest("hex");
  assert.equal(bundleHash, manifest.files["godot-bridge/aurion-godot-bridge.mjs"]);
  assert.equal(fs.readFileSync("/etc/systemd/system/aurion-godot-bridge.service", "utf8"), fs.readFileSync(path.join(release, "deploy/aurion-godot-bridge.service"), "utf8"));
  assert.equal(fs.readFileSync("/etc/aurion-godot-bridge.env", "utf8"), fs.readFileSync(path.join(release, "deploy/aurion-godot-bridge.environment.template"), "utf8"));
  const feedToken = fs.readFileSync("/etc/aurion-godot/feed.token", "utf8").trim();
  const editorToken = fs.readFileSync("/etc/aurion-godot/editor.token", "utf8").trim();
  await hello("ws://127.0.0.1:39220/feed", "feed.auth", feedToken);
  let connected = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await hello("ws://127.0.0.1:8765/godot", "auth", editorToken); connected = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  assert.equal(connected, true);
  const pid = service("MainPID");
  assert.match(pid, /^[1-9][0-9]*$/);
  assert.equal(fs.realpathSync(`/proc/${pid}/cwd`), directory);
  const command = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
  assert.deepEqual(command, ["/usr/bin/node", "/srv/serverin/tools/aurion-godot-bridge/current/aurion-godot-bridge.mjs"]);
  const response = await fetch("http://127.0.0.1:8765/health", { signal: AbortSignal.timeout(2000) });
  assert.ok([200, 503].includes(response.status));
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  const health = await response.json();
  assert.equal(health.worldId, "echoes-of-aurion-global");
  assert.equal(health.edit, false);
  if (health.identity) {
    assert.equal(health.identity.sourceRevision, revision);
    assert.equal(health.identity.runtimeImageDigest, manifest.runtimeImage.id);
  }
  assert.equal(service("MainPID"), pid);
  assert.equal(service("ActiveState"), "active");
  return { ...base, status: "TRANSPORT_READY", transportReady: true, worldProjectionStatus: health.ok && health.identity ? "BRIDGE_HAS_COMMITTED_SNAPSHOT" : "WAITING_FOR_COMMITTED_WORLD", bundleSha256: bundleHash, runtimeImageDigest: manifest.runtimeImage.id, mainPid: Number(pid) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [release, revision, container, flag] = process.argv.slice(2);
    assert.ok(flag === "0" || flag === "1");
    console.log(JSON.stringify(await readback(release, revision, container, flag === "1")));
  } catch {
    console.error("GODOT_BRIDGE_INSTALLATION_READBACK_REJECTED");
    process.exitCode = 70;
  }
}
