import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-redis-compose-"));
try {
  const envFile = path.join(directory, "application.env");
  const previous = "REDIS_URL=redis://retired-redis.invalid:6379/2\n";
  fs.writeFileSync(envFile, previous, { mode: 0o600 });
  const raw = execFileSync("docker", ["compose", "--project-name", "aurion-redis-contract-test", "--file", "docker-compose.traefik.yml", "config", "--format", "json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      AURION_ENV_FILE: envFile,
      AURION_IMAGE_TAG: "contract-test",
      AURION_RELEASE_SHA: "0".repeat(40),
      AURION_BUILD_INPUT_DIGEST: `sha256:${"1".repeat(64)}`,
      AURION_ARTIFACT_DIGEST: `sha256:${"2".repeat(64)}`,
      AURION_RUNTIME_IMAGE_DIGEST: `sha256:${"3".repeat(64)}`,
      AURION_RELEASE_ARCHIVE_DIGEST: `sha256:${"4".repeat(64)}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const compose = JSON.parse(raw);
  assert.equal(compose.services.aurion.environment.REDIS_URL, "");
  assert.equal(fs.readFileSync(envFile, "utf8"), previous);
  const mount = compose.services.aurion.volumes.find(item => item.target === "/var/lib/aurion/companion-memory");
  assert.equal(mount?.type, "volume");
  assert.equal(compose.volumes[mount.source].name, "echoes-of-aurion-companion-memory");
  console.log(JSON.stringify({ status: "OPTIONAL_REDIS_COMPOSE_CONTRACT_VERIFIED", redisUrlCleared: true, originalEnvironmentUnchanged: true, companionVolumeRetained: true }));
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
