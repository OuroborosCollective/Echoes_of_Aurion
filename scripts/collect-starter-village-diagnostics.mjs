import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [evidenceDir, playwrightDir, testResultsDir, revision] = process.argv.slice(2);
if (!evidenceDir || !playwrightDir || !testResultsDir || !/^[a-f0-9]{40}$/.test(revision ?? "")) {
  throw new Error("USAGE: collect-starter-village-diagnostics.mjs <evidence-dir> <playwright-dir> <test-results-dir> <revision>");
}

const redact = text => text
  .replace(/authorization\s*:\s*[^\r\n]+/gi, "authorization: [redacted]")
  .replace(/cookie\s*:\s*[^\r\n]+/gi, "cookie: [redacted]")
  .replace(/set-cookie\s*:\s*[^\r\n]+/gi, "set-cookie: [redacted]")
  .replace(/(["']?(?:authorization|cookie|set-cookie|password)["']?\s*:\s*)["'][^"']*["']/gi, '$1"[redacted]"')
  .replace(/database_?url\s*=\s*[^\s]+/gi, "DATABASE_URL=[redacted]")
  .replace(/jwt_?secret\s*=\s*[^\s]+/gi, "JWT_SECRET=[redacted]");

fs.mkdirSync(evidenceDir, { recursive: true });
const failureDir = path.join(evidenceDir, "failure-artifacts");
fs.mkdirSync(failureDir, { recursive: true });

for (const [sourceName, targetName] of [
  ["starter-pilot-server-before.log", "server-before.log"],
  ["starter-pilot-server-after.log", "server-after.log"],
]) {
  const source = path.join(testResultsDir, sourceName);
  if (fs.existsSync(source)) fs.writeFileSync(path.join(evidenceDir, targetName), redact(fs.readFileSync(source, "utf8")));
}

const healthSource = path.join(testResultsDir, "starter-pilot-health-before.json");
if (fs.existsSync(healthSource)) {
  const health = JSON.parse(fs.readFileSync(healthSource, "utf8"));
  fs.writeFileSync(path.join(evidenceDir, "health-before.json"), JSON.stringify({
    schema: "aurion.starter-village-health.v1",
    revision,
    health,
  }, null, 2) + "\n");
}

const walk = root => {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else out.push(absolute);
    }
  };
  visit(root);
  return out;
};

let screenshotIndex = 0;
let traceIndex = 0;
for (const file of walk(playwrightDir)) {
  if (file.endsWith(".png")) {
    screenshotIndex += 1;
    fs.copyFileSync(file, path.join(failureDir, `playwright-failure-${screenshotIndex}.png`));
    continue;
  }
  if (path.basename(file) !== "trace.zip") continue;

  traceIndex += 1;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "starter-trace-"));
  try {
    execFileSync("unzip", ["-qq", file, "-d", temp]);
    fs.rmSync(path.join(temp, "resources"), { recursive: true, force: true });
    const target = path.join(failureDir, `trace-${traceIndex}`);
    fs.mkdirSync(target, { recursive: true });

    for (const traceFile of walk(temp)) {
      const base = path.basename(traceFile).toLowerCase();
      if (base.includes("network")) continue;
      const rel = path.relative(temp, traceFile);
      const dest = path.join(target, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const bytes = fs.readFileSync(traceFile);
      if (bytes.includes(0)) continue;
      fs.writeFileSync(dest, redact(bytes.toString("utf8")));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  schema: "aurion.starter-village-diagnostics-collection.v1",
  revision,
  screenshots: screenshotIndex,
  traces: traceIndex,
}));
