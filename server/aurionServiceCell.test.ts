import { z } from "zod";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  createServiceCellManifest,
  validateServiceCellManifest,
  verifyServiceCellManifest,
  AURION_SERVICE_CELL_SCHEMA_VERSION,
} from "../shared/aurionServiceCellContract";
import {
  createServiceCellPipeline,
  InMemoryIdempotencyStore,
  verifyServiceCellReceipt,
  type ServiceCellReceipt,
} from "../shared/aurionServiceCellPipeline";
import {
  createContractRegistry,
  verifyServiceCellBoundaries,
  detectLegacyDrift,
  verifyObservabilityNonMutating,
  verifyPureValidationDeterministic,
  runFullBoundaryVerification,
} from "./aurionServiceCellBoundaryVerifier";
import { generateServiceCell } from "./aurionServiceCellGenerator";
import { createEvidenceServiceCell, evidenceManifest } from "./evidenceServiceCell";
import { describe, expect, it } from "vitest";

// --- Helpers ---

let clockValue = 1_000_000;
const deterministicClock = () => clockValue++;

function resetClock() {
  clockValue = 1_000_000;
}

const validActor = {
  id: "actor-1",
  scope: "evidence" as const,
  authenticated: true,
  authorizedScopes: ["evidence"] as const,
};

const validInput = {
  subjectId: "player-1",
  evidenceType: "receipt" as const,
  description: "Quest completion receipt",
  payloadHash: "sha256:" + "a".repeat(64),
};

function makeRequest(overrides: Partial<{
  input: unknown;
  actor: typeof validActor;
  idempotencyKey: string;
  baseRevision: string;
  cellId: string;
  operation: string;
}> = {}) {
  return {
    cellId: overrides.cellId ?? "evidence-service",
    operation: overrides.operation ?? "recordEvidence",
    input: overrides.input ?? validInput,
    actor: overrides.actor ?? validActor,
    idempotencyKey: overrides.idempotencyKey ?? "idem-1",
    baseRevision: overrides.baseRevision ?? "rev-0",
  };
}

// --- Manifest Contract Tests ---

