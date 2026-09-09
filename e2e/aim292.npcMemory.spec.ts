import { expect, test } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";
import { decodeOwnedNpcMultiMemory } from "../shared/npcMultiMemoryReadmodel";
const pin=JSON.parse(await readFile(new URL("../config/wasd-npc-capsule.json",import.meta.url),"utf8"));
test.skip(process.env.AURION_E2E_ISOLATED!=="1","Requires disposable authenticated MariaDB");

for(const profile of [{name:"phone",width:412,height:915},{name:"tablet",width:800,height:1280},{name:"desktop",width:1440,height:1000}]){
  test(`actual confirmed NPC memory on ${profile.name}`,async({page,baseURL},testInfo)=>{
    expect(baseURL).toBe("http://127.0.0.1:3000");expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/aurion_browser_test");
    await page.setViewportSize(profile);
    const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await register(page,`aim292_${profile.name}`);
    const {runtime}=await enterAx1(page);
    await expect.poll(async()=>{const r=await page.request.get("/healthz");return (await r.json()).npcLife?.multiMemory?.sourceRevision;},{timeout:100_000}).toBe(pin.sourceRevision);
    await runtime.getByRole("button",{name:"Aufträge & Kontakte",exact:true}).click();
    await page.getByRole("button",{name:"Kontakte",exact:true}).click();
    const panel=page.getByTestId("npc-multi-memory-panel");
    const merchant=panel.locator('[data-npc-id="ax1_merchant_observatory_threshold"]');
    await expect(merchant).toBeVisible({timeout:30_000});
    await expect(merchant.getByText("Valen",{exact:true})).toBeVisible();
    for(const label of ["Aktueller Fokus","Erinnerte Entscheidungen","Gesicherte Fakten","Fähigkeiten"])await expect(merchant.getByText(label,{exact:true})).toBeVisible();
    const displayed=await merchant.evaluate(element=>({hash:element.getAttribute("data-memory-hash"),index:Number(element.getAttribute("data-resolution-index")),counts:Array.from(element.querySelectorAll("dd"),node=>node.textContent)}));
    const {hash,index}=displayed;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);expect(index).toBeGreaterThanOrEqual(0);
    const response=await page.request.get('/api/trpc/gameplay.npcMultiMemory?input='+encodeURIComponent(JSON.stringify({json:null})));
    expect(response.status()).toBe(200);const body=await response.json();const packet=body.result.data.json;
    const parsed=decodeOwnedNpcMultiMemory(packet,packet.userId),projection=parsed.npcs.find(n=>n.npcId==="ax1_merchant_observatory_threshold")!;
    expect(projection.sourceRevision).toBe(pin.sourceRevision);expect(projection.counts.procedural).toBe(2);expect(projection.counts.semantic).toBeGreaterThan(0);
    const pool=createPool(process.env.DATABASE_URL!);
    try{
      const [accounts]=await pool.query<RowDataPacket[]>("SELECT userId FROM localCredentials WHERE handle=?",[`aim292_${profile.name}`]);
      expect(accounts).toHaveLength(1);expect(packet.userId).toBe(Number(accounts[0].userId));
      // Compare to the exact displayed historical row even if another real tick has since advanced.
      const [rows]=await pool.query<RowDataPacket[]>("SELECT sourceRevision,sourceSha256,memoryHash,memoryJson,sourceDecisionReceiptId,receiptHash FROM aurionNpcMemoryReceiptsV4 WHERE npcId=? AND resolutionIndex=?",[projection.npcId,index]);
      expect(rows).toHaveLength(1);expect(rows[0].memoryHash).toBe(hash);expect(rows[0].sourceRevision).toBe(pin.sourceRevision);expect(rows[0].sourceSha256).toBe(pin.sourceSha256);
      const memory=JSON.parse(rows[0].memoryJson);expect(memory.lastResolutionIndex).toBe(index);expect(memory.memoryHash).toBe(hash);
      const counts=[memory.working.confirmedEventIds.length,memory.episodic.length,memory.semantic.length,memory.procedural.length];
      expect(displayed.counts).toEqual(counts.map(String));
      await testInfo.attach("actual-memory-readback",{body:JSON.stringify({aurionRevision:process.env.AURION_RELEASE_SHA,wasdRevision:pin.sourceRevision,profile:profile.name,npcId:projection.npcId,resolutionIndex:index,memoryHash:hash,receiptHash:rows[0].receiptHash,counts,sourceDecisionReceiptId:rows[0].sourceDecisionReceiptId,scope:"Actual autonomous zone tick -> persisted WASD memory -> authenticated AX1 UI"}),contentType:"application/json"});
    }finally{await pool.end();}
    await page.screenshot({path:testInfo.outputPath("npc-memory-confirmed.png")});
    await runtime.getByRole("button",{name:"ZUR STERNWARTE",exact:true}).click();
    await expect(page).toHaveURL(baseURL+"/");
    await enterAx1(page);await runtime.getByRole("button",{name:"Aufträge & Kontakte",exact:true}).click();await page.getByRole("button",{name:"Kontakte",exact:true}).click();
    await expect(merchant).toBeVisible({timeout:30_000});expect(Number(await merchant.getAttribute("data-resolution-index"))).toBeGreaterThanOrEqual(index);
    expect(errors).toEqual([]);
  });
}
