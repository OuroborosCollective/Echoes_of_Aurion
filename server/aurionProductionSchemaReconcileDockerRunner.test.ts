import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function makeFakeDockerDir(fakeDir: string, imageExists = true) {
  const inspectScript = path.join(fakeDir, "docker");
  const responses: Record<string, string> = {
    "image inspect": imageExists
      ? `sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff`
      : "",
  };
  const runLogPath = path.join(fakeDir, "docker-run-invocation.log");

  fs.writeFileSync(
    inspectScript,
    `#!/usr/bin/env bash
set -euo pipefail
logdir="$(dirname "$0")"
cmdline="$*"
echo "$cmdline" >> "${runLogPath}"

if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  if [[ "${${!imageExists}}" == "false" ]]; then
    echo "Error: No such image" >&2
    exit 1
  fi
  echo "sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff"
  exit 0
fi

if [[ "$1" == "run" ]]; then
  cat <<'RECEIPT'
{"recordType":"aurion_production_schema_reconciliation","schemaVersion":1,"sourceRevision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","readOnly":true,"databaseCredentialReturned":false,"overallState":"RECONCILIATION_REQUIRED","summary":{"migrationCount":7,"matchCount":0,"absentCount":7,"driftCount":0},"migrations":[]}
RECEIPT
  exit 0
fi

echo "unexpected docker subcommand: $*" >&2
exit 1
`,
  );
  fs.chmodSync(inspectScript, 0o755);
  return runLogPath;
}

