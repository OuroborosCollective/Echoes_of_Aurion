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
    if(result.quality===quality && (quality!=="set" || Boolean(result.setId))) return Object.freeze({resolutionIndex,result});
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
      const fixture=qualityFixture(quality);
      expect(fixture.result.quality).toBe(quality);
      expect(fixture.result.affixes.length).toBeGreaterThanOrEqual(quality==="rare"||quality==="set"?3:4);
    }
    const distribution=Object.fromEntries(["normal","magic","rare","set","unique","mythic"].map(quality=>[quality,0])) as Record<string,number>;
    for(let resolutionIndex=0;resolutionIndex<10_000;resolutionIndex+=1){
      const result=resolved({resolutionIndex,luckBps:5_000,monsterArchetypeId:"aim540-distribution"});
      distribution[result.quality]!+=1;
    }
    expect(Object.values(distribution).reduce((sum,value)=>sum+value,0)).toBe(10_000);
    expect(Object.values(distribution).every(value=>value>0)).toBe(true);
  });

  it("proves multi-affix uniqueness, set semantics and order-invariant replay",()=>{
    const fixture=qualityFixture("set");
    const result=fixture.result;
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
    for(let i=0;i<256;i+=1){
      const input={
        resolutionIndex:i,
        zoneId:i%2===0?"windhollow":"emberfall",
        monsterArchetypeId:i%3===0?"common_monster":i%3===1?"elite_rare":"dungeon_boss",
        luckBps:(i*137)%5_001,
        serverSeedDigest:seed(String(i)),
      };
      const first=resolved(input);
      expect(resolved(input)).toEqual(first);
      expect(resolved({...input,resolutionIndex:i+1}).contextHash).not.toBe(first.contextHash);
      expect(resolved({...input,monsterArchetypeId:`${input.monsterArchetypeId}:tampered`}).contextHash).not.toBe(first.contextHash);
      expect(resolved({...input,serverSeedDigest:seed(`${i}:tampered`)}).contextHash).not.toBe(first.contextHash);
    }
    expect(estimateLootVariantUpperBound({
      baseItemCount:48,
      affixGroupCount:72,
      maxAffixSlots:5,
      qualityCount:6,
      levelBands:101,
    })).toBe("48838323824640");
  });

  it("builds a canonical receipt/hash chain and keeps visual evidence presentation-only",()=>{
    const loot=resolved({resolutionIndex:123,serverSeedDigest:seed("chain")});
    const chain=[
      {kind:"encounter",id:context({resolutionIndex:123,serverSeedDigest:seed("chain")}).encounterReceiptId,hash:canonicalSha256(context({resolutionIndex:123,serverSeedDigest:seed("chain")}))},
      {kind:"loot",id:loot.itemDefinitionId,hash:`sha256:${loot.deterministicHash}`},
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
