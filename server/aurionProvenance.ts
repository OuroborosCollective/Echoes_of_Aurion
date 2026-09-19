import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AURION_ZONE_RULESET_VERSION } from "../shared/aurionCausalTickContract";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { AurionProvenance, ProvenanceObservation } from "../shared/aurionProvenanceContract";

const GIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function observedDigest(value: string | undefined): { value: string; status: ProvenanceObservation } {
  const normalized = value?.trim().toLowerCase();
  return normalized && SHA256.test(normalized)
    ? { value: normalized, status: "OBSERVED" }
    : { value: "UNVERIFIED", status: "UNVERIFIED" };
}

function fileSha256(relativePath: string): string {
  try {
    const fullPath = resolve(process.cwd(), relativePath);
    if (!existsSync(fullPath)) return "UNOBSERVABLE";
    return `sha256:${createHash("sha256").update(readFileSync(fullPath)).digest("hex")}`;
  } catch {
    return "UNOBSERVABLE";
  }
}

function runtimeBuildRevision(): string | null {
  const candidates = ["dist/.aurion-runtime-build.json", ".aurion-runtime-build.json"];
  for (const candidate of candidates) {
    try {
      const path = resolve(process.cwd(), candidate);
      if (!existsSync(path)) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { revision?: unknown };
      if (typeof parsed.revision === "string" && GIT_SHA.test(parsed.revision.toLowerCase())) return parsed.revision.toLowerCase();
    } catch {
      // Try the next authoritative build artifact location.
    }
  }
  return null;
}

export function computeRuntimeProvenance(): AurionProvenance {
  const envRevision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase();
  const manifestRevision = runtimeBuildRevision();
  const sourceRevision = envRevision && GIT_SHA.test(envRevision) ? envRevision : manifestRevision ?? "UNVERIFIED";
  const sourceObservation: ProvenanceObservation = sourceRevision === "UNVERIFIED" ? "UNVERIFIED" : "OBSERVED";

  const buildInput = observedDigest(process.env.AURION_BUILD_INPUT_DIGEST);
  const artifact = observedDigest(process.env.AURION_ARTIFACT_DIGEST);
  const image = observedDigest(process.env.AURION_RUNTIME_IMAGE_DIGEST);
  const buildTimestamp = process.env.AURION_BUILD_TIMESTAMP?.trim() || "UNVERIFIED";

  const rulesets = {
    movement: fileSha256("server/wasdZoneMovementProtocol.ts"),
    combat: fileSha256("server/wasdCombatDeltaProtocol.ts"),
    bladeSkills: fileSha256("shared/ax1BladeSkillProtocol.ts"),
    mobFsm: fileSha256("server/wasdMobFsmProtocol.ts"),
    intentContract: fileSha256("shared/aurionZoneIntentContract.ts"),
    tickContract: fileSha256("shared/aurionCausalTickContract.ts"),
  };

  const observation = {
    sourceRevision: sourceObservation,
    buildInputDigest: buildInput.status,
    artifactDigest: artifact.status,
    runtimeImageDigest: image.status,
  } as const;
  const authority = { ruleset: AURION_ZONE_RULESET_VERSION, tickHz: 10, causalReceipts: true };
  const dirty = process.env.AURION_DIRTY === "true" || sourceObservation !== "OBSERVED";
  const runtimeHash = canonicalSha256({
    sourceRevision,
    dirty,
    buildInputDigest: buildInput.value,
    artifactDigest: artifact.value,
    runtimeImageDigest: image.value,
    observation,
    authority,
    rulesets,
  });

  return {
    commit: sourceRevision,
    sourceRevision,
    dirty,
    buildTimestamp,
    buildInputDigest: buildInput.value,
    artifactDigest: artifact.value,
    runtimeImageDigest: image.value,
    observation,
    authority,
    rulesets,
    runtimeHash,
  };
}

export const activeProvenance: AurionProvenance = computeRuntimeProvenance();
