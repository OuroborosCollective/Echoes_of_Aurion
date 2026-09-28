import { createHash } from "node:crypto";
import {
  requireWolframCagClient,
  wolframCagConfigurationStatus,
  type WolframCagClient,
  type WolframCagEvidence,
} from "./wolframCag";
import { normalizeWolframComputeResult } from "./aurionCagDesignOracle";
import type { StructurePlacementResolution } from "@shared/deterministicStructurePlacementProtocol";

export const AURION_STRUCTURE_PLACEMENT_CAG_PROTOCOL =
  "aurion.structure-placement-cag.v1" as const;
export type StructurePlacementCagStatus =
  | "MATCH"
  | "FALSIFIED"
  | "NOT_CONFIGURED"
  | "PROVIDER_FAILED";
export type StructurePlacementCagVerification = Readonly<{
  protocol: typeof AURION_STRUCTURE_PLACEMENT_CAG_PROTOCOL;
  status: StructurePlacementCagStatus;
  rulesetPromotion: "ELIGIBLE" | "BLOCKED";
  resolutionHash: string;
  rulesetHash: string;
  requestSha256: string;
  responseSha256: string | null;
  expectedExact: string;
  observedExact: string | null;
  cagEvidence: WolframCagEvidence | null;
  mutationAuthority: "none";
  sourceBoundary: "bounded_structure_placement_summary";
}>;

function sha256(value: string): string {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}
function escapeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildStructurePlacementCagProbe(
  resolution: StructurePlacementResolution
): Readonly<{ code: string; expectedExact: string; requestSha256: string }> {
  const expectedExact = `{${resolution.placements.length},${resolution.rejections.length},${resolution.graphUpdates.length}}`;
  const payload = escapeString(
    JSON.stringify({
      resolutionHash: resolution.resolutionHash,
      rulesetHash: resolution.receipt.rulesetHash,
      accepted: resolution.placements.length,
      rejected: resolution.rejections.length,
      updates: resolution.graphUpdates.length,
    })
  );
  const code = [
    "Module[{accepted, rejected, updates},",
    ` accepted = ${resolution.placements.length};`,
    ` rejected = ${resolution.rejections.length};`,
    ` updates = ${resolution.graphUpdates.length};`,
    " {accepted, rejected, updates}",
    "]",
    `(* ${payload} *)`,
  ].join("\n");
  return Object.freeze({
    code,
    expectedExact,
    requestSha256: sha256("aurion.structure-placement-cag-request.v1::" + code),
  });
}

function parseSummary(value: string): string {
  const normalized = normalizeWolframComputeResult(value).replace(/\s+/g, "");
  if (!/^\{[0-9]+,[0-9]+,[0-9]+\}$/.test(normalized))
    throw new Error("STRUCTURE_PLACEMENT_CAG_RESULT_FORMAT");
  return normalized;
}

export async function verifyStructurePlacementWithCag(
  resolution: StructurePlacementResolution,
  options: Readonly<{
    client?: WolframCagClient;
    environment?: NodeJS.ProcessEnv;
  }> = {}
): Promise<StructurePlacementCagVerification> {
  const probe = buildStructurePlacementCagProbe(resolution);
  let client = options.client;
  if (!client) {
    const environment = options.environment ?? process.env;
    if (!wolframCagConfigurationStatus(environment).configured) {
      return Object.freeze({
        protocol: AURION_STRUCTURE_PLACEMENT_CAG_PROTOCOL,
        status: "NOT_CONFIGURED",
        rulesetPromotion: "BLOCKED",
        resolutionHash: resolution.resolutionHash,
        rulesetHash: resolution.receipt.rulesetHash,
        requestSha256: probe.requestSha256,
        responseSha256: null,
        expectedExact: probe.expectedExact,
        observedExact: null,
        cagEvidence: null,
        mutationAuthority: "none",
        sourceBoundary: "bounded_structure_placement_summary",
      });
    }
    try {
      client = requireWolframCagClient(environment);
    } catch {
      return Object.freeze({
        protocol: AURION_STRUCTURE_PLACEMENT_CAG_PROTOCOL,
        status: "PROVIDER_FAILED",
        rulesetPromotion: "BLOCKED",
        resolutionHash: resolution.resolutionHash,
        rulesetHash: resolution.receipt.rulesetHash,
        requestSha256: probe.requestSha256,
        responseSha256: null,
        expectedExact: probe.expectedExact,
        observedExact: null,
        cagEvidence: null,
        mutationAuthority: "none",
        sourceBoundary: "bounded_structure_placement_summary",
      });
    }
  }
  try {
    const evidence = await client.languageCompute({
      code: probe.code,
      timeConstraint: 10,
      maxChars: 512,
    });
    const observedExact = parseSummary(evidence.result);
    const status =
      observedExact === probe.expectedExact ? "MATCH" : "FALSIFIED";
    return Object.freeze({
      protocol: AURION_STRUCTURE_PLACEMENT_CAG_PROTOCOL,
      status,
      rulesetPromotion: status === "MATCH" ? "ELIGIBLE" : "BLOCKED",
      resolutionHash: resolution.resolutionHash,
      rulesetHash: resolution.receipt.rulesetHash,
      requestSha256: probe.requestSha256,
      responseSha256: evidence.responseSha256,
      expectedExact: probe.expectedExact,
      observedExact,
      cagEvidence: evidence,
      mutationAuthority: "none",
      sourceBoundary: "bounded_structure_placement_summary",
    });
  } catch {
    return Object.freeze({
      protocol: AURION_STRUCTURE_PLACEMENT_CAG_PROTOCOL,
      status: "PROVIDER_FAILED",
      rulesetPromotion: "BLOCKED",
      resolutionHash: resolution.resolutionHash,
      rulesetHash: resolution.receipt.rulesetHash,
      requestSha256: probe.requestSha256,
      responseSha256: null,
      expectedExact: probe.expectedExact,
      observedExact: null,
      cagEvidence: null,
      mutationAuthority: "none",
      sourceBoundary: "bounded_structure_placement_summary",
    });
  }
}
