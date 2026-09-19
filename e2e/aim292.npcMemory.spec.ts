import { expect, test } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";
import { decodeOwnedNpcMultiMemory } from "../shared/npcMultiMemoryReadmodel";
import { decodeOwnedNpcActions } from "../shared/npcActionReadmodel";
import { decodeOwnedNpcSemanticGraphs } from "../shared/npcSemanticGraphReadmodel";
const pin=JSON.parse(await readFile(new URL("../config/wasd-npc-capsule.json",import.meta.url),"utf8"));
test.skip(process.env.AURION_E2E_ISOLATED!=="1","Requires disposable authenticated MariaDB");

const profiles=[{name:"phone",width:412,height:915},{name:"tablet",width:800,height:1280},{name:"desktop",width:1440,height:1000}] as const;
for(const profile of profiles){
  test(`actual confirmed NPC memory on ${profile.name}`,async({page,baseURL},testInfo)=>{
    expect(baseURL).toBe("http://127.0.0.1:3000");expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/aurion_browser_test");
    await page.setViewportSize(profile);
    const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await register(page,`aim292_${profile.name}`);
    const {runtime}=await enterAx1(page);
    await expect.poll(async()=>{const r=await page.request.get("/healthz");return (await r.json()).npcLife?.multiMemory?.sourceRevision;},{timeout:100_000}).toBe(pin.sourceRevision);
    await runtime.getByRole("button",{name:"Aufträge",exact:true}).click();
    await page.getByRole("button",{name:"Kontakte",exact:true}).click();
    const panel=page.getByTestId("npc-multi-memory-panel");
    const merchant=panel.locator('[data-npc-id="ax1_merchant_observatory_threshold"]');
    await expect(merchant).toBeVisible({timeout:30_000});
    await expect(merchant.getByText("Valen",{exact:true})).toBeVisible();
    for(const label of ["Aktueller Fokus","Erinnerte Entscheidungen","Gesicherte Fakten","Fähigkeiten"])await expect(merchant.getByText(label,{exact:true})).toBeVisible();
    const displayed=await merchant.evaluate(element=>({hash:element.getAttribute("data-memory-hash"),index:Number(element.getAttribute("data-resolution-index")),counts:Array.from(element.querySelectorAll("dd"),node=>node.textContent)}));
    const {hash,index}=displayed;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);expect(index).toBeGreaterThanOrEqual(0);
    const actionPanel=page.getByTestId("npc-action-panel");
    const actionRow=actionPanel.locator('[data-npc-id="ax1_merchant_observatory_threshold"]');
    await expect(actionRow).toBeVisible({timeout:30_000});
    const displayedAction=await actionRow.evaluate(element=>({
      actionReceiptId:element.getAttribute("data-action-receipt-id"),
      readbackHash:element.getAttribute("data-effect-readback-hash"),
      resolutionIndex:Number(element.getAttribute("data-resolution-index")),
    }));
    expect(displayedAction.actionReceiptId).toMatch(/^nar_[a-f0-9]{56}$/);
    expect(displayedAction.readbackHash).toMatch(/^[a-f0-9]{64}$/);
    const actionResponse=await page.request.get('/api/trpc/gameplay.npcActions?input='+encodeURIComponent(JSON.stringify({json:null})));
    expect(actionResponse.status()).toBe(200);
    const actionBody=await actionResponse.json();
    const actionPacket=actionBody.result.data.json;
    const actionProjection=decodeOwnedNpcActions(actionPacket,actionPacket.userId).actions.find(entry=>entry.npcId==="ax1_merchant_observatory_threshold")!;
    expect(actionProjection.actionReceiptId).toBe(displayedAction.actionReceiptId);
    expect(actionProjection.readbackHash).toBe(displayedAction.readbackHash);
    expect(actionProjection.resolutionIndex).toBe(displayedAction.resolutionIndex);
    expect(actionProjection.sourceRevision).toBe(pin.sourceRevision);
    const response=await page.request.get('/api/trpc/gameplay.npcMultiMemory?input='+encodeURIComponent(JSON.stringify({json:null})));
    expect(response.status()).toBe(200);const body=await response.json();const packet=body.result.data.json;
    const parsed=decodeOwnedNpcMultiMemory(packet,packet.userId),projection=parsed.npcs.find(n=>n.npcId==="ax1_merchant_observatory_threshold")!;
    expect(projection.sourceRevision).toBe(pin.sourceRevision);expect(projection.counts.procedural).toBe(2);expect(projection.counts.semantic).toBeGreaterThan(0);
    const graphResponse=await page.request.get('/api/trpc/gameplay.npcSemanticGraph?input='+encodeURIComponent(JSON.stringify({json:null})));
    expect(graphResponse.status()).toBe(200);
    const graphBody=await graphResponse.json(),graphPacket=graphBody.result.data.json;
    const graphParsed=decodeOwnedNpcSemanticGraphs(graphPacket,graphPacket.userId);
    const graphProjection=graphParsed.graphs.find(graph=>graph.npcId==="ax1_merchant_observatory_threshold")!;
    expect(graphProjection.sourceRevision).toBe(pin.sourceRevision);
    expect(graphProjection.provenanceStatus).toBe("VERIFIED");
    expect(graphProjection.bounds).toEqual({maxDepth:4,maxCandidates:64,maxResults:32});
    expect(graphProjection.relations.some(edge=>edge.kind==="performed_action")).toBe(true);
    const publicGraphJson=JSON.stringify(graphPacket);
    for(const forbidden of ["provenance","receiptJson","effectSetJson","memoryJson","databaseCredential","actionReceiptId","effectReadbackId","memoryReceiptId"]) expect(publicGraphJson).not.toContain(forbidden);
    const graphRow=page.getByTestId("npc-semantic-graph-row").filter({has:page.locator('[data-npc-id="ax1_merchant_observatory_threshold"]')});
    const merchantGraph=page.locator('[data-testid="npc-semantic-graph-row"][data-npc-id="ax1_merchant_observatory_threshold"]');
    await expect(merchantGraph).toBeVisible({timeout:30_000});
    const displayedGraph=await merchantGraph.evaluate(element=>({
      graphHash:element.getAttribute("data-graph-hash"),
      resultHash:element.getAttribute("data-result-hash"),
      sourceResultHash:element.getAttribute("data-source-result-hash"),
      generation:Number(element.getAttribute("data-generation")),
      provenanceStatus:element.getAttribute("data-provenance-status"),
      text:element.textContent,
    }));
    expect(graphRow).toBeDefined();
    expect(displayedGraph).toMatchObject({graphHash:graphProjection.graphHash,resultHash:graphProjection.resultHash,sourceResultHash:graphProjection.sourceResultHash,generation:graphProjection.generation,provenanceStatus:"VERIFIED"});
    const semanticViewportBaseline={...displayedGraph};
    for(const viewport of profiles){
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      await expect(merchantGraph).toBeVisible();
      const atViewport=await merchantGraph.evaluate(element=>({
        graphHash:element.getAttribute("data-graph-hash"),
        resultHash:element.getAttribute("data-result-hash"),
        sourceResultHash:element.getAttribute("data-source-result-hash"),
        generation:Number(element.getAttribute("data-generation")),
        provenanceStatus:element.getAttribute("data-provenance-status"),
        text:element.textContent,
      }));
      expect(atViewport).toEqual(semanticViewportBaseline);
    }
    await page.setViewportSize(profile);
    const pool=createPool(process.env.DATABASE_URL!);
    try{
      const [accounts]=await pool.query<RowDataPacket[]>("SELECT userId FROM localCredentials WHERE handle=?",[`aim292_${profile.name}`]);
      expect(accounts).toHaveLength(1);expect(packet.userId).toBe(Number(accounts[0].userId));
      // Compare to the exact displayed historical row even if another real tick has since advanced.
      const [rows]=await pool.query<RowDataPacket[]>("SELECT sourceRevision,sourceSha256,memoryHash,memoryJson,sourceDecisionReceiptId,receiptHash FROM aurionNpcMemoryReceiptsV4 WHERE npcId=? AND resolutionIndex=?",[projection.npcId,index]);
      expect(rows).toHaveLength(1);expect(rows[0].memoryHash).toBe(hash);expect(rows[0].sourceRevision).toBe(pin.sourceRevision);expect(rows[0].sourceSha256).toBe(pin.sourceSha256);
      const memory=JSON.parse(rows[0].memoryJson);expect(memory.lastResolutionIndex).toBe(index);expect(memory.memoryHash).toBe(hash);
      const [actions]=await pool.query<RowDataPacket[]>("SELECT id,effectsHash,sourceRevision,successorNpcReceiptId FROM aurionNpcActionReceipts WHERE id=?",[displayedAction.actionReceiptId]);
      expect(actions).toHaveLength(1);expect(actions[0].sourceRevision).toBe(pin.sourceRevision);
      const [readbacks]=await pool.query<RowDataPacket[]>("SELECT id,effectsHash,readbackHash,npcReceiptId FROM aurionNpcActionEffectReadbacks WHERE actionReceiptId=?",[displayedAction.actionReceiptId]);
      expect(readbacks).toHaveLength(1);expect(readbacks[0].effectsHash).toBe(actions[0].effectsHash);expect(readbacks[0].readbackHash).toBe(displayedAction.readbackHash);
      const [links]=await pool.query<RowDataPacket[]>("SELECT effectReadbackId,memoryReceiptId FROM aurionNpcActionMemoryLinks WHERE actionReceiptId=?",[displayedAction.actionReceiptId]);
      expect(links).toHaveLength(1);expect(links[0].effectReadbackId).toBe(readbacks[0].id);
      expect(actions[0].successorNpcReceiptId).toBe(readbacks[0].npcReceiptId);
      const [graphRows]=await pool.query<RowDataPacket[]>("SELECT id,generation,graphHash,sourceRevision,sourceSha256,capsuleManifestSha256,receiptHash FROM aurionSemanticGraphReceiptsV2 WHERE npcId=? AND generation=?",[graphProjection.npcId,graphProjection.generation]);
      expect(graphRows).toHaveLength(1);
      expect(graphRows[0]).toMatchObject({graphHash:graphProjection.graphHash,sourceRevision:pin.sourceRevision,sourceSha256:pin.sourceSha256,capsuleManifestSha256:pin.manifestSha256});
      expect(graphRows[0].receiptHash).toMatch(/^[a-f0-9]{64}$/);
      const [graphEdges]=await pool.query<RowDataPacket[]>("SELECT id,kind,fromNodeId,toNodeId FROM aurionSemanticGraphEdgesV2 WHERE graphReceiptId=?",[graphRows[0].id]);
      const performedEdges=graphEdges.filter(row=>row.kind==="performed_action");
      expect(performedEdges).toHaveLength(1);
      const [performedProv]=await pool.query<RowDataPacket[]>("SELECT provenanceKind,provenanceHash,sourceRevision FROM aurionSemanticGraphProvenanceV2 WHERE graphReceiptId=? AND elementType='edge' AND elementId=? ORDER BY provenanceKind,provenanceId",[graphRows[0].id,performedEdges[0].id]);
      expect(performedProv.map(row=>row.provenanceKind)).toEqual(expect.arrayContaining(["decision_receipt","action_receipt","effect_readback","memory_link"]));
      expect(performedProv.every(row=>row.sourceRevision===pin.sourceRevision&&/^[a-f0-9]{64}$/.test(row.provenanceHash))).toBe(true);
      const counts=[memory.working.confirmedEventIds.length,memory.episodic.length,memory.semantic.length,memory.procedural.length];
      expect(displayed.counts).toEqual(counts.map(String));
      await testInfo.attach("actual-memory-readback",{body:JSON.stringify({aurionRevision:process.env.AURION_RELEASE_SHA,wasdRevision:pin.sourceRevision,profile:profile.name,npcId:projection.npcId,resolutionIndex:index,memoryHash:hash,receiptHash:rows[0].receiptHash,counts,sourceDecisionReceiptId:rows[0].sourceDecisionReceiptId,scope:"Actual AIM-292 memory + AIM-293 effect readback + AIM-294 graph DB provenance -> bounded authenticated AX1 projection",graphHash:graphProjection.graphHash,graphResultHash:graphProjection.resultHash,graphSourceResultHash:graphProjection.sourceResultHash}),contentType:"application/json"});
    }finally{await pool.end();}
    await page.screenshot({path:testInfo.outputPath("npc-memory-confirmed.png")});
    await page.getByRole("button",{name:"Quest-Buch schließen",exact:true}).click();
    await expect(page.getByRole("button",{name:"Quest-Buch schließen",exact:true})).toHaveCount(0);
    await runtime.getByRole("button",{name:"ZUR STERNWARTE",exact:true}).click();
    await expect(page).toHaveURL(baseURL+"/");
    await enterAx1(page);await runtime.getByRole("button",{name:"Aufträge",exact:true}).click();await page.getByRole("button",{name:"Kontakte",exact:true}).click();
    await expect(merchant).toBeVisible({timeout:30_000});expect(Number(await merchant.getAttribute("data-resolution-index"))).toBeGreaterThanOrEqual(index);
    expect(errors).toEqual([]);
  });
}