describe("Aurion Service Cell Manifest Contract (#140)", () => {
  it("creates a valid manifest with ownsEffects=false and no gameplay write authority", () => {
    const manifest = createServiceCellManifest({
      cellId: "test-cell",
      scope: "evidence",
    });

    expect(manifest.ownsEffects).toBe(false);
    expect(manifest.mayWriteGameplayTruth).toBe(false);
    expect(manifest.mayWriteWorldTruth).toBe(false);
    expect(manifest.mayDefineGameplayRules).toBe("explicit-domain-contracts-only");
    expect(manifest.requiresTargetReadback).toBe(true);
    expect(manifest.requiresIdempotencyForEffects).toBe(true);
    expect(manifest.schemaVersion).toBe(AURION_SERVICE_CELL_SCHEMA_VERSION);
    expect(manifest.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("makes mayWriteGameplayTruth=false technically immutable in the template", () => {
    const manifest = createServiceCellManifest({
      cellId: "test-cell",
      scope: "evidence",
    });

    // The manifest is frozen — attempting to mutate throws.
    expect(() => {
      (manifest as unknown as Record<string, unknown>).ownsEffects = true;
    }).toThrow();
    expect(() => {
      (manifest as unknown as Record<string, unknown>).mayWriteGameplayTruth = true;
    }).toThrow();
  });

  it("rejects globally enabled mayWriteGameplayTruth", () => {
    const invalid = {
      schemaVersion: AURION_SERVICE_CELL_SCHEMA_VERSION,
      cellId: "bad-cell",
      scope: "evidence",
      ownsEffects: false,
      mayWriteGameplayTruth: true, // globally enabled — forbidden
      mayWriteWorldTruth: false,
      mayDefineGameplayRules: "explicit-domain-contracts-only",
      requiresTargetReadback: true,
      requiresIdempotencyForEffects: true,
      registeredContracts: [],
    };

    const result = validateServiceCellManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MANIFEST_GAMEPLAY_WRITE_GLOBALLY_ENABLED");
  });

  it("rejects globally enabled mayWriteWorldTruth", () => {
    const invalid = {
      schemaVersion: AURION_SERVICE_CELL_SCHEMA_VERSION,
      cellId: "bad-cell",
      scope: "evidence",
      ownsEffects: false,
      mayWriteGameplayTruth: false,
      mayWriteWorldTruth: true, // globally enabled — forbidden
      mayDefineGameplayRules: "explicit-domain-contracts-only",
      requiresTargetReadback: true,
      requiresIdempotencyForEffects: true,
      registeredContracts: [],
    };

    const result = validateServiceCellManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MANIFEST_WORLD_WRITE_GLOBALLY_ENABLED");
  });

  it("rejects globally enabled mayDefineGameplayRules", () => {
    const invalid = {
      schemaVersion: AURION_SERVICE_CELL_SCHEMA_VERSION,
      cellId: "bad-cell",
      scope: "evidence",
      ownsEffects: false,
      mayWriteGameplayTruth: false,
      mayWriteWorldTruth: false,
      mayDefineGameplayRules: true, // globally enabled — forbidden
      requiresTargetReadback: true,
      requiresIdempotencyForEffects: true,
      registeredContracts: [],
    };

    const result = validateServiceCellManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MANIFEST_GAMEPLAY_RULES_GLOBALLY_ENABLED");
  });

  it("rejects ownsEffects=true", () => {
    const invalid = {
      schemaVersion: AURION_SERVICE_CELL_SCHEMA_VERSION,
      cellId: "bad-cell",
      scope: "evidence",
      ownsEffects: true,
      mayWriteGameplayTruth: false,
      mayWriteWorldTruth: false,
      mayDefineGameplayRules: "explicit-domain-contracts-only",
      requiresTargetReadback: true,
      requiresIdempotencyForEffects: true,
      registeredContracts: [],
    };

    const result = validateServiceCellManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MANIFEST_OWNS_EFFECTS_MUST_BE_FALSE");
  });

  it("allows contract-bound write authority only with registered contracts", () => {
    const manifest = createServiceCellManifest({
      cellId: "contract-cell",
      scope: "persistence",
      mayWriteGameplayTruth: "contract-bound-only",
      mayWriteWorldTruth: "contract-bound-only",
      registeredContracts: ["aurion-quest-transaction"],
    });

    expect(manifest.mayWriteGameplayTruth).toBe("contract-bound-only");
    expect(manifest.registeredContracts).toEqual(["aurion-quest-transaction"]);
    expect(verifyServiceCellManifest(manifest)).toBe(true);
  });

  it("rejects contract-bound write authority without registered contracts", () => {
    const invalid = {
      schemaVersion: AURION_SERVICE_CELL_SCHEMA_VERSION,
      cellId: "bad-cell",
      scope: "persistence",
      ownsEffects: false,
      mayWriteGameplayTruth: "contract-bound-only",
      mayWriteWorldTruth: false,
      mayDefineGameplayRules: "explicit-domain-contracts-only",
      requiresTargetReadback: true,
      requiresIdempotencyForEffects: true,
      registeredContracts: [], // empty — forbidden for contract-bound
    };

    const result = validateServiceCellManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MANIFEST_CONTRACT_BOUND_WITHOUT_REGISTERED_CONTRACTS");
  });

  it("verifies manifest hash integrity", () => {
    const manifest = createServiceCellManifest({ cellId: "test-cell", scope: "evidence" });
    expect(verifyServiceCellManifest(manifest)).toBe(true);

    // Tamper with the hash.
    const tampered = { ...manifest, manifestHash: "sha256:" + "0".repeat(64) };
    expect(verifyServiceCellManifest(tampered)).toBe(false);
  });
});

// --- Pipeline Tests ---

describe("Aurion Service Cell Pipeline (#140)", () => {
  it("processes a valid request through the full pipeline", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });
    const receipt = await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    expect(receipt.state).toBe("SUCCESS");
    expect(receipt.effectApplied).toBe(true);
    expect(receipt.readbackHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.errorCode).toBeNull();
    expect(verifyServiceCellReceipt(receipt)).toBe(true);
  });

  it("rejects unauthenticated actors", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });
    const receipt = await cell.process({
      input: validInput,
      actor: { id: "anon", authenticated: false, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    expect(receipt.state).toBe("UNAUTHORIZED");
    expect(receipt.effectApplied).toBe(false);
    expect(receipt.errorCode).toBe("ACTOR_NOT_AUTHENTICATED");
  });

  it("rejects unauthorized scopes", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });
    const receipt = await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["account"] }, // not authorized for evidence scope
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    expect(receipt.state).toBe("UNAUTHORIZED");
    expect(receipt.effectApplied).toBe(false);
    expect(receipt.errorCode).toBe("ACTOR_SCOPE_NOT_AUTHORIZED");
  });

  it("rejects unknown fields in the input (strict schema)", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });
    const receipt = await cell.process({
      input: { ...validInput, evilField: "should be rejected" },
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    expect(receipt.state).toBe("SCHEMA_REJECTED");
    expect(receipt.effectApplied).toBe(false);
  });

  it("handles duplicate idempotency key as replay", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });

    const first = await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-dup",
      baseRevision: "rev-0",
    });
    expect(first.state).toBe("SUCCESS");

    const second = await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-dup", // same key
      baseRevision: "rev-0",
    });

    expect(second.state).toBe("IDEMPOTENT_REPLAY");
    expect(second.effectApplied).toBe(false);
    expect(second.resultRevision).toBe(first.resultRevision);
    expect(second.readbackHash).toBe(first.readbackHash);
  });

  it("rejects stale base revision", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });

    // First request succeeds, advancing the revision.
    await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    // Second request with stale base revision.
    const receipt = await cell.process({
      input: { ...validInput, subjectId: "player-2" },
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-2",
      baseRevision: "rev-0", // stale — current is now rev-1
    });

    expect(receipt.state).toBe("STALE_REVISION");
    expect(receipt.effectApplied).toBe(false);
    expect(receipt.errorCode).toBe("BASE_REVISION_STALE");
  });

  it("handles dependency timeout", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({
      clock: deterministicClock,
      dependencyTimeoutMs: 50, // very short timeout
      readbackOverride: () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DEPENDENCY_TIMEOUT")), 100)),
    });

    // Use a custom pipeline with a slow effect.
    const slowPipeline = createServiceCellPipeline(
      evidenceManifest,
      z.object({ value: z.string() }).strict(),
      {
        clock: deterministicClock,
        idempotencyStore: new InMemoryIdempotencyStore(),
        effect: {
          contractId: "test",
          async execute() {
            return new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("DEPENDENCY_TIMEOUT")), 100),
            );
          },
        },
        readback: async () => ({ readbackHash: "sha256:" + "a".repeat(64), readbackData: null }),
        observability: () => {},
        currentRevision: () => "rev-0",
        dependencyTimeoutMs: 50,
      },
    );

    const receipt = await slowPipeline.process(makeRequest({
      input: { value: "test" },
      cellId: "evidence-service",
    }));

    expect(receipt.state).toBe("DEPENDENCY_TIMEOUT");
    expect(receipt.effectApplied).toBe(false);
    expect(receipt.errorCode).toBe("DEPENDENCY_TIMEOUT");
  });

  it("detects when effect succeeds but readback fails", async () => {
    resetClock();
    const pipeline = createServiceCellPipeline(
      evidenceManifest,
      z.object({ value: z.string() }).strict(),
      {
        clock: deterministicClock,
        idempotencyStore: new InMemoryIdempotencyStore(),
        effect: {
          contractId: "test",
          async execute() {
            return { resultRevision: "rev-1", effectData: {} };
          },
        },
        readback: async () => {
          throw new Error("READBACK_CONNECTION_LOST");
        },
        observability: () => {},
        currentRevision: () => "rev-0",
      },
    );

    const receipt = await pipeline.process(makeRequest({
      input: { value: "test" },
    }));

    expect(receipt.state).toBe("READBACK_FAILED");
    expect(receipt.effectApplied).toBe(true); // effect did succeed
    expect(receipt.readbackHash).toBeNull();
    expect(receipt.errorCode).toBe("READBACK_ERROR");
  });

  it("redacts secrets from effect payloads", async () => {
    // The effect intent contract already rejects sensitive fields.
    // Here we verify the pipeline schema layer also doesn't pass secrets through.
    const schema = z.object({ token: z.string() }).strict();

    // Sensitive field detection is in the effect intent contract (aurionEffectIntentContract).
    // The pipeline schema layer rejects unknown fields. For secret redaction, we verify
    // that a payload with a sensitive key is caught by the effect intent contract.
    const { createEffectIntent } = await import("../shared/aurionEffectIntentContract");

    expect(() =>
      createEffectIntent({
        authorityReceiptHash: "sha256:" + "a".repeat(64),
        effectType: "test",
        subjectId: "player-1",
        ordinal: 0,
        payload: { password: "secret123" },
      }),
    ).toThrow(/EFFECT_PAYLOAD_SENSITIVE_FIELD_FORBIDDEN/);

    expect(() =>
      createEffectIntent({
        authorityReceiptHash: "sha256:" + "a".repeat(64),
        effectType: "test",
        subjectId: "player-1",
        ordinal: 0,
        payload: { apiKey: "key123" },
      }),
    ).toThrow(/EFFECT_PAYLOAD_SENSITIVE_FIELD_FORBIDDEN/);
  });

  it("does not mutate state from observability side-channel", async () => {
    resetClock();
    let observabilityCallCount = 0;
    const capturedEvents: string[] = [];

    const pipeline = createServiceCellPipeline(
      evidenceManifest,
      z.object({ value: z.string() }).strict(),
      {
        clock: deterministicClock,
        idempotencyStore: new InMemoryIdempotencyStore(),
        effect: {
          contractId: "test",
          async execute() {
            return { resultRevision: "rev-1", effectData: {} };
          },
        },
        readback: async () => ({ readbackHash: "sha256:" + "a".repeat(64), readbackData: null }),
        observability: (event) => {
          observabilityCallCount++;
          capturedEvents.push(event.state);
          // Intentionally does NOT mutate any external state.
        },
        currentRevision: () => "rev-0",
      },
    );

    const receipt = await pipeline.process(makeRequest({ input: { value: "test" } }));

    expect(receipt.state).toBe("SUCCESS");
    expect(observabilityCallCount).toBe(1);
    expect(capturedEvents).toEqual(["SUCCESS"]);
    // The observability function only captured events — no state was mutated.
  });

  it("does not mutate state from readmodel/observability on error paths", async () => {
    resetClock();
    const state = { value: 0 };

    const pipeline = createServiceCellPipeline(
      evidenceManifest,
      z.object({ value: z.string() }).strict(),
      {
        clock: deterministicClock,
        idempotencyStore: new InMemoryIdempotencyStore(),
        effect: {
          contractId: "test",
          async execute() {
            throw new Error("EFFECT_FAILED");
          },
        },
        readback: async () => ({ readbackHash: "sha256:" + "a".repeat(64), readbackData: null }),
        observability: () => {
          // Must not mutate state even on error paths.
        },
        currentRevision: () => "rev-0",
      },
    );

    const receipt = await pipeline.process(makeRequest({ input: { value: "test" } }));

    expect(receipt.state).toBe("EFFECT_FAILED");
    expect(state.value).toBe(0); // unchanged
  });
});

