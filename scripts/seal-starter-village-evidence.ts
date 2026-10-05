import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type Outcome = "success" | "failure" | "cancelled" | "skipped";

async function listFiles(root: string) {
  const files: string[] = [];
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return files.sort();
}

function hash(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sealStarterVillageEvidence(args: {
  evidenceDir: string;
  revision: string;
  phases: {
    journey: Outcome;
    restart: Outcome;
    diagnostic: Outcome;
    publicCharacter: Outcome;
    fountain: Outcome;
    browser: Outcome;
  };
}) {
  const { evidenceDir, revision, phases } = args;
  await rm(path.join(evidenceDir, "session.json"), { force: true });
  await writeFile(path.join(evidenceDir, "REVISION"), `${revision}  revision\n`);

  const values = Object.values(phases);
  const status = values.every(value => value === "success")
    ? "PASS"
    : values.some(value => value === "failure" || value === "cancelled")
      ? "FAIL"
      : "PARTIAL";

  const failureRoot = path.join(evidenceDir, "failure-artifacts");
  let failureArtifacts: string[] = [];
  try {
    failureArtifacts = (await readdir(failureRoot)).sort().map(name => `failure-artifacts/${name}`);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  await writeFile(path.join(evidenceDir, "manifest.json"), JSON.stringify({
    schema: "aurion.starter-village-evidence-manifest.v1",
    revision,
    status,
    phases,
    failureArtifacts,
  }, null, 2) + "\n");

  const files = (await listFiles(evidenceDir)).filter(file => file !== "SHA256SUMS");
  const sums: string[] = [];
  for (const file of files) {
    sums.push(`${hash(await readFile(path.join(evidenceDir, file)))}  ${file}`);
  }
  await writeFile(path.join(evidenceDir, "SHA256SUMS"), sums.join("\n") + "\n");
  return { status, files: files.length, failureArtifacts };
}

if (process.argv[1]?.endsWith("seal-starter-village-evidence.ts")) {
  const [evidenceDir, revision, journey, restart, diagnostic, publicCharacter, fountain, browser] = process.argv.slice(2);
  if (!evidenceDir || !revision || !journey || !restart || !diagnostic || !publicCharacter || !fountain || !browser) {
    throw new Error("EVIDENCE_SEAL_ARGS_REQUIRED");
  }
  console.log(JSON.stringify(await sealStarterVillageEvidence({
    evidenceDir,
    revision,
    phases: {
      journey: journey as Outcome,
      restart: restart as Outcome,
      diagnostic: diagnostic as Outcome,
      publicCharacter: publicCharacter as Outcome,
      fountain: fountain as Outcome,
      browser: browser as Outcome,
    },
  })));
}
