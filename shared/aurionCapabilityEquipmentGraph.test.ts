import { describe, expect, it } from "vitest";
import {
  ACEG_MAX_LADDER_PASSES,
  AURION_ACEG_PROTOCOL,
  computeAcegCapabilities,
  resolveAcegEquipEligibility,
  resolveAcegEquipment,
  resolveAcegOverEquipEffectiveness,
  verifyAcegResolution,
  type AcegCapabilitySnapshot,
  type AcegItemDefinition,
} from "./aurionCapabilityEquipmentGraph";

function snapshot(
  overrides: Partial<AcegCapabilitySnapshot> = {}
): AcegCapabilitySnapshot {
  return {
    entityId: "player:aceg-686",
    tickIndex: 42,
    permanentStats: [
      { capability: "strength", delta: 100 },
      { capability: "treatment", delta: 60 },
    ],
    skillRanks: [{ capability: "engineering", delta: 40 }],
    professionModifiers: [{ capability: "politics", delta: 10 }],
    implants: [],
    buffs: [],
    ...overrides,
  };
}

const nanoHelm: AcegItemDefinition = {
  itemId: "item:nano-helm",
  slot: "head",
  modifiers: [{ capability: "treatment", delta: 30 }],
  requirements: [{ capability: "treatment", minValue: 80 }],
  overEquipPenaltyPerPointBps: 25,
};

const treatmentRig: AcegItemDefinition = {
  itemId: "item:treatment-rig",
  slot: "chest",
  modifiers: [{ capability: "medicine", delta: 50 }],
  requirements: [{ capability: "treatment", minValue: 90 }],
  overEquipPenaltyPerPointBps: 25,
};

const medicBlade: AcegItemDefinition = {
  itemId: "item:medic-blade",
  slot: "hand",
  modifiers: [{ capability: "strength", delta: 5 }],
  requirements: [
    { capability: "medicine", minValue: 50 },
    { capability: "strength", minValue: 100 },
  ],
  overEquipPenaltyPerPointBps: 25,
};

const reserveHelm: AcegItemDefinition = {
  itemId: "item:a-reserve-helm",
  slot: "head",
  modifiers: [],
  requirements: [],
  overEquipPenaltyPerPointBps: 25,
};

function ladderChain(length: number): readonly AcegItemDefinition[] {
  return Array.from({ length }, (_, index) => ({
    itemId: `item:chain-${String(index + 1).padStart(2, "0")}`,
    slot: `chain-slot-${index + 1}`,
    modifiers: [{ capability: "chain", delta: 1 }],
    requirements: [{ capability: "chain", minValue: index }],
    overEquipPenaltyPerPointBps: 1,
  }));
}