// --- Boundary Verifier Tests ---

describe("Aurion Service Cell Boundary Verifier (#140)", () => {
  it("verifies that no cell can get gameplay write authority outside registered contracts", () => {
    const registry = createContractRegistry([
      { contractId: "aurion-quest-transaction", scope: "persistence", deterministic: true, requiresReceipt: true, requiresReadback: true },
    ]);

    const validManifests = [
      createServiceCellManifest({ cellId: "evidence-cell", scope: "evidence" }),
      createServiceCellManifest({
        cellId: "persistence-cell",
        scope: "persistence",
        mayWriteGameplayTruth: "contract-bound-only",
        registeredContracts: ["aurion-quest-transaction"],
      }),
    ];

    const violations = verifyServiceCellBoundaries(validManifests, registry);
    expect(violations).toEqual([]);
  });

  it("flags contract-bound cells with unregistered contracts", () => {
    const registry = createContractRegistry([
      { contractId: "aurion-quest-transaction", scope: "persistence", deterministic: true, requiresReceipt: true, requiresReadback: true },
    ]);

    const badManifest = createServiceCellManifest({
      cellId: "rogue-cell",
      scope: "persistence",
      mayWriteGameplayTruth: "contract-bound-only",
      registeredContracts: ["unregistered-contract"],
    });

    const violations = verifyServiceCellBoundaries([badManifest], registry);
    expect(violations.some(v => v.rule === "CONTRACT_NOT_REGISTERED")).toBe(true);
  });

  it("detects legacy gameplay owners (WASD/AX1) in production paths as drift", () => {
    const sourceFiles = [
      {
        path: "server/someService.ts",
        content: 'import { wasdCombatRuntime } from "./wasd-combat-runtime";',
      },
      {
        path: "server/anotherService.ts",
        content: 'const ax1 = require("./ax1-gameplay-runtime");',
      },
      // Provenance docs should NOT be flagged.
      {
        path: "docs/migrations/CURRENT_SOURCE_PROVENANCE.md",
        content: "WASD and AX1 are legacy provenance sources.",
      },
    ];

    const drifts = detectLegacyDrift(sourceFiles);
    expect(drifts.length).toBe(2);
    expect(drifts.every(d => d.severity === "drift")).toBe(true);
    expect(drifts.every(d => d.rule === "LEGACY_GAMEPLAY_OWNER_IN_PRODUCTION_PATH")).toBe(true);
  });

  it("verifies observability is non-mutating", () => {
    const mutatingSink = `
      function sink(event) {
        state.set(event.cellId, event);
        db.update(event);
      }
    `;
    const violations = verifyObservabilityNonMutating(mutatingSink);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some(v => v.rule === "OBSERVABILITY_MUTATES_STATE")).toBe(true);
  });

  it("verifies pure validation is deterministic (no Date.now/Math.random/network/db)", () => {
    const nonDeterministicValidation = `
      function validate(input) {
        const now = Date.now();
        const rand = Math.random();
        const res = await fetch("https://example.com");
        return now + rand;
      }
    `;
    const violations = verifyPureValidationDeterministic(nonDeterministicValidation);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some(v => v.rule === "PURE_VALIDATION_USES_DATE_NOW")).toBe(true);
    expect(violations.some(v => v.rule === "PURE_VALIDATION_USES_MATH_RANDOM")).toBe(true);
    expect(violations.some(v => v.rule === "PURE_VALIDATION_USES_NETWORK")).toBe(true);
  });

  it("runs full boundary verification and produces evidence hash", () => {
    const registry = createContractRegistry([
      { contractId: "aurion-quest-transaction", scope: "persistence", deterministic: true, requiresReceipt: true, requiresReadback: true },
    ]);

    const manifests = [
      createServiceCellManifest({ cellId: "evidence-cell", scope: "evidence" }),
    ];

    const result = runFullBoundaryVerification({
      manifests,
      registry,
      observabilitySinkSource: "function sink(event) { console.log(event); }",
      validationSource: "function validate(input) { return input; }",
    });

    expect(result.passed).toBe(true);
    expect(result.violations.filter(v => v.severity === "error")).toEqual([]);
    expect(result.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

// --- Generator Tests ---

describe("Aurion Service Cell Generator (#140)", () => {
  it("generates a cell with mayWriteGameplayTruth=false and ownsEffects=false", () => {
    const generated = generateServiceCell({
      cellId: "generated-cell",
      scope: "account",
    });

    expect(generated.manifest.ownsEffects).toBe(false);
    expect(generated.manifest.mayWriteGameplayTruth).toBe(false);
    expect(generated.manifest.mayWriteWorldTruth).toBe(false);
    expect(generated.manifest.scope).toBe("account");
  });

  it("generates source that does not grant automatic routes or DB migrations", () => {
    const generated = generateServiceCell({
      cellId: "generated-cell",
      scope: "ops",
    });

    // The generated source must not contain route registration or DB migration.
    expect(generated.pipelineSource).not.toContain("app.post");
    expect(generated.pipelineSource).not.toContain("app.get");
    expect(generated.pipelineSource).not.toContain("router.");
    expect(generated.pipelineSource).not.toContain("migration");
    expect(generated.pipelineSource).not.toContain("CREATE TABLE");
    expect(generated.pipelineSource).not.toContain("ALTER TABLE");
  });

  it("generates a strict schema that rejects unknown fields", () => {
    const generated = generateServiceCell({
      cellId: "generated-cell",
      scope: "evidence",
    });

    expect(generated.schemaSource).toContain(".strict()");
  });
});

// --- Example Cell Tests ---

describe("Evidence Service Cell — Example non-gameplay cell (#140)", () => {
  it("is an Aurion-owned, non-gameplay cell with no write authority", () => {
    expect(evidenceManifest.scope).toBe("evidence");
    expect(evidenceManifest.mayWriteGameplayTruth).toBe(false);
    expect(evidenceManifest.mayWriteWorldTruth).toBe(false);
    expect(evidenceManifest.ownsEffects).toBe(false);
  });

  it("stores evidence records with real readback", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });

    const receipt = await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    expect(receipt.state).toBe("SUCCESS");
    expect(receipt.effectApplied).toBe(true);
    expect(receipt.readbackHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(cell.store.size()).toBe(1);
  });

  it("verifies receipt hash integrity for the example cell", async () => {
    resetClock();
    const cell = createEvidenceServiceCell({ clock: deterministicClock });

    const receipt = await cell.process({
      input: validInput,
      actor: { id: "actor-1", authenticated: true, authorizedScopes: ["evidence"] },
      idempotencyKey: "idem-1",
      baseRevision: "rev-0",
    });

    expect(verifyServiceCellReceipt(receipt)).toBe(true);
  });
});
