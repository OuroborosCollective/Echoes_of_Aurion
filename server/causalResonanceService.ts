import { createHash } from "node:crypto";
import { domainSha256, canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  CausalResonanceEcho,
  CausalResonanceQuery,
  CertificateRank,
  ExpeditionCertificate,
  GenerateCertificateInput,
  ResonanceType,
} from "../shared/causalResonanceContract";
import { getDb } from "./db";
import { aurionCausalTickReceipts } from "../drizzle/aurionCausalitySchema";
import { desc, eq } from "drizzle-orm";

const GLYPH_CHARS = "AURION-GLYPH-HEXAGRAM-SIGIL-OCTET-RESONANCE-CELESTIAL";

/**
 * Deterministically derives an expedition rank based purely on tick count and entropy hash.
 * Fast completions with low hash divergence earn higher ranks.
 */
export function deriveCertificateRank(tickCount: number, resultDigest: string): CertificateRank {
  // First 4 hex chars of result digest as 16-bit integer (0..65535)
  const entropy = parseInt(resultDigest.slice(0, 4), 16);
  // Composite score: ticks + normalized entropy mod 100
  const adjustedScore = tickCount + (entropy % 100);

  if (adjustedScore < 300) return "S";
  if (adjustedScore < 600) return "A";
  if (adjustedScore < 1000) return "B";
  if (adjustedScore < 1600) return "C";
  return "D";
}

/**
 * Derives a deterministic glyph signature from seed and result digests.
 */
export function deriveGlyphSignature(seedDigest: string, resultDigest: string): string {
  const combined = createHash("sha256")
    .update(`${seedDigest}:${resultDigest}`)
    .digest("hex");

  const segments: string[] = [];
  for (let i = 0; i < 4; i++) {
    const chunk = combined.slice(i * 8, (i + 1) * 8);
    const num = parseInt(chunk, 16);
    const charIndex = num % GLYPH_CHARS.length;
    segments.push(chunk.slice(0, 4).toUpperCase() + "-" + GLYPH_CHARS[charIndex]);
  }
  return segments.join("::");
}

/**
 * Derives stability index (0..1000 permille) purely from result hash and tick count.
 */
export function deriveStabilityIndex(tickCount: number, resultDigest: string): number {
  const hashVal = parseInt(resultDigest.slice(4, 8), 16); // 0..65535
  const base = 1000 - Math.min(500, Math.trunc(tickCount / 10));
  const variance = (hashVal % 100) - 50;
  return Math.max(100, Math.min(1000, base + variance));
}

/**
 * Computes verifiable proof hash for an expedition certificate.
 */
export function computeCertificateProofHash(cert: Omit<ExpeditionCertificate, "verifiableProofHash">): string {
  return domainSha256("aurion.expedition.certificate.v1", [
    cert.certificateId,
    cert.schema,
    cert.expeditionKey,
    cert.userId,
    cert.seedDigest,
    cert.resultDigest,
    cert.tickCount,
    cert.rank,
    cert.stabilityIndex,
    cert.glyphSignature,
    cert.receiptHash,
  ]);
}

/**
 * Generates an immutable, verifiable certificate for an expedition.
 */
export function generateExpeditionCertificate(input: GenerateCertificateInput): ExpeditionCertificate {
  const certificateId = `cert_${createHash("sha256")
    .update(`${input.expeditionKey}:${input.userId}:${input.seedDigest}:${input.resultDigest}`)
    .digest("hex")
    .slice(0, 24)}`;

  const rank = deriveCertificateRank(input.tickCount, input.resultDigest);
  const glyphSignature = deriveGlyphSignature(input.seedDigest, input.resultDigest);
  const stabilityIndex = deriveStabilityIndex(input.tickCount, input.resultDigest);

  const base: Omit<ExpeditionCertificate, "verifiableProofHash"> = {
    certificateId,
    schema: "aurion.expedition.certificate.v1",
    expeditionKey: input.expeditionKey,
    userId: input.userId,
    seedDigest: input.seedDigest,
    resultDigest: input.resultDigest,
    tickCount: input.tickCount,
    rank,
    stabilityIndex,
    glyphSignature,
    receiptHash: input.receiptHash,
  };

  const verifiableProofHash = computeCertificateProofHash(base);

  return {
    ...base,
    verifiableProofHash,
  };
}

