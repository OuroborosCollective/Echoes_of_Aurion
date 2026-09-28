import type { CanonicalAvatarProfile } from "./aurionCanonicalAvatarContract";
import { browserCanonicalSha256 } from "./aurionBrowserHash";
import type { VisualItemDescriptor } from "./visualItemProtocol";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;

export type AurionEquipmentRuntimeProofInput = Readonly<{
  sourceRevision: string;
  lootReceipts: readonly Readonly<{
    receiptId: string;
    itemDefinitionId: string;
    familyId: string;
    visualSeed: string;
  }>[];
  visualDescriptors: readonly VisualItemDescriptor[];
  avatarProfiles: readonly CanonicalAvatarProfile[];
  equipmentSlots: readonly string[];
  renderEvidence: readonly Readonly<{
    equipmentSlot: string;
    source: "glb" | "procedural";
    fingerprint: string;
  }>[];
  cacheReplayFingerprints: readonly string[];
  lodReadbacks: readonly Readonly<{
    lod: 0 | 1 | 2;
    logicalIdentity: string;
    structuralFingerprint: string;
  }>[];
}>;

export type AurionEquipmentRuntimeProof = Readonly<
  AurionEquipmentRuntimeProofInput & {
    protocol: "aurion.equipment-runtime-proof.v1";
    proofFingerprint: string;
  }
>;

function fail(code: string): never {
  throw new Error(code);
}
function nonEmpty(value: string, code: string): string {
  if (!value.trim()) fail(code);
  return value;
}
function unique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) fail(code);
}

export function createAurionEquipmentRuntimeProof(
  input: AurionEquipmentRuntimeProofInput
): AurionEquipmentRuntimeProof {
  if (!REVISION.test(input.sourceRevision))
    fail("EQUIPMENT_PROOF_REVISION_INVALID");
  if (input.lootReceipts.length < 2)
    fail("EQUIPMENT_PROOF_RECEIPTS_INSUFFICIENT");
  if (input.visualDescriptors.length !== input.lootReceipts.length)
    fail("EQUIPMENT_PROOF_DESCRIPTOR_RECEIPT_COUNT_MISMATCH");
  const receiptIds = input.lootReceipts.map(receipt =>
    nonEmpty(receipt.receiptId, "EQUIPMENT_PROOF_RECEIPT_ID_INVALID")
  );
  unique(receiptIds, "EQUIPMENT_PROOF_RECEIPT_DUPLICATE");
  const seeds = input.lootReceipts.map(receipt => receipt.visualSeed);
  if (new Set(seeds).size < 2 || seeds.some(seed => !SHA256.test(seed)))
    fail("EQUIPMENT_PROOF_VARIANTS_INVALID");
  for (const descriptor of input.visualDescriptors) {
    const receipt = input.lootReceipts.find(
      value => value.receiptId === descriptor.source.lootReceiptId
    );
    if (
      !receipt ||
      receipt.itemDefinitionId !== descriptor.itemDefinitionId ||
      receipt.familyId !== descriptor.familyId ||
      receipt.visualSeed !== `sha256:${descriptor.visualSeed}`
    )
      fail("EQUIPMENT_PROOF_RECEIPT_VISUAL_MISMATCH");
  }
  if (input.avatarProfiles.length < 2)
    fail("EQUIPMENT_PROOF_AVATAR_PROFILES_INSUFFICIENT");
  unique(
    input.avatarProfiles.map(profile => profile.profileFingerprint),
    "EQUIPMENT_PROOF_AVATAR_DUPLICATE"
  );
  if (input.equipmentSlots.length < 2)
    fail("EQUIPMENT_PROOF_SLOTS_INSUFFICIENT");
  unique(input.equipmentSlots, "EQUIPMENT_PROOF_SLOTS_DUPLICATE");
  const sources = new Set(
    input.renderEvidence.map(evidence => evidence.source)
  );
  if (!sources.has("glb") || !sources.has("procedural"))
    fail("EQUIPMENT_PROOF_SOURCE_COVERAGE_INCOMPLETE");
  for (const evidence of input.renderEvidence)
    nonEmpty(
      evidence.fingerprint,
      "EQUIPMENT_PROOF_RENDER_FINGERPRINT_INVALID"
    );
  if (
    input.cacheReplayFingerprints.length < 2 ||
    new Set(input.cacheReplayFingerprints).size !== 1
  )
    fail("EQUIPMENT_PROOF_CACHE_REPLAY_MISMATCH");
  const lods = [...input.lodReadbacks].sort(
    (left, right) => left.lod - right.lod
  );
  if (lods.length !== 3 || lods.map(value => value.lod).join(",") !== "0,1,2")
    fail("EQUIPMENT_PROOF_LOD_COVERAGE_INCOMPLETE");
  if (
    new Set(lods.map(value => value.logicalIdentity)).size !== 1 ||
    lods.some(value => !value.structuralFingerprint)
  )
    fail("EQUIPMENT_PROOF_LOD_IDENTITY_DRIFT");
  const unsigned = {
    ...input,
    protocol: "aurion.equipment-runtime-proof.v1" as const,
  };
  return Object.freeze({
    ...unsigned,
    proofFingerprint: browserCanonicalSha256({
      domain: "aurion.equipment-runtime-proof.v1",
      proof: unsigned,
    }),
  });
}

export function verifyAurionEquipmentRuntimeProof(
  proof: AurionEquipmentRuntimeProof
): boolean {
  try {
    const { protocol, proofFingerprint, ...input } = proof;
    return (
      protocol === "aurion.equipment-runtime-proof.v1" &&
      proofFingerprint ===
        createAurionEquipmentRuntimeProof(input).proofFingerprint
    );
  } catch {
    return false;
  }
}