describe("AIM-686 ACEG Capability & Equipment Graph", () => {
  it("computes deterministic fixed-tick capabilities in canonical source order", () => {
    const capabilities = computeAcegCapabilities(
      snapshot({
        implants: [
          {
            implantId: "implant:arm",
            modifiers: [{ capability: "strength", delta: 10 }],
            installReceiptId: "receipt:implant:arm",
          },
        ],
        buffs: [
          {
            buffId: "buff:rally",
            modifiers: [{ capability: "strength", delta: 15 }],
            expiresAtTick: 100,
            confirmationReceiptId: "receipt:buff:rally",
          },
        ],
      })
    );
    // 100 permanent + 10 implant + 15 confirmed active buff.
    expect(capabilities.strength).toBe(125);
    expect(capabilities.treatment).toBe(60);
    expect(capabilities.engineering).toBe(40);
    expect(Object.keys(capabilities)).toEqual(
      [...Object.keys(capabilities)].sort()
    );
  });

  it("ignores expired buffs and rejects unconfirmed buffs in the confirmed tick state", () => {
    const expired = computeAcegCapabilities(
      snapshot({
        buffs: [
          {
            buffId: "buff:old",
            modifiers: [{ capability: "strength", delta: 500 }],
            expiresAtTick: 42,
            confirmationReceiptId: "receipt:buff:old",
          },
        ],
      })
    );
    expect(expired.strength).toBe(100);
    expect(() =>
      computeAcegCapabilities(
        snapshot({
          buffs: [
            {
              buffId: "buff:ghost",
              modifiers: [{ capability: "strength", delta: 1 }],
              expiresAtTick: 100,
              confirmationReceiptId: "",
            },
          ],
        })
      )
    ).toThrow("ACEG_BUFF_UNCONFIRMED");
  });

  it("separates equip eligibility from over-equip effectiveness with exact bps math", () => {
    const capabilities = computeAcegCapabilities(snapshot());
    const eligibility = resolveAcegEquipEligibility(nanoHelm, capabilities);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.deficits).toEqual([
      { capability: "treatment", required: 80, actual: 60, missing: 20 },
    ]);
    // Wolfram reference: 10000 - 20*25 = 9500 bps.
    const effectiveness = resolveAcegOverEquipEffectiveness(
      nanoHelm,
      capabilities
    );
    expect(effectiveness.overEquip).toBe(true);
    expect(effectiveness.effectivenessBps).toBe(9_500);
    const eligible = resolveAcegEquipEligibility(treatmentRig, {
      ...capabilities,
      treatment: 95,
    });
    expect(eligible.eligible).toBe(true);
    expect(
      resolveAcegOverEquipEffectiveness(treatmentRig, {
        ...capabilities,
        treatment: 95,
      }).effectivenessBps
    ).toBe(10_000);
  });

  it("ladders equipment step by step: helm enables rig, rig enables blade", () => {
    const resolution = resolveAcegEquipment({
      snapshot: snapshot({
        buffs: [
          {
            buffId: "buff:treatment",
            modifiers: [{ capability: "treatment", delta: 25 }],
            expiresAtTick: 100,
            confirmationReceiptId: "receipt:buff:treatment",
          },
        ],
      }),
      catalog: [medicBlade, treatmentRig, nanoHelm],
      ownedItems: [
        { itemId: "item:medic-blade", ownershipReceiptId: "receipt:own:blade" },
        { itemId: "item:treatment-rig", ownershipReceiptId: "receipt:own:rig" },
        { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:helm" },
      ],
      priorConfirmedEquip: [],
    });
    expect(resolution.protocol).toBe(AURION_ACEG_PROTOCOL);
    // Pass 1: buff 60+25=85 >= 80 equips helm. Pass 2: 85+30=115 >= 90 equips
    // rig. Pass 3: medicine 50 and strength 100 equip blade.
    const passes = Object.fromEntries(
      resolution.equipDecisions.map(decision => [
        decision.itemId,
        decision.ladderPass,
      ])
    );
    expect(passes).toEqual({
      "item:nano-helm": 1,
      "item:treatment-rig": 2,
      "item:medic-blade": 3,
    });
    expect(
      resolution.equipDecisions.every(
        decision =>
          decision.retention === "eligible" &&
          decision.confirmationReceiptId === null &&
          decision.ownershipReceiptId.startsWith("receipt:own:")
      )
    ).toBe(true);
    expect(resolution.capabilities.medicine).toBe(50);
    expect(resolution.capabilities.strength).toBe(105);
    expect(resolution.sourceEvidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(resolution.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifyAcegResolution(resolution)).toBe(true);
  });

  it("retains a confirmed equip after buff expiry per the OE rule", () => {
    const resolution = resolveAcegEquipment({
      snapshot: snapshot(),
      catalog: [nanoHelm],
      ownedItems: [
        { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:helm" },
      ],
      priorConfirmedEquip: [
        {
          itemId: "item:nano-helm",
          confirmationReceiptId: "receipt:equip-confirmed:helm",
        },
      ],
    });
    // treatment 60 < 80 without the expired buff, but the confirmed equip holds.
    expect(resolution.equipDecisions).toHaveLength(1);
    expect(resolution.equipDecisions[0]!.retention).toBe(
      "over_equip_confirmed"
    );
    expect(resolution.equipDecisions[0]!.confirmationReceiptId).toBe(
      "receipt:equip-confirmed:helm"
    );
    // Wolfram reference: 10000 - 20*25 = 9500 bps.
    expect(resolution.equipDecisions[0]!.effectivenessBps).toBe(9_500);
    expect(verifyAcegResolution(resolution)).toBe(true);
  });

  it("reserves prior-confirmed slots before considering new eligible items", () => {
    const resolution = resolveAcegEquipment({
      snapshot: snapshot(),
      catalog: [reserveHelm, nanoHelm],
      ownedItems: [
        {
          itemId: "item:a-reserve-helm",
          ownershipReceiptId: "receipt:own:reserve",
        },
        { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:helm" },
      ],
      priorConfirmedEquip: [
        {
          itemId: "item:nano-helm",
          confirmationReceiptId: "receipt:equip-confirmed:helm",
        },
      ],
    });

    expect(resolution.equipDecisions).toHaveLength(1);
    expect(resolution.equipDecisions[0]).toMatchObject({
      itemId: "item:nano-helm",
      slot: "head",
      ladderPass: 0,
      retention: "over_equip_confirmed",
      effectivenessBps: 9_500,
      ownershipReceiptId: "receipt:own:helm",
      confirmationReceiptId: "receipt:equip-confirmed:helm",
    });
  });

  it("binds receipt identity into the source and resolution hashes", () => {
    const first = resolveAcegEquipment({
      snapshot: snapshot({
        implants: [
          {
            implantId: "implant:arm",
            modifiers: [{ capability: "strength", delta: 10 }],
            installReceiptId: "receipt:implant:first",
          },
        ],
      }),
      catalog: [],
      ownedItems: [],
      priorConfirmedEquip: [],
    });
    const second = resolveAcegEquipment({
      snapshot: snapshot({
        implants: [
          {
            implantId: "implant:arm",
            modifiers: [{ capability: "strength", delta: 10 }],
            installReceiptId: "receipt:implant:second",
          },
        ],
      }),
      catalog: [],
      ownedItems: [],
      priorConfirmedEquip: [],
    });

    expect(second.capabilities).toEqual(first.capabilities);
    expect(second.sourceEvidenceHash).not.toBe(first.sourceEvidenceHash);
    expect(second.resolutionHash).not.toBe(first.resolutionHash);
    expect(verifyAcegResolution(first)).toBe(true);
    expect(verifyAcegResolution(second)).toBe(true);
  });

  it("fails closed on impossible prior-confirmed ownership and slot conflicts", () => {
    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot(),
        catalog: [nanoHelm],
        ownedItems: [],
        priorConfirmedEquip: [
          {
            itemId: "item:nano-helm",
            confirmationReceiptId: "receipt:equip-confirmed:helm",
          },
        ],
      })
    ).toThrow("ACEG_CONFIRMED_ITEM_NOT_OWNED");

    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot(),
        catalog: [reserveHelm, nanoHelm],
        ownedItems: [
          {
            itemId: "item:a-reserve-helm",
            ownershipReceiptId: "receipt:own:reserve",
          },
          { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:helm" },
        ],
        priorConfirmedEquip: [
          {
            itemId: "item:a-reserve-helm",
            confirmationReceiptId: "receipt:equip-confirmed:reserve",
          },
          {
            itemId: "item:nano-helm",
            confirmationReceiptId: "receipt:equip-confirmed:helm",
          },
        ],
      })
    ).toThrow("ACEG_CONFIRMED_SLOT_DUPLICATE");
  });

  it("accepts a complete 16-pass chain and rejects a required 17th pass", () => {
    const sixteen = ladderChain(ACEG_MAX_LADDER_PASSES);
    const ownedSixteen = sixteen.map(item => ({
      itemId: item.itemId,
      ownershipReceiptId: `receipt:own:${item.itemId}`,
    }));
    const resolution = resolveAcegEquipment({
      snapshot: snapshot({ permanentStats: [] }),
      catalog: sixteen,
      ownedItems: ownedSixteen,
      priorConfirmedEquip: [],
    });
    expect(resolution.equipDecisions).toHaveLength(ACEG_MAX_LADDER_PASSES);
    expect(
      Math.max(...resolution.equipDecisions.map(decision => decision.ladderPass))
    ).toBe(ACEG_MAX_LADDER_PASSES);

    const seventeen = ladderChain(ACEG_MAX_LADDER_PASSES + 1);
    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot({ permanentStats: [] }),
        catalog: seventeen,
        ownedItems: seventeen.map(item => ({
          itemId: item.itemId,
          ownershipReceiptId: `receipt:own:${item.itemId}`,
        })),
        priorConfirmedEquip: [],
      })
    ).toThrow("ACEG_LADDER_BOUND_EXCEEDED");
  });

  it("fails closed on unsafe integer accumulation and duplicate owned identity", () => {
    expect(() =>
      computeAcegCapabilities(
        snapshot({
          permanentStats: [
            { capability: "strength", delta: Number.MAX_SAFE_INTEGER },
            { capability: "strength", delta: 1 },
          ],
        })
      )
    ).toThrow("ACEG_CAPABILITY_OVERFLOW");

    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot(),
        catalog: [nanoHelm],
        ownedItems: [
          { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:one" },
          { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:two" },
        ],
        priorConfirmedEquip: [],
      })
    ).toThrow("ACEG_OWNED_ITEM_DUPLICATE");
  });

  it("is canonical-order invariant for shuffled inputs", () => {
    const input = {
      snapshot: snapshot({
        implants: [
          {
            implantId: "implant:b",
            modifiers: [{ capability: "strength", delta: 4 }],
            installReceiptId: "receipt:implant:b",
          },
          {
            implantId: "implant:a",
            modifiers: [{ capability: "strength", delta: 6 }],
            installReceiptId: "receipt:implant:a",
          },
        ],
      }),
      catalog: [treatmentRig, nanoHelm],
      ownedItems: [
        { itemId: "item:treatment-rig", ownershipReceiptId: "receipt:own:rig" },
        { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:helm" },
      ],
      priorConfirmedEquip: [] as const,
    };
    const first = resolveAcegEquipment(input);
    const second = resolveAcegEquipment({
      ...input,
      snapshot: snapshot({
        implants: [...input.snapshot.implants].reverse(),
      }),
      catalog: [...input.catalog].reverse(),
      ownedItems: [...input.ownedItems].reverse(),
    });
    expect(second).toEqual(first);
    expect(second.resolutionHash).toBe(first.resolutionHash);
  });

  it("is bounded and fails closed on duplicates, unknown items, and hash drift", () => {
    expect(ACEG_MAX_LADDER_PASSES).toBe(16);
    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot(),
        catalog: [nanoHelm, nanoHelm],
        ownedItems: [],
        priorConfirmedEquip: [],
      })
    ).toThrow("ACEG_ITEM_DUPLICATE");
    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot(),
        catalog: [nanoHelm],
        ownedItems: [
          { itemId: "item:unknown", ownershipReceiptId: "receipt:own:x" },
        ],
        priorConfirmedEquip: [],
      })
    ).toThrow("ACEG_OWNED_ITEM_UNKNOWN");
    expect(() =>
      resolveAcegEquipment({
        snapshot: snapshot(),
        catalog: [nanoHelm],
        ownedItems: [
          { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:dup" },
          { itemId: "item:nano-helm", ownershipReceiptId: "receipt:own:dup" },
        ],
        priorConfirmedEquip: [],
      })
    ).toThrow("ACEG_RECEIPT_DUPLICATE");
    const resolution = resolveAcegEquipment({
      snapshot: snapshot(),
      catalog: [nanoHelm],
      ownedItems: [],
      priorConfirmedEquip: [],
    });
    expect(
      verifyAcegResolution({
        ...resolution,
        resolutionHash: "sha256:" + "0".repeat(64),
      })
    ).toBe(false);
  });
});
