import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function redact(text: string) {
  return text
    .replace(/authorization\s*:\s*[^\r\n]+/gi, "authorization: [redacted]")
    .replace(/cookie\s*:\s*[^\r\n]+/gi, "cookie: [redacted]")
    .replace(/set-cookie\s*:\s*[^\r\n]+/gi, "set-cookie: [redacted]")
    .replace(/(["']?(?:authorization|cookie|set-cookie|password)["']?\s*:\s*)["'][^"']*["']/gi, '$1"[redacted]"')
    .replace(/database_?url\s*=\s*[^\s]+/gi, "DATABASE_URL=[redacted]")
    .replace(/jwt_?secret\s*=\s*[^\s]+/gi, "JWT_SECRET=[redacted]");
}

async function copyRedacted(source: string, destination: string) {
  try {
    const text = await readFile(source, "utf8");
    await writeFile(destination, redact(text));
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(absolute);
    }
  }
  try { await visit(root); } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  return files;
}

async function sanitizeTrace(source: string, destination: string) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "aurion-playwright-trace-"));
  try {
    execFileSync("unzip", ["-qq", source, "-d", temp]);
    await rm(path.join(temp, "resources"), { recursive: true, force: true });
    for (const file of await walk(temp)) {
      if (path.basename(file).includes("network")) {
        await rm(file, { force: true });
        continue;
      }
      const bytes = await readFile(file);
      if (bytes.includes(0)) continue;
      await writeFile(file, redact(bytes.toString("utf8")));
    }
    execFileSync("zip", ["-qr", destination, "."], { cwd: temp });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function collectStarterVillageEvidence(args: {
  evidenceDir: string;
  playwrightDir: string;
  testResultsDir: string;
  revision: string;
}) {
  const { evidenceDir, playwrightDir, testResultsDir, revision } = args;
  const failureDir = path.join(evidenceDir, "failure-artifacts");
  await mkdir(failureDir, { recursive: true });

  await copyRedacted(path.join(testResultsDir, "starter-pilot-server-before.log"), path.join(evidenceDir, "server-before.log"));
  await copyRedacted(path.join(testResultsDir, "starter-pilot-server-after.log"), path.join(evidenceDir, "server-after.log"));
  try {
    const health = JSON.parse(await readFile(path.join(testResultsDir, "starter-pilot-health-before.json"), "utf8"));
    await writeFile(path.join(evidenceDir, "health-before.json"), JSON.stringify({
      schema: "aurion.starter-village-health.v1",
      revision,
      health,
    }, null, 2) + "\n");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  let traceIndex = 0;
  let screenshotIndex = 0;
  for (const file of await walk(playwrightDir)) {
    if (file.endsWith(".png")) {
      screenshotIndex += 1;
      await cp(file, path.join(failureDir, `playwright-failure-${screenshotIndex}.png`));
    } else if (path.basename(file) === "trace.zip") {
      traceIndex += 1;
      await sanitizeTrace(file, path.resolve(failureDir, `playwright-trace-${traceIndex}.sanitized.zip`));
    }
  }
  return { traceIndex, screenshotIndex };
}

if (process.argv[1]?.endsWith("collect-starter-village-evidence.ts")) {
  const [evidenceDir, playwrightDir, testResultsDir, revision] = process.argv.slice(2);
  if (!evidenceDir || !playwrightDir || !testResultsDir || !revision) throw new Error("EVIDENCE_COLLECT_ARGS_REQUIRED");
  console.log(JSON.stringify(await collectStarterVillageEvidence({ evidenceDir, playwrightDir, testResultsDir, revision })));
}
