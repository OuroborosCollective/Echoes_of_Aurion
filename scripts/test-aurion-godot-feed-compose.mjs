import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real Compose rendering, including hostile stale owner env values. No server,
// credential, zone, tick or production resource is created by this test.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-feed-compose-"));
try {
  const file = path.join(directory, "application.env");
  const previous = "AURION_GODOT_FEED_TOKEN_FILE=/stale/token\nAURION_GODOT_FEED_BIND=0.0.0.0\nAURION_GODOT_FEED_PORT=12345\n";
  fs.writeFileSync(file, previous, { mode: 0o600 });
  const env = { ...process.env, AURION_ENV_FILE: file, AURION_IMAGE_TAG: "0".repeat(40), AURION_RELEASE_SHA: "0".repeat(40) };
  for (const [i, key] of ["BUILD_INPUT", "ARTIFACT", "RUNTIME_IMAGE", "RELEASE_ARCHIVE"].entries()) {
    env[`AURION_${key}_DIGEST`] = `sha256:${String(i + 1).repeat(64)}`;
  }
  const render = enabled => JSON.parse(execFileSync("docker", ["compose", "--project-name", "aurion-feed-contract", "-f", "docker-compose.traefik.yml", ...(enabled ? ["-f", "docker-compose.godot-feed.yml"] : []), "config", "--format", "json"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const off = render(false).services.aurion;
  assert.equal(off.environment.AURION_GODOT_FEED_TOKEN_FILE, "");
  assert.equal(off.ports?.length ?? 0, 0);
  assert.ok(!off.volumes.some(mount => mount.target === "/run/secrets/aurion-godot-feed.token"));
  assert.equal(off.build, undefined);
  const on = render(true).services.aurion;
  assert.equal(on.environment.AURION_GODOT_FEED_TOKEN_FILE, "/run/secrets/aurion-godot-feed.token");
  assert.equal(on.environment.AURION_GODOT_FEED_BIND, "0.0.0.0");
  assert.equal(on.environment.AURION_GODOT_FEED_PORT, "39220");
  assert.equal(on.ports.length, 1);
  assert.equal(on.ports[0].host_ip, "127.0.0.1");
  assert.equal(String(on.ports[0].published), "39220");
  assert.equal(on.ports[0].target, 39220);
  assert.equal(on.ports[0].protocol, "tcp");
  const mounts = on.volumes.filter(mount => mount.target === "/run/secrets/aurion-godot-feed.token");
  assert.equal(mounts.length, 1);
  assert.equal(mounts[0].source, "/etc/aurion-godot/feed.token");
  assert.equal(mounts[0].type, "bind");
  assert.equal(mounts[0].read_only, true);
  assert.equal(mounts[0].bind.create_host_path, false);
  assert.equal(on.build, undefined);
  assert.equal(fs.readFileSync(file, "utf8"), previous);
  console.log("AURION_GODOT_FEED_COMPOSE_CONTRACT_PASS defaultInactive=true loopbackOnly=true protectedReadOnlyMount=true");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