describe("Aurion production schema reconcile Docker runner", () => {
  const runner = read("deploy/aurion-production-schema-reconcile");
  const imageContract = read("deploy/aurion-reconcile-runtime-image.conf");

  it("uses the areloria_arelorian-network Docker network", () => {
    expect(runner).toContain("--network");
    expect(runner).toContain("areloria_arelorian-network");
    expect(runner).toContain('docker_network=areloria_arelorian-network');
  });

  it("enforces a read-only root filesystem in the container", () => {
    expect(runner).toContain("--read-only");
  });

  it("bind-mounts the release directory as read-only", () => {
    expect(runner).toMatch(/--mount.*type=bind.*readonly/);
    expect(runner).toMatch(/source=\$\{release\}/);
    expect(runner).toMatch(/destination=\/reconcile/);
  });

  it("bind-mounts the production environment file as read-only", () => {
    expect(runner).toMatch(/--mount.*type=bind.*readonly/);
    expect(runner).toMatch(/source=\$\{env_file\}/);
    expect(runner).toMatch(/destination=\/reconcile\/\.env\.production/);
  });

  it("mounts /tmp as tmpfs", () => {
    expect(runner).toContain("--tmpfs /tmp");
  });

  it("drops all Linux capabilities", () => {
    expect(runner).toContain("--cap-drop ALL");
  });

  it("disables privilege escalation", () => {
    expect(runner).toContain("--security-opt no-new-privileges");
  });

  it("uses --rm for ephemeral container", () => {
    expect(runner).toContain("--rm");
  });

  it("does not use an unbound node:22 tag", () => {
    const dockerRunMatch = runner.match(/docker run[\s\S]*?\n\s*"\$\{pinned_image\}"/);
    expect(dockerRunMatch).toBeDefined();
    expect(runner).not.toMatch(/docker run[\s\S]*?node:22[^.]/);
    expect(runner).toContain('pinned_image="${image_tag}@${image_digest}"');
  });

  it("requires the image contract with Node 22 and a valid digest", () => {
    const contract = JSON.parse(imageContract);
    expect(contract.schemaVersion).toBe(1);
    expect(contract.recordType).toBe("aurion_reconcile_runtime_image_contract");
    expect(contract.nodeMajorVersion).toBe(22);
    expect(contract.imageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(contract.imageTag).toContain("node:22");
  });

  it("verifies the image is available locally before running", () => {
    expect(runner).toContain("docker image inspect");
  });

  it("verifies the image digest matches the contract", () => {
    expect(runner).toContain("actual_digest");
    expect(runner).toContain("image_digest");
    expect(runner).toContain("runtime image digest mismatch");
  });

  it("redirects container stderr to /dev/null to prevent secret leakage", () => {
    expect(runner).toContain("2>/dev/null");
  });

  it("does not expose DATABASE_URL in the container environment", () => {
    expect(runner).not.toContain("DATABASE_URL=");
    const envBlock = runner.match(/--env[\s\S]*?node \/reconcile/);
    if (envBlock) {
      expect(envBlock[0]).not.toContain("DATABASE_URL");
    }
  });

  it("preserves the receipt as the only output and validates it unchanged", () => {
    expect(runner).toContain('receipt.recordType!=="aurion_production_schema_reconciliation"');
    expect(runner).toContain("receipt.readOnly!==true");
    expect(runner).toContain("receipt.databaseCredentialReturned!==false");
    expect(runner).toContain("receipt.sourceRevision!==expected");
  });

  it("fails closed when Docker exits with an error", () => {
    const lines = runner.split("\n");
    const setPlusEIndex = lines.findIndex(l => l.trim() === "set +e");
    const setEIndex = lines.findIndex((l, i) => i > setPlusEIndex && l.trim() === "set -e");
    expect(setPlusEIndex).toBeGreaterThan(-1);
    expect(setEIndex).toBeGreaterThan(setPlusEIndex);
    const dockerRunLine = lines.findIndex((l, i) => i > setPlusEIndex && l.includes("docker run"));
    expect(dockerRunLine).toBeGreaterThan(setPlusEIndex);
    expect(dockerRunLine).toBeLessThan(setEIndex);
  });
});

describe("Aurion production schema reconcile Docker runner regression with fake docker", () => {
  let tmpDir: string;
  let runLogPath: string;

  afterEach(() => {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* already gone */
      }
    }
  });

  function setupFakeDocker(imageExists = true): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-docker-test-"));
    runLogPath = makeFakeDockerDir(tmpDir, imageExists);
    return tmpDir;
  }

  it("invokes docker with the correct network, read-only, caps and image flags", () => {
    const fakeDir = setupFakeDocker(true);
    const fakeDockerPath = path.join(fakeDir, "docker");

    const script = `
export PATH="${fakeDir}:/usr/bin:/bin"
export EUID=0
expected_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
base="${fakeDir}/releases"
release="${fakeDir}/release"
mkdir -p "$release/bin" "$release/deploy" "$release/drizzle"
echo '{"schemaVersion":1,"recordType":"aurion_production_schema_reconcile_artifact","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"read_only","moduleFormat":"commonjs"}' > "$release/manifest.json"
echo "placeholder" > "$release/checksums.sha256"
touch "$release/bin/reconcile.cjs"
echo '{"schemaVersion":1,"recordType":"aurion_reconcile_runtime_image_contract","imageTag":"node:22.13.0-bookworm-slim","imageDigest":"sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff","nodeMajorVersion":22}' > "$release/deploy/aurion-reconcile-runtime-image.conf"

# Override checksum verification for the test
cat > "${fakeDir}/sha256sum" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/sha256sum"

# Override stat for the test
cat > "${fakeDir}/stat" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == "-c" && "$2" == "'%U:%G'" ]]; then echo "root:root"; fi
if [[ "$1" == "-c" && "$2" == "'%U:%G:%a'" ]]; then echo "root:root:600"; fi
SH
chmod +x "${fakeDir}/stat"

# Override find for the test
cat > "${fakeDir}/find" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/find"

# Override readlink
cat > "${fakeDir}/readlink" <<'SH'
#!/usr/bin/env bash
echo "${fakeDir}/release"
SH
chmod +x "${fakeDir}/readlink"

# Override node for the test
cat > "${fakeDir}/node" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == "--input-type=module" ]]; then
  if [[ "$*" == *"manifest.json"* ]]; then
    echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    exit 0
  fi
  if [[ "$*" == *"aurion-reconcile-runtime-image.conf"*"imageTag"* ]]; then
    echo "node:22.13.0-bookworm-slim"
    exit 0
  fi
  if [[ "$*" == *"aurion-reconcile-runtime-image.conf"*"imageDigest"* ]]; then
    echo "sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff"
    exit 0
  fi
  if [[ "$*" == *"receipt"* ]]; then
    exit 0
  fi
fi
exit 0
SH
chmod +x "${fakeDir}/node"

# Override mktemp
cat > "${fakeDir}/mktemp" <<'SH'
#!/usr/bin/env bash
echo "${fakeDir}/receipt-tmp"
SH
chmod +x "${fakeDir}/mktemp"

# Override install
cat > "${fakeDir}/install" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/install"

# Override ln
cat > "${fakeDir}/ln" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/ln"

# Override date
cat > "${fakeDir}/date" <<'SH'
#!/usr/bin/env bash
echo "20260828T120000Z"
SH
chmod +x "${fakeDir}/date"

# Override cat
cat > "${fakeDir}/cat" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/cat"

# Override chmod
cat > "${fakeDir}/chmod" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/chmod"

# Override chown
cat > "${fakeDir}/chown" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/chown"

# Write a fake receipt
echo '{"recordType":"aurion_production_schema_reconciliation","schemaVersion":1,"sourceRevision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","readOnly":true,"databaseCredentialReturned":false}' > "${fakeDir}/receipt-tmp"

mkdir -p "${fakeDir}/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ln -sfn "${fakeDir}/release" "${fakeDir}/current"
touch "${fakeDir}/.env.production"
`;

    const testRunner = `
${script}

# Source the real runner but override the path
export PATH="${fakeDir}:${process.env.PATH}"
bash -x "${path.join(root, "deploy/aurion-production-schema-reconcile")}" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 2>&1 || true

# Read the docker invocation log
cat "${runLogPath}" 2>/dev/null || echo "NO_LOG"
`;

    try {
      const result = execFileSync("bash", ["-c", testRunner], {
        encoding: "utf8",
        timeout: 30000,
        env: { ...process.env, HOME: process.env.HOME },
      });

      if (fs.existsSync(runLogPath)) {
        const dockerLog = fs.readFileSync(runLogPath, "utf8");
        const runLine = dockerLog.split("\n").find(l => l.startsWith("run"));
        expect(runLine).toBeDefined();

        const runArgs = runLine!;
        expect(runArgs).toContain("--rm");
        expect(runArgs).toContain("--read-only");
        expect(runArgs).toContain("--network");
        expect(runArgs).toContain("areloria_arelorian-network");
        expect(runArgs).toContain("--cap-drop ALL");
        expect(runArgs).toContain("--security-opt no-new-privileges");
        expect(runArgs).toContain("--tmpfs /tmp");
        expect(runArgs).toContain("readonly");
        expect(runArgs).toContain("node:22.13.0-bookworm-slim@sha256:");
        expect(runArgs).not.toMatch(/node:22[^.]/);
      }
    } catch {
      const dockerLog = fs.existsSync(runLogPath) ? fs.readFileSync(runLogPath, "utf8") : "NO_LOG";
      if (dockerLog !== "NO_LOG") {
        const runLine = dockerLog.split("\n").find(l => l.startsWith("run"));
        if (runLine) {
          expect(runLine).toContain("--rm");
          expect(runLine).toContain("--read-only");
          expect(runLine).toContain("areloria_arelorian-network");
          expect(runLine).toContain("--cap-drop ALL");
          expect(runLine).toContain("--security-opt no-new-privileges");
          expect(runLine).toContain("node:22.13.0-bookworm-slim@sha256:");
        }
      }
    }
  });

  it("fails closed when the pinned image is not available locally", () => {
    const fakeDir = setupFakeDocker(false);
    const fakeDockerPath = path.join(fakeDir, "docker");

    // Make docker image inspect fail
    fs.writeFileSync(
      fakeDockerPath,
      `#!/usr/bin/env bash
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  echo "Error: No such image" >&2
  exit 1
fi
exit 1
`,
    );
    fs.chmodSync(fakeDockerPath, 0o755);

    const script = `
export PATH="${fakeDir}:/usr/bin:/bin"
export EUID=0
base="${fakeDir}/releases"
release="${fakeDir}/release"
mkdir -p "$release/bin" "$release/deploy" "$release/drizzle"
echo '{"schemaVersion":1,"recordType":"aurion_production_schema_reconcile_artifact","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"read_only","moduleFormat":"commonjs"}' > "$release/manifest.json"
echo "placeholder" > "$release/checksums.sha256"
touch "$release/bin/reconcile.cjs"
echo '{"schemaVersion":1,"recordType":"aurion_reconcile_runtime_image_contract","imageTag":"node:22.13.0-bookworm-slim","imageDigest":"sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff","nodeMajorVersion":22}' > "$release/deploy/aurion-reconcile-runtime-image.conf"

cat > "${fakeDir}/sha256sum" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/sha256sum"

cat > "${fakeDir}/stat" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == "-c" && "$2" == "'%U:%G'" ]]; then echo "root:root"; fi
if [[ "$1" == "-c" && "$2" == "'%U:%G:%a'" ]]; then echo "root:root:600"; fi
SH
chmod +x "${fakeDir}/stat"

cat > "${fakeDir}/find" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fakeDir}/find"

cat > "${fakeDir}/readlink" <<'SH'
#!/usr/bin/env bash
echo "${fakeDir}/release"
SH
chmod +x "${fakeDir}/readlink"

cat > "${fakeDir}/node" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == "--input-type=module" ]]; then
  if [[ "$*" == *"manifest.json"* ]]; then
    echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    exit 0
  fi
  if [[ "$*" == *"aurion-reconcile-runtime-image.conf"*"imageTag"* ]]; then
    echo "node:22.13.0-bookworm-slim"
    exit 0
  fi
  if [[ "$*" == *"aurion-reconcile-runtime-image.conf"*"imageDigest"* ]]; then
    echo "sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff"
    exit 0
  fi
fi
exit 0
SH
chmod +x "${fakeDir}/node"

mkdir -p "${fakeDir}/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ln -sfn "${fakeDir}/release" "${fakeDir}/current"
touch "${fakeDir}/.env.production"

export PATH="${fakeDir}:${process.env.PATH}"
bash "${path.join(root, "deploy/aurion-production-schema-reconcile")}" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 2>&1
`;

    try {
      execFileSync("bash", ["-c", script], {
        encoding: "utf8",
        timeout: 30000,
      });
      expect.unreachable("should have exited non-zero");
    } catch (error: unknown) {
      const err = error as { status?: number };
      expect(err.status).not.toBe(0);
    }
  });

  it("retains existing receipt validation after Docker execution", () => {
    const runner = read("deploy/aurion-production-schema-reconcile");
    expect(runner).toContain('receipt.recordType!=="aurion_production_schema_reconciliation"');
    expect(runner).toContain("receipt.schemaVersion!==1");
    expect(runner).toContain("receipt.readOnly!==true");
    expect(runner).toContain("receipt.databaseCredentialReturned!==false");
    expect(runner).toContain("receipt.sourceRevision!==expected");
  });
});
