import fs from "node:fs";
import { describe, expect, it } from "vitest";
import * as bound from "./wasdNpcCapsule";
import * as legacy from "./npcPersistenceProtocol";
import { resolveNpcNeeds } from "./wasdAurionProtocol";
import { appRouter } from "./routers";
import pin from "../config/wasd-npc-capsule.json";
import { decodeOwnedNpcMultiMemory } from "../shared/npcMultiMemoryReadmodel";

describe("AIM-292 WASD source and public transport boundary",()=>{
  it("binds the real imported rule functions and compiled identity to the reviewed WASD source",()=>{
    expect(bound.npcAuthority()).toMatchObject({sourceRevision:pin.sourceRevision,sourceSha256:pin.sourceSha256});
    expect(legacy.createNpcLifeSnapshot).toBe(bound.createNpcLifeSnapshot);expect(resolveNpcNeeds).toBe(bound.resolveNpcNeeds);
    for(const name of ["npcLifeProtocol","npcPersistenceProtocol","ax1LivingWorldProtocol"]){
      const source=fs.readFileSync(`server/${name}.ts`,"utf8");expect(source.trim().split("\n")).toHaveLength(2);expect(source).toContain('export * from "./wasdNpcCapsule"');
    }
    expect(appRouter._def.procedures).not.toHaveProperty("admin.world.resolveNpc");
    expect(appRouter._def.procedures).toHaveProperty("gameplay.npcMultiMemory");
  });
  it("requires exact owner, bounded unique ordered identities and a readmodel without raw fields",()=>{
    const npc={version:"wasd-npc-memory-public.v4",npcId:"lyra",resolutionIndex:7,goal:"trade",planStatus:"planned",memoryHash:"a".repeat(64),sourceRevision:pin.sourceRevision,counts:{working:1,episodic:1,semantic:2,procedural:2},conflictedFacts:0,expiredFacts:0};
    const packet={userId:7,format:"aurion-public-npc-memory.v4",npcs:[npc]};
    expect(decodeOwnedNpcMultiMemory(packet,7).npcs).toHaveLength(1);
    for(const changed of [{...packet,userId:8},{...packet,npcs:[npc,npc]},{...packet,npcs:[{...npc,raw:"private"}]},{...packet,npcs:[{...npc,expiredFacts:3}]},{...packet,npcs:[{...npc,memoryHash:"changed"}]}])expect(()=>decodeOwnedNpcMultiMemory(changed,7)).toThrow();
  });
});
