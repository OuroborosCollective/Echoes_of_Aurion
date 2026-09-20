import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  assuranceKeys,
  sealAssuranceSnapshot,
  verifyProductionAssuranceReceipt,
  verifyAssuranceSnapshot,
  type AssuranceKey,
  type AssuranceObservationStatus,
} from "../../shared/aurionAssuranceContract";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { chatGptAssuranceStatus } from "../chatgptCausalityBridge";
import { AurionAssuranceService, globalAssuranceService, type AssuranceProbe } from "./assuranceService";
import { globalTickRecorder } from "./tickRecorder";

function probes(overrides: Partial<Record<AssuranceKey, AssuranceObservationStatus>> = {}): AssuranceProbe[] {
  return [...assuranceKeys].reverse().map(key => {
    const status = overrides[key] ?? "MATCH";
    return { key, read: vi.fn(async () => ({ status, summary: `${key}_${status}`,
      evidenceHash: canonicalSha256({ key, status }), sampleCount: 1 })) };
  });
}

describe("continuous causal assurance", () => {
  it("seals one canonical complete healthy snapshot and rejects any tampering", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const snapshot = await new AurionAssuranceService(probes(), GLOBAL_WORLD_ID, () => 1_800_000_000_000).sample();
    expect(snapshot.status).toBe("HEALTHY");
    expect(snapshot.observations.map(value => value.key)).toEqual(assuranceKeys);
    expect(snapshot.recoveryPlan).toMatchObject({ triggerStatus: null, actions: [], destructiveActions: [],
      requiresHumanApproval: true, mutationAuthority: "none" });
    expect(verifyAssuranceSnapshot(snapshot)).toBe(true);
    const tampered = { ...snapshot, recoveryPlan: { ...snapshot.recoveryPlan,
      actions: ["REQUEST_OPERATOR_REVIEW"] } };
    expect(verifyAssuranceSnapshot(tampered as typeof snapshot)).toBe(false);
    expect(verifyAssuranceSnapshot({ ...snapshot, snapshotHash: canonicalSha256("tampered") })).toBe(false);
    log.mockRestore();
  });

  it("keeps contradiction dominant and emits only evidence-preserving human recovery actions", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const service = new AurionAssuranceService(probes({ BUILD_INPUT: "DEGRADED", SCHEMA: "UNVERIFIED",
      WORLD_ROOT: "CONTRADICTED" }), GLOBAL_WORLD_ID, () => 2);
    const snapshot = await service.sample();
    expect(snapshot.status).toBe("CONTRADICTED");
    expect(snapshot.recoveryPlan.actions).toEqual([
      "COLLECT_MISSING_EVIDENCE", "REPLAY_READ_ONLY_SAMPLE", "PRESERVE_CONTRADICTED_EVIDENCE",
      "PAUSE_PROMOTION", "REQUEST_OPERATOR_REVIEW",
    ]);
    expect(snapshot.recoveryPlan.preserveEvidenceHashes).toHaveLength(assuranceKeys.length);
    expect(snapshot.recoveryPlan.destructiveActions).toEqual([]);
    expect(snapshot.recoveryPlan.requiresHumanApproval).toBe(true);
    log.mockRestore();
  });

  it("maps probe exceptions to UNVERIFIED, coalesces concurrent sampling and bounds the measured baseline", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const set = probes();
    const first = set.find(probe => probe.key === assuranceKeys[0])!;
    const original = first.read;
    (first as { read: AssuranceProbe["read"] }).read = vi.fn(async () => { await gate; return original(); });
    let now = 10;
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const service = new AurionAssuranceService(set, GLOBAL_WORLD_ID, () => now++, 2);
    const a = service.sample(), b = service.sample();
    expect(a).toBe(b);
    release();
    await a;
    expect(first.read).toHaveBeenCalledTimes(1);
    await service.sample();
    await service.sample();
    expect(service.measuredBaseline()).toMatchObject({ samples: 2, counts: { HEALTHY: 2, DEGRADED: 0,
      UNVERIFIED: 0, CONTRADICTED: 0 }, healthyRate: 1, target: "UNSET_UNTIL_PRODUCTION_BASELINE",
      mutationAuthority: "none" });

    const failing = probes();
    (failing[0] as { read: AssuranceProbe["read"] }).read = vi.fn(async () => { throw Error("secret raw error"); });
    const unavailable = await new AurionAssuranceService(failing, GLOBAL_WORLD_ID, () => 20).sample();
    expect(unavailable.status).toBe("UNVERIFIED");
    expect(unavailable.observations.find(value => value.key === failing[0]!.key)).toMatchObject({
      status: "UNVERIFIED", summary: `${failing[0]!.key}_PROBE_FAILED`, evidenceHash: null,
    });
    expect(JSON.stringify(unavailable)).not.toContain("secret raw error");
    log.mockRestore();
  });

  it("keeps the ChatGPT assurance bridge read-only and cannot record causal state", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const snapshot = await new AurionAssuranceService(probes(), GLOBAL_WORLD_ID, () => 42).sample();
    log.mockRestore();
    const baseline = globalAssuranceService.measuredBaseline();
    const sample = vi.spyOn(globalAssuranceService, "sample").mockResolvedValue(snapshot);
    const measured = vi.spyOn(globalAssuranceService, "measuredBaseline").mockReturnValue(baseline);
    const enqueue = vi.spyOn(globalTickRecorder, "enqueueTick");
    const record = vi.spyOn(globalTickRecorder, "record");
    const recordTick = vi.spyOn(globalTickRecorder, "recordTick");
    try {
      const result = await chatGptAssuranceStatus();
      expect(result).toMatchObject({ protocol: "aurion.chatgpt.assurance-status.v1", mutationAuthority: "none",
        truthStatus: "VERIFIED", snapshot, measuredSloBaseline: baseline });
      expect(enqueue).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(recordTick).not.toHaveBeenCalled();
    } finally {
      sample.mockRestore();
      measured.mockRestore();
      enqueue.mockRestore();
      record.mockRestore();
      recordTick.mockRestore();
    }
  });

  it("samples continuously while started and does not restart after stop", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const set = probes(), first = set[0]!;
      const service = new AurionAssuranceService(set, GLOBAL_WORLD_ID, () => 30);
      service.start(10_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(first.read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(first.read).toHaveBeenCalledTimes(2);
      service.stop();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(first.read).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); vi.useRealTimers(); }
  });

  it("rejects incomplete or duplicate observation sets", () => {
    const observations = probes().map(probe => ({ key: probe.key, status: "MATCH" as const,
      summary: `${probe.key}_MATCH`, evidenceHash: canonicalSha256(probe.key), sampleCount: 1 }));
    expect(() => sealAssuranceSnapshot({ worldId: GLOBAL_WORLD_ID, sequence: 1, observedAtMs: 1,
      observations: observations.slice(1) })).toThrow("ASSURANCE_OBSERVATION_SET_INCOMPLETE");
    expect(() => sealAssuranceSnapshot({ worldId: GLOBAL_WORLD_ID, sequence: 1, observedAtMs: 1,
      observations: [observations[0]!, ...observations.slice(0, -1)] })).toThrow("ASSURANCE_OBSERVATION_SET_INVALID");
  });

  it("protects the live endpoint and keeps the CLI fail-closed without authenticated evidence", async () => {
    const caller = appRouter.createCaller({ req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"], user: null });
    await expect(caller.gameplay.assuranceStatus({ worldId: GLOBAL_WORLD_ID })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const env = { ...process.env };
    delete env.AURION_READBACK_SESSION;
    const unavailable = spawnSync(process.execPath, ["--import", "tsx", "scripts/read-aurion-assurance-status.ts",
      "--world", GLOBAL_WORLD_ID], { encoding: "utf8", env, timeout: 20_000 });
    expect(unavailable.status).toBe(2);
    expect(JSON.parse(unavailable.stdout)).toEqual({ mode: "authenticated-live-assurance", status: "UNVERIFIED",
      reason: "AUTHENTICATED_SESSION_UNAVAILABLE", mutationAuthority: "none" });
    const invalid = spawnSync(process.execPath, ["--import", "tsx", "scripts/read-aurion-assurance-status.ts"],
      { encoding: "utf8", env, timeout: 20_000 });
    expect(invalid.status).toBe(64);
  });

  it("joins only independently verified attestation and schema evidence into a production receipt", () => {
    const revision = "a".repeat(40);
    const identity = { sourceRevision: revision, mergeSha: revision,
      buildInputDigest: `sha256:${"1".repeat(64)}`, artifactDigest: `sha256:${"2".repeat(64)}`,
      runtimeImageDigest: `sha256:${"3".repeat(64)}`, releaseArchiveDigest: `sha256:${"4".repeat(64)}` };
    const evidence = (key: AssuranceKey) => key === "RUNTIME_REVISION" ? canonicalSha256({ sourceRevision: revision }) :
      key === "BUILD_INPUT" ? canonicalSha256({ digest: identity.buildInputDigest }) :
      key === "ARTIFACT" ? canonicalSha256({ digest: identity.artifactDigest }) :
      key === "RUNTIME_IMAGE" ? canonicalSha256({ digest: identity.runtimeImageDigest }) : canonicalSha256({ key });
    const runtime = sealAssuranceSnapshot({ worldId: GLOBAL_WORLD_ID, sequence: 7, observedAtMs: 123,
      observations: assuranceKeys.map(key => key === "ATTESTATION" || key === "SCHEMA"
        ? { key, status: "UNVERIFIED", summary: key === "ATTESTATION" ? "ATTESTATION_EXTERNAL_EVIDENCE_REQUIRED" : "SCHEMA_EXTERNAL_READBACK_REQUIRED", evidenceHash: null, sampleCount: 0 } as const
        : { key, status: "MATCH", summary: `${key}_MATCH`, evidenceHash: evidence(key), sampleCount: 1 } as const) });
    const health = { revision, ...identity, causalAssurance: runtime };
    const attestation = { gateId: "AURION-M21-B2-ATTESTATION", sourceRevision: revision, status: "PASS",
      checks: [{ name: "signed", pass: true }] };
    const schema = { sourceRevision: revision, state: "PRESENT_SCHEMA_MATCH", readOnly: true,
      databaseCredentialReturned: false, migrations: [{ tag: "0054", state: "PRESENT_SCHEMA_MATCH" }],
      summary: { migrationCount: 1, matchCount: 1, absentCount: 0, driftCount: 0 } };
    const directory = mkdtempSync(join(tmpdir(), "aurion-assurance-"));
    try {
      const files = { health, identity, attestation, schema };
      for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, `${name}.json`), JSON.stringify(value));
      const output = join(directory, "receipt.json");
      const args = ["scripts/aurion-production-assurance.mjs", "--health", join(directory, "health.json"),
        "--identity", join(directory, "identity.json"), "--attestation", join(directory, "attestation.json"),
        "--schema", join(directory, "schema.json"), "--expected-sha", revision, "--output", output];
      const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 20_000 });
      expect(result.status, result.stderr).toBe(0);
      const receipt = JSON.parse(readFileSync(output, "utf8"));
      expect(receipt.snapshot.status).toBe("HEALTHY");
      expect(receipt.snapshot.observations.find((value: any) => value.key === "ATTESTATION")).toMatchObject({ status: "MATCH", summary: "ATTESTATION_GATE_VERIFIED" });
      expect(receipt.snapshot.observations.find((value: any) => value.key === "SCHEMA")).toMatchObject({ status: "MATCH", summary: "SCHEMA_READBACK_MATCH" });
      expect(verifyProductionAssuranceReceipt(receipt)).toBe(true);

      writeFileSync(join(directory, "health.json"), JSON.stringify({ ...health, artifactDigest: `sha256:${"f".repeat(64)}` }));
      const damaged = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 20_000 });
      expect(damaged.status).toBe(2);
      expect(damaged.stderr).toContain("PRODUCTION_ASSURANCE_ARTIFACTDIGEST_MISMATCH");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