/**
 * Cryptographically verifies if a certificate is authentic and untouched.
 */
export function verifyExpeditionCertificate(certificate: ExpeditionCertificate): boolean {
  const computed = computeCertificateProofHash(certificate);
  return computed === certificate.verifiableProofHash;
}

const RESONANCE_ARCHETYPES: readonly {
  type: ResonanceType;
  title: string;
  detail: string;
}[] = Object.freeze([
  {
    type: "tactical_vulnerability",
    title: "Schattenfrequenz-Exposition",
    detail: "Historische Kausalitätsbelege zeigen verringerte Resonanzbarriere bei Gegenangriffen im dritten Taktintervall.",
  },
  {
    type: "historical_echo",
    title: "Sternenwächter-Resonanz",
    detail: "Bestätigte Zone-Ticks spiegeln vorherige Verdrängungsmuster wider. Physische Risse stabilisieren sich entlang der Meridian-Achse.",
  },
  {
    type: "harmonic_affinity",
    title: "Harmonische Astral-Kopplung",
    detail: "Die synchrone Ausrichtung mit dem Begleiter verstärkt defensive Barrieren um 180 Promille bei gleichzeitiger Ruhedauer.",
  },
  {
    type: "celestial_alignment",
    title: "Astrographische Konvergenz",
    detail: "Die Zonen-Signatur korrespondiert mit der primordialen Observatoriums-Konstellation. Erhöhte Beute-Kausalitätswahrscheinlichkeit.",
  },
]);

/**
 * Generates companion resonance echoes derived from confirmed zone receipts and logical ticks.
 * Operates purely deterministically without any clocks.
 */
export async function getCausalResonanceEchoes(query: CausalResonanceQuery): Promise<CausalResonanceEcho[]> {
  const db = await getDb();
  let latestReceiptHash = "fallback_receipt_hash_00000000000000000000000000000000";

  if (db) {
    try {
      const rows = await db
        .select({ receiptHash: aurionCausalTickReceipts.receiptHash })
        .from(aurionCausalTickReceipts)
        .where(eq(aurionCausalTickReceipts.zoneId, query.zoneId))
        .orderBy(desc(aurionCausalTickReceipts.tick))
        .limit(1);
      if (rows.length > 0 && rows[0]?.receiptHash) {
        latestReceiptHash = rows[0].receiptHash;
      }
    } catch {
      // In-memory or initial db without receipts
    }
  }

  const echoes: CausalResonanceEcho[] = [];
  const count = query.limit ?? 5;

  for (let index = 0; index < count; index++) {
    const echoHash = domainSha256("aurion.causal.resonance.echo.v1", [
      query.zoneId,
      query.encounterOrQuestKey,
      query.targetTick,
      index,
      latestReceiptHash,
    ]);

    const num = parseInt(echoHash.slice(7, 13), 16);
    const archetype = RESONANCE_ARCHETYPES[num % RESONANCE_ARCHETYPES.length];
    const stabilityScore = 600 + (num % 400); // 600..999
    const glyphSignature = `GLYPH-${query.zoneId.toUpperCase()}-${echoHash.slice(7, 15).toUpperCase()}`;

    echoes.push({
      resonanceId: `res_${echoHash.slice(7, 23)}`,
      sourceTick: query.targetTick + (index * 12),
      zoneId: query.zoneId,
      encounterOrQuestKey: query.encounterOrQuestKey,
      resonanceType: archetype.type,
      stabilityScore,
      glyphSignature,
      insightTitle: archetype.title,
      insightDetail: archetype.detail,
      evidenceReceiptHash: latestReceiptHash,
    });
  }

  return echoes;
}
