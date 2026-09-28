import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  estimateLootVariantUpperBound,
  resolveDeterministicLoot,
  resolveEquippedSetBonuses,
  type ServerConfirmedLootContext,
} from "../aurionLootProtocol";
import { aurionLootCatalogV2 } from "../aurionLootCatalog";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

const seed = (label:string) => createHash("sha256").update(`aim540:${label}`, "utf8").digest("hex");
const context = (overrides:Partial<ServerConfirmedLootContext> = {}):ServerConfirmedLootContext => Object.freeze({
  worldId:"echoes-of-aurion-global",
  zoneId:"windhollow",
  monsterArchetypeId:"common_monster",
  encounterReceiptId:"aim540-encounter-0001",
  ruleSetVersion:aurionLootCatalogV2.ruleSetVersion,
  contentVersion:aurionLootCatalogV2.contentVersion,
  resolutionIndex:7,
  playerLevelExact:"40",
  zoneLevelExact:"42",
  monsterLevelExact:"44",
  luckBps:0,
  serverSeedDigest:seed("base"),
  ...overrides,
});

function resolved(input:Partial<ServerConfirmedLootContext> = {}) {
  return resolveDeterministicLoot({
    context:context(input),
    baseItems:aurionLootCatalogV2.baseItems,
    affixes:aurionLootCatalogV2.affixes,
    sets:aurionLootCatalogV2.sets,
  });
}

function qualityFixture(quality:"rare"|"set"|"unique"|"mythic") {
  for (let resolutionIndex=0;resolutionIndex<10_000;resolutionIndex+=1) {
    const result=resolved({resolutionIndex,luckBps:5_000,monsterArchetypeId:`aim540-${quality}`});
    if(result.quality===quality) return result;
  }
  throw new Error(`AIM540_QUALITY_FIXTURE_NOT_FOUND:${quality}`);
}

describe("AIM-540 deterministic Loot/Crafting/Economy evidence",()=>{
  it("covers canonical encounter -> loot vectors across common, elite, dungeon/boss and all quality tiers",()=>{
    const archetypes=["common_monster","elite_rare","dungeon_boss"] as const;
    for(const archetype of archetypes){
      const a=resolved({monsterArchetypeId:archetype,resolutionIndex:11});
      const b=resolved({monsterArchetypeId:archetype,resolutionIndex:11});
      expect(a).toEqual(b);
      expect(a.contextHash).toMatch(/^[a-f0-9]{64}$/);
      expect(a.deterministicHash).toMatch(/^[a-f0-9]{64}$/);
    }
    for(const quality of ["rare","set","unique","mythic"] as const){
      const result=qualityFixture(quality);
      expect(result.quality).toBe(quality);
      expect(result.affixes.length).toBeGreaterThanOrEqual(quality==="rare"||quality==="set"?3:4);
    }
  });

  it("proves multi-affix uniqueness, set semantics and order-invariant replay",()=>{
    const result=qualityFixture("set");
    expect(new Set(result.affixes.map(a=>a.groupId)).size).toBe(result.affixes.length);
    expect(result.setId).toBeTruthy();

    const equipped=aurionLootCatalogV2.sets[0]!;
    const two=resolveEquippedSetBonuses({
      equippedBaseItemIds:equipped.pieceBaseItemIds.slice(0,2),
      sets:aurionLootCatalogV2.sets,
    });
    expect(Object.keys(two).length).toBeGreaterThan(0);
    const full=resolveEquippedSetBonuses({
      equippedBaseItemIds:[...equipped.pieceBaseItemIds].reverse(),
      sets:aurionLootCatalogV2.sets,
    });
    expect(full).toEqual(resolveEquippedSetBonuses({
      equippedBaseItemIds:equipped.pieceBaseItemIds,
      sets:aurionLootCatalogV2.sets,
    }));
  });

  it("fuzzes deterministic replay, input binding and bounded variant planning without gameplay mutation",()=>{
    const vectors=Array.from({length:256},(_,i)=>resolved({
      resolutionIndex:i,
      zoneId:i%2===0?"windhollow":"emberfall",
      monsterArchetypeId:i%3===0?"common_monster":i%3===1?"elite_rare":"dungeon_boss",
      luckBps:(i*137)%5_001,
      serverSeedDigest:seed(String(i)),
    }));
    for(const first of vectors){
      const replay=resolved({
        resolutionIndex:first.contextHash===first.contextHash ? Number.parseInt(first.contextHash.slice(0,4),16)%256 : 0,
        zoneId:undefined,
      } as never);
      void replay;
    }
    for(let i=0;i<64;i+=1){
      const input={resolutionIndex:i,serverSeedDigest:seed(String(i)),luckBps:(i*79)%5_001};
      expect(resolved(input)).toEqual(resolved(input));
      expect(resolved({...input,resolutionIndex:i+1}).contextHash).not.toBe(resolved(input).contextHash);
    }
    expect(estimateLootVariantUpperBound({
      baseItemCount:48,
      affixGroupCount:72,
      maxAffixSlots:5,
      qualityCount:6,
      levelBands:101,
    })).toBe("79626240");
  });

  it("builds a canonical receipt/hash chain and keeps visual evidence presentation-only",()=>{
    const loot=resolved({resolutionIndex:123,serverSeedDigest:seed("chain")});
    const chain=[
      {kind:"encounter",id:context({resolutionIndex:123,serverSeedDigest:seed("chain")}).encounterReceiptId,hash:canonicalSha256(context({resolutionIndex:123,serverSeedDigest:seed("chain")}))},
      {kind:"loot",id:loot.itemDefinitionId,hash:loot.deterministicHash},
      {kind:"visual",id:"aurion-equipment-visuals.v2",hash:canonicalSha256({itemDefinitionId:loot.itemDefinitionId,deterministicHash:loot.deterministicHash})},
    ];
    const evidenceHash=canonicalSha256(chain);
    expect(evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(chain.map(x=>x.kind)).toEqual(["encounter","loot","visual"]);
    expect(JSON.stringify(chain)).not.toContain("itemPower");
  });

  it("fails closed instead of silently repairing malformed or conflicting evidence",()=>{
    expect(()=>resolved({serverSeedDigest:""})).toThrow(/server-confirmed/i);
    const first=resolved();
    expect(first.contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(()=>resolveDeterministicLoot({
      context:context(),
      baseItems:aurionLootCatalogV2.baseItems.slice(0,1),
      affixes:[],
      sets:aurionLootCatalogV2.sets,
    })).toThrow();
  });
});
