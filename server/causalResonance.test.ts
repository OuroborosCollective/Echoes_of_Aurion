import { describe, it, expect } from "vitest";
import {
  generateExpeditionCertificate,
  verifyExpeditionCertificate,
  deriveCertificateRank,
  deriveGlyphSignature,
  deriveStabilityIndex,
  getCausalResonanceEchoes,
} from "./causalResonanceService";
import {
  evaluateMobileResourcePlan,
  classifyInterestRing,
  calculateVramForLod,
  integerDistanceMm,
  MAX_MOBILE_VRAM_BYTES,
  MobileAssetDescriptor,
} from "../shared/mobileResourceBudget";
import {
  listCivicProjects,
  recordCivicContribution,
} from "./civicContributionPersistence";

describe("Causal Resonance & Expedition Certificates (Determinism & Cryptographic Proof)", () => {
  const sampleInput = {
    expeditionKey: "cinder_vault_depths",
    userId: 42,
    seedDigest: "a0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff",
    resultDigest: "11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff",
    tickCount: 280,
    receiptHash: "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef",
  };

  it("produces identical certificate output across multiple independent executions (strictly deterministic)", () => {
    const cert1 = generateExpeditionCertificate(sampleInput);
    const cert2 = generateExpeditionCertificate(sampleInput);

    expect(cert1).toEqual(cert2);
    expect(cert1.rank).toBe("A");
    expect(cert1.verifiableProofHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(cert1.glyphSignature).toBeTruthy();
  });

  it("verifies authentic certificates and detects tampering", () => {
    const cert = generateExpeditionCertificate(sampleInput);
    expect(verifyExpeditionCertificate(cert)).toBe(true);

    // Tampered tick count
    const tampered = { ...cert, tickCount: cert.tickCount + 1 };
    expect(verifyExpeditionCertificate(tampered)).toBe(false);

    // Tampered rank
    const tamperedRank = { ...cert, rank: "D" as const };
    expect(verifyExpeditionCertificate(tamperedRank)).toBe(false);

    // Tampered receiptHash
    const tamperedReceipt = { ...cert, receiptHash: "0000000000000000000000000000000000000000000000000000000000000000" };
    expect(verifyExpeditionCertificate(tamperedReceipt)).toBe(false);
  });

  it("derives deterministic ranks matching thresholds without clocks or random numbers", () => {
    // low ticks
    expect(deriveCertificateRank(100, "0000000000000000000000000000000000000000000000000000000000000000")).toBe("S");
    // moderate ticks
    expect(deriveCertificateRank(500, "0000000000000000000000000000000000000000000000000000000000000000")).toBe("A");
    // high ticks
    expect(deriveCertificateRank(950, "0000000000000000000000000000000000000000000000000000000000000000")).toBe("B");
    // very high ticks
    expect(deriveCertificateRank(2000, "0000000000000000000000000000000000000000000000000000000000000000")).toBe("D");
  });

  it("generates companion resonance echoes deterministically", async () => {
    const echoes1 = await getCausalResonanceEchoes({
      zoneId: "observatory_threshold",
      encounterOrQuestKey: "vanguard_confrontation",
      targetTick: 1200,
      limit: 3,
    });

    const echoes2 = await getCausalResonanceEchoes({
      zoneId: "observatory_threshold",
      encounterOrQuestKey: "vanguard_confrontation",
      targetTick: 1200,
      limit: 3,
    });

    expect(echoes1).toHaveLength(3);
    expect(echoes1).toEqual(echoes2);
    expect(echoes1[0].stabilityScore).toBeGreaterThanOrEqual(600);
    expect(echoes1[0].stabilityScore).toBeLessThan(1000);
    expect(echoes1[0].glyphSignature).toMatch(/^GLYPH-OBSERVATORY_THRESHOLD-[A-F0-9]{8}$/);
  });
});

describe("Mobile Resource Governor (WebGL2 250MB Ceiling & Distance Rings)", () => {
  it("calculates integer distances without floating point jitter", () => {
    const dist1 = integerDistanceMm(0, 0, 30000, 40000);
    // dx=30000, dz=40000 -> max(40000) + (30000 * 3 / 8) = 40000 + 11250 = 51250
    expect(dist1).toBe(51250);
  });

  it("correctly assigns interest rings and LOD levels", () => {
    expect(classifyInterestRing(15000)).toEqual({ ring: "ring_0_near", lod: "lod0" });
    expect(classifyInterestRing(50000)).toEqual({ ring: "ring_1_mid", lod: "lod1" });
    expect(classifyInterestRing(120000)).toEqual({ ring: "ring_2_far", lod: "lod2" });
    expect(classifyInterestRing(250000)).toEqual({ ring: "ring_3_evicted", lod: "evicted" });
  });

  it("calculates LOD-scaled VRAM allocations deterministically", () => {
    const base = 10_000_000; // 10 MB
    expect(calculateVramForLod(base, "lod0")).toBe(10_000_000);
    expect(calculateVramForLod(base, "lod1")).toBe(4_000_000);
    expect(calculateVramForLod(base, "lod2")).toBe(1_000_000);
    expect(calculateVramForLod(base, "evicted")).toBe(0);
  });

  it("strictly enforces VRAM ceiling by evicting lowest priority assets first", () => {
    const playerPos = { x: 0, z: 0 };
    const assets: MobileAssetDescriptor[] = [
      {
        assetId: "player_blade_relic",
        category: "player_equipment",
        estimatedVramBytes: 40_000_000,
        posMm: { x: 5000, z: 5000 },
      },
      {
        assetId: "boss_vanguard_overseer",
        category: "boss_npc",
        estimatedVramBytes: 80_000_000,
        posMm: { x: 10000, z: 10000 },
      },
      {
        assetId: "prop_clutter_rock_01",
        category: "decorative_prop",
        estimatedVramBytes: 30_000_000,
        posMm: { x: 20000, z: 20000 },
      },
      {
        assetId: "prop_clutter_crate_02",
        category: "decorative_prop",
        estimatedVramBytes: 30_000_000,
        posMm: { x: 25000, z: 25000 },
      },
    ];

    // Tight budget of 130 MB
    const result = evaluateMobileResourcePlan({
      assets,
      playerPosMm: playerPos,
      vramCeilingBytes: 130 * 1024 * 1024,
    });

    expect(result.budgetCompliant).toBe(true);
    expect(result.totalAllocatedVramBytes).toBeLessThanOrEqual(130 * 1024 * 1024);

    // Player equipment and boss should remain active
    const playerAssignment = result.lodAssignments.find(a => a.assetId === "player_blade_relic");
    expect(playerAssignment?.lod).toBe("lod0");

    const bossAssignment = result.lodAssignments.find(a => a.assetId === "boss_vanguard_overseer");
    expect(bossAssignment?.lod).toBe("lod0");
  });
});

describe("Civic World Contribution (Milestone Progress & Receipts)", () => {
  it("lists initial civic projects with valid milestone bounds", async () => {
    const projects = await listCivicProjects();
    expect(projects.length).toBeGreaterThanOrEqual(3);
    for (const p of projects) {
      expect(p.progressPermille).toBeGreaterThanOrEqual(0);
      expect(p.progressPermille).toBeLessThanOrEqual(1000);
      expect(p.status).toMatch(/^(active|completed|locked)$/);
    }
  });

  it("records contribution deterministically and generates verifiable receipt", async () => {
    const result = await recordCivicContribution(77, {
      projectId: "observatory_sanctuary",
      units: 100,
      logicalTick: 5000,
      sourceReceiptId: "source_rcpt_0123456789abcdef",
    });

    expect(result.receipt.receiptId).toMatch(/^civic_rcpt_[a-f0-9]{24}$/);
    expect(result.receipt.userId).toBe(77);
    expect(result.receipt.units).toBe(100);
    expect(result.receipt.proofHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.updatedMilestone.contributedUnits).toBeGreaterThanOrEqual(420);
  });
});
