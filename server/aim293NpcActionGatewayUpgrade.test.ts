import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest=JSON.parse(readFileSync("vendor/wasd-npc/manifest.json","utf8")) as {
  sourceRevision:string;
  sourceFiles:Record<string,string>;
};

const AIM292_SOURCE_REVISION="ddce5911e7969f26a9c5b2739d3426004b32260d";
const AIM293_SOURCE_REVISION="002e7c35309816cd043295f47398e52fdb388694";
const AIM294_SOURCE_REVISION="28ecb7aec84271bd3bcc4fa5e1e7deef530804b6";
const AIM293_ACTION_GATEWAY_SHA256="29837a02c022d29c870d23bf4eb4e5eecc0d28a49afa53daafd91c26bbd65b02";
const AIM294_ACTION_GATEWAY_SHA256="709e684cd582fdd6874ff5088abdbe1ca49f8a7a2cc88134a21795b32828964b";
const unchangedV3ReceiptSurface={
  "server/src/aurion/npc/authority.ts":"970d06e258b0d19b431916468ea4f395c6d3898cd5a7827b1410d3b3b50a4430",
  "server/src/aurion/npc/canonical.ts":"7ab961f453bf3c1e83132e721434fd2f9ac9da8666c2665981d693ff87bac492",
  "server/src/aurion/npc/npcLifeProtocol.ts":"6eb2c7fbaa5faf40466be9731941c830a063a0da697ac48a958772dc756f7b27",
  "server/src/aurion/npc/npcNeeds.ts":"417d46f6d88410d00bc41d938ba0ab915989bddfc5bdd1c804af6b0185c7ec4d",
  "server/src/aurion/npc/npcPersistenceProtocol.ts":"5b8188251c185ae3c6efb5a5c995d64175e67a3889c0e7da64769947f1922752",
} as const;

describe("Wave 2 Step 27 AIM-292 -> AIM-293 -> AIM-294 capsule history",()=>{
  it("advances the reviewed capsule to AIM-294 without rewriting v3 decision receipt semantics",()=>{
    expect(AIM292_SOURCE_REVISION).not.toBe(AIM293_SOURCE_REVISION);
    expect(AIM293_SOURCE_REVISION).not.toBe(AIM294_SOURCE_REVISION);
    expect(manifest.sourceRevision).toBe(AIM294_SOURCE_REVISION);
    for(const [path,sha256] of Object.entries(unchangedV3ReceiptSurface)){
      expect(manifest.sourceFiles[path]).toBe(sha256);
    }
  });

  it("keeps AIM-293 historical while AIM-294 extends the reviewed action/semantic contract",()=>{
    expect(AIM293_ACTION_GATEWAY_SHA256).not.toBe(AIM294_ACTION_GATEWAY_SHA256);
    expect(manifest.sourceFiles["server/src/aurion/npc/actionGateway.ts"]).toBe(AIM294_ACTION_GATEWAY_SHA256);
    expect(manifest.sourceFiles["server/src/aurion/npc/semanticMemoryGraph.ts"]).toBe("0f18c4ab706bbca1ae87c3c4c5b063f6a246e7e24685e5da1480a36e3209a4c6");
    const source=readFileSync("vendor/wasd-npc/index.d.ts","utf8");
    const actionSource=readFileSync("vendor/wasd-npc/actionGateway.d.ts","utf8");
    const memorySource=readFileSync("vendor/wasd-npc/multiMemory.d.ts","utf8");
    expect(source).toContain('export * from "./actionGateway.js"');
    expect(source).toContain('export * from "./semanticMemoryGraph.js"');
    expect(actionSource).toContain("merchantActionReceiptId");
    expect(memorySource).toContain("sourceRevision: string");
    expect(readFileSync("server/npcMultiMemoryPersistence.ts","utf8")).toContain("row.sourceRevision !== memory.authority.sourceRevision");
  });
});
