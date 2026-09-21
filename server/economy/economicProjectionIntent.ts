import { and, eq } from "drizzle-orm";
import { aurionEconomicProjectionIntents } from "../../drizzle/aurionCausalitySchema";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import type { AurionEconomicSourceKind } from "../../shared/aurionEconomicEventContract";
import { getDb } from "../db";

const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH=/^sha256:[a-f0-9]{64}$/;

export type EconomicProjectionIntent=Readonly<{
  intentId:string;
  sourceKind:AurionEconomicSourceKind;
  sourceId:string;
  sourceEvidenceHash:string;
  intentHash:string;
}>;

export function buildEconomicProjectionIntent(input:Readonly<{
  sourceKind:AurionEconomicSourceKind;
  sourceId:string;
  sourceEvidenceHash:string;
}>):EconomicProjectionIntent{
  if(!ID.test(input.sourceId)||!HASH.test(input.sourceEvidenceHash)) throw new Error("ECONOMIC_PROJECTION_INTENT_INVALID");
  const unsigned={schema:"aurion.economic-projection-intent.v1" as const,...input,mutationAuthority:"none" as const};
  const intentHash=canonicalSha256(unsigned);
  return Object.freeze({
    intentId:`eintent_${intentHash.slice("sha256:".length).slice(0,56)}`,
    sourceKind:input.sourceKind,
    sourceId:input.sourceId,
    sourceEvidenceHash:input.sourceEvidenceHash,
    intentHash,
  });
}

type Database=NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx=Parameters<Parameters<Database["transaction"]>[0]>[0];
type IntentWriter=Pick<Tx,"select"|"insert">;

export async function appendEconomicProjectionIntentInTransaction(
  tx:IntentWriter,
  input:Readonly<{sourceKind:AurionEconomicSourceKind;sourceId:string;sourceEvidenceHash:string}>,
){
  const intent=buildEconomicProjectionIntent(input);
  const prior=(await tx.select().from(aurionEconomicProjectionIntents).where(and(
    eq(aurionEconomicProjectionIntents.sourceKind,intent.sourceKind),
    eq(aurionEconomicProjectionIntents.sourceId,intent.sourceId),
  )).limit(1))[0];
  if(prior){
    if(prior.sourceEvidenceHash!==intent.sourceEvidenceHash||prior.intentHash!==intent.intentHash||prior.intentId!==intent.intentId) {
      throw new Error("ECONOMIC_PROJECTION_INTENT_CONFLICT");
    }
    return Object.freeze({applied:false as const,intent});
  }
  await tx.insert(aurionEconomicProjectionIntents).values(intent);
  const stored=(await tx.select().from(aurionEconomicProjectionIntents).where(eq(aurionEconomicProjectionIntents.intentId,intent.intentId)).limit(1))[0];
  if(!stored||stored.sourceEvidenceHash!==intent.sourceEvidenceHash||stored.intentHash!==intent.intentHash) throw new Error("ECONOMIC_PROJECTION_INTENT_READBACK_MISMATCH");
  return Object.freeze({applied:true as const,intent});
}
