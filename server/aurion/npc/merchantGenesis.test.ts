import { describe, expect, it } from "vitest";
import { normalizeNpcRequest } from "../../wasdNpcCapsule";
import { NPC_CAPSULE_PIN_LINEAGE, isKnownNpcCapsulePin, npcCapsulePin } from "./authority";
import { MERCHANT_GENESIS_VERSION, confirmedNpcEconomy, merchantBootstrapMarkets, merchantGenesisRequest, npcIdentity } from "./merchantRules";

const hubs = Object.keys(merchantBootstrapMarkets).sort() as (keyof typeof merchantBootstrapMarkets)[];

describe("deterministic merchant genesis request", () => {
  it.each(hubs)("derives a stable, schema-valid first decision for %s from canonical defaults only", hubId => {
    const request = merchantGenesisRequest(hubId);
    expect(merchantGenesisRequest(hubId)).toEqual(request);
    expect(() => normalizeNpcRequest(request)).not.toThrow();
    expect(request).toMatchObject({ npcId: npcIdentity(hubId), regionId: hubId, resolutionIndex: 0, roleId: "merchant", needEvents: [], memory: [] });
    const economy = confirmedNpcEconomy(hubId, null);
    expect(request.economy).toEqual({
      currentHubId: hubId, wealthCopper: economy.wealthCopper, hungerBps: economy.hungerBps, fatigueBps: economy.fatigueBps,
      tradeProwessBps: economy.tradeProwessBps, harvestYieldBps: economy.harvestYieldBps,
    });
    expect(request.observationIds[0]).toBe(`${MERCHANT_GENESIS_VERSION}:${hubId}`);
    expect(new Set(request.opportunities.map(o => o.id)).size).toBe(6);
    expect(new Set(request.opportunities.map(o => o.kind))).toEqual(new Set(["safe_hub", "resource", "social", "reputation", "market", "influence"]));
    expect(request.opportunities.every(o => o.riskBps === 0 && o.resolutionIndex === 0 && o.sourceReceiptId === request.observationIds[0])).toBe(true);
    const stock = merchantBootstrapMarkets[hubId].stock as Record<string, number>;
    const scarcest = Object.entries(stock).sort(([a, x], [b, y]) => x - y || (a < b ? -1 : 1))[0][0];
    expect(request.opportunities.find(o => o.kind === "resource")?.targetId).toBe(`commodity:${scarcest}`);
  });

  it("rejects an unknown hub", () => {
    expect(() => merchantGenesisRequest("nowhere" as never)).toThrow("NPC_GENESIS_HUB_INVALID");
  });
});

describe("NPC capsule pin lineage", () => {
  it("accepts the documented historical and current pins and nothing else", () => {
    expect(NPC_CAPSULE_PIN_LINEAGE.at(-1)).toEqual({ sourceRevision: npcCapsulePin.sourceRevision, sourceSha256: npcCapsulePin.sourceSha256 });
    for (const pin of NPC_CAPSULE_PIN_LINEAGE) expect(isKnownNpcCapsulePin(pin)).toBe(true);
    const [historical] = NPC_CAPSULE_PIN_LINEAGE;
    expect(isKnownNpcCapsulePin({ sourceRevision: historical.sourceRevision, sourceSha256: npcCapsulePin.sourceSha256 })).toBe(false);
    expect(isKnownNpcCapsulePin({ sourceRevision: "e".repeat(40), sourceSha256: "f".repeat(64) })).toBe(false);
  });
});
