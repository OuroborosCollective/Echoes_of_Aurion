import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REQUIRED = { major: 22, minor: 5 };
const SOURCE_REPOSITORY = "https://github.com/theisegoria/game-development-studio.git";
const SOURCE_REVISION = "96a0b4f34b979279ab983e9547af43133e85f310";
const EXPECTED_PACKAGE = "@theisegoria/game-development-studio";
const EXPECTED_VERSION = "1.0.2";
const OUTPUT_DIR = resolve(process.cwd(), ".game-dev/workspace");
const RUNTIME_DIR = resolve(process.cwd(), ".game-dev/runtime");
const RUNTIME_RECEIPT = resolve(process.cwd(), ".game-dev/runtime-receipt.json");

function fail(message) {
  console.error(`[game-dev setup] ${message}`);
  process.exit(1);
}

function assertNodeVersion() {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < REQUIRED.major || (major === REQUIRED.major && minor < REQUIRED.minor)) {
    fail(`Node.js >= ${REQUIRED.major}.${REQUIRED.minor} is required; found ${process.versions.node}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout || ""}` : "";
    fail(`${command} ${args.join(" ")} exited ${result.status}${detail}`);
  }
  return options.capture ? (result.stdout || "").trim() : "";
}

function parseJson(name, output) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${name} did not return valid JSON`);
  }
}

assertNodeVersion();
mkdirSync(OUTPUT_DIR, { recursive: true });
rmSync(RUNTIME_DIR, { recursive: true, force: true });
mkdirSync(RUNTIME_DIR, { recursive: true });
const tempRoot = mkdtempSync(join(tmpdir(), "aurion-game-dev-"));
const sourceDir = join(tempRoot, "source");

try {
  console.log(`[game-dev setup] cloning pinned source ${SOURCE_REVISION}`);
  run("git", ["clone", "--filter=blob:none", "--no-checkout", SOURCE_REPOSITORY, sourceDir]);
  run("git", ["-C", sourceDir, "checkout", "--detach", SOURCE_REVISION]);

  const metadata = parseJson("source package.json", readFileSync(join(sourceDir, "package.json"), "utf8"));
  if (metadata?.name !== EXPECTED_PACKAGE || metadata?.version !== EXPECTED_VERSION) {
    fail(`pinned source identity mismatch: ${JSON.stringify({ name: metadata?.name, version: metadata?.version })}`);
  }

  run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: sourceDir });
  run("npm", ["run", "build"], { cwd: sourceDir });

  const packed = parseJson(
    "npm pack",
    run("npm", ["pack", "--ignore-scripts", "--json"], { cwd: sourceDir, capture: true }),
  );
  const tarballName = Array.isArray(packed) ? packed[0]?.filename : undefined;
  if (typeof tarballName !== "string" || !tarballName.endsWith(".tgz")) {
    fail(`npm pack did not return a tarball filename: ${JSON.stringify(packed)}`);
  }
  const tarball = join(sourceDir, tarballName);

  // Keep the developer-facing global CLI for CI/local workflows, while also
  // materializing an isolated production runtime tree that can be sealed into
  // Aurion's immutable image without resolving packages on the VPS.
  run("npm", ["install", "--global", "--ignore-scripts", tarball, "--no-audit", "--no-fund"]);
  run("npm", ["install", "--prefix", RUNTIME_DIR, "--ignore-scripts", "--omit=dev", tarball, "--no-audit", "--no-fund"]);

  const localGameDev = join(RUNTIME_DIR, "node_modules", ".bin", process.platform === "win32" ? "game-dev.cmd" : "game-dev");
  const versionOutput = run(localGameDev, ["--version"], { capture: true });
  if (!versionOutput.includes(EXPECTED_VERSION)) {
    fail(`expected staged game-dev ${EXPECTED_VERSION}; got ${JSON.stringify(versionOutput)}`);
  }

  const capabilities = parseJson("capabilities", run(localGameDev, ["capabilities", "--output-dir", OUTPUT_DIR, "--json"], { capture: true }));
  const doctor = parseJson("doctor", run(localGameDev, ["doctor", "--output-dir", OUTPUT_DIR, "--json"], { capture: true }));
  const receipt = {
    schemaVersion: 1,
    recordType: "aurion_game_development_studio_runtime",
    ok: true,
    package: EXPECTED_PACKAGE,
    sourceRepository: SOURCE_REPOSITORY,
    sourceRevision: SOURCE_REVISION,
    version: EXPECTED_VERSION,
    node: process.versions.node,
    runtimeDirectory: ".game-dev/runtime",
    outputDirectory: ".game-dev/workspace",
    capabilitiesSchema: capabilities?.schema ?? capabilities?.recordType ?? null,
    doctorSchema: doctor?.schema ?? doctor?.recordType ?? null,
    providerCalls: false,
  };
  writeFileSync(RUNTIME_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
