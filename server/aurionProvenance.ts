import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { AurionProvenance } from "../shared/aurionProvenanceContract";

function fileSha256(relPath: string): string {
  try {
    const full = resolve(process.cwd(), relPath);
    if (existsSync(full)) {
      const content = readFileSync(full, "utf8");
      return canonicalSha256(content);
    }
  } catch {
    // fallback
  }
  return "sha256:0000000000000000000000000000000000000000000000000000000000000000";
}

export function computeRuntimeProvenance(): AurionProvenance {
  // Check if static pre-built provenance file exists
  const jsonPath = resolve(process.cwd(), "architecture/aurion-provenance.json");
  if (existsSync(jsonPath)) {
    try {
      const data = JSON.parse(readFileSync(jsonPath, "utf8"));
      return data;
    } catch {
      // fall through to dynamic computation
    }
  }

  const rulesets = {
    movement: fileSha256("server/wasdZoneMovementProtocol.ts"),
    combat: fileSha256("server/wasdCombatDeltaProtocol.ts"),
    bladeSkills: fileSha256("shared/ax1BladeSkillProtocol.ts"),
    mobFsm: fileSha256("server/wasdMobFsmProtocol.ts"),
    intentContract: fileSha256("shared/aurionZoneIntentContract.ts"),
    tickContract: fileSha256("shared/aurionCausalTickContract.ts"),
  };

  const commit = process.env.AURION_COMMIT || "local-head-c-aurion-endstate";
  const sourceRevision = process.env.AURION_RELEASE_SHA || commit;
  const dirty = Boolean(process.env.AURION_DIRTY ?? false);
  const buildTimestamp = "2026-09-16T12:00:00.000Z";
  const buildInputDigest = process.env.AURION_BUILD_INPUT_DIGEST || fileSha256("pnpm-lock.yaml");
  const artifactDigest = process.env.AURION_ARTIFACT_DIGEST || fileSha256("package.json");
  const runtimeImageDigest = process.env.AURION_RUNTIME_IMAGE_DIGEST || "sha256:553aad9a959999359289cf347f0e08cac5bdd8e1d47098c55b2a3bc2acc8f356";

  const authority = {
    ruleset: "aurion-zone-v3",
    tickHz: 10,
    causalReceipts: true,
  };

  const runtimeHash = canonicalSha256({
    commit,
    sourceRevision,
    dirty,
    buildInputDigest,
    rulesets,
  });

  return {
    commit,
    sourceRevision,
    dirty,
    buildTimestamp,
    buildInputDigest,
    artifactDigest,
    runtimeImageDigest,
    authority,
    rulesets,
    runtimeHash,
  };
}

export const activeProvenance: AurionProvenance = computeRuntimeProvenance();
