import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe,expect,it } from "vitest";
import { replayZoneTick } from "./replayZoneTick";
import { worldNatureCollision } from "../worldNatureCollision";
const file=process.env.AURION_HISTORICAL_COLLISION_FIXTURE;
(file?describe:describe.skip)("independent pre-city authority compatibility",()=>{
 it("replays an actual old-source receipt whose collider the new live plan removes",()=>{
  const f=JSON.parse(fs.readFileSync(file!,"utf8"));
  expect(f.sourceRevision).toBe("3b050eb06e2903f359cb2554048e6a077f9102ae");
  expect(f.sourceHash).toBe("c4ba0b2786e824183f17e662c18e691f8f177aef5bc6fe1fd5086a9ff08a69a9");
  const preserved=fs.readFileSync("shared/worldAssetProtocolPreCity.ts","utf8");
  // Documentation is the only permitted delta from the original executable source.
  const docPattern=/^\/\*\* Historical replay: [^\n]* \*\/\n/gm;
  expect(preserved.match(docPattern)).toHaveLength(3);
  expect(createHash("sha256").update(preserved.replace(docPattern,"")).digest("hex")).toBe(f.sourceHash);
  expect(f.receipt.stages.find((s:any)=>s.stageName==="MOVEMENT").hiddenShippedPlacementIds).toBeUndefined();
  const desired={x:f.boundary.x-340,z:f.boundary.z};
  expect(worldNatureCollision.resolve(f.boundary,desired)).toEqual(desired);
  const result=replayZoneTick({preState:f.preState,intents:f.intents,expectedReceipt:f.receipt});
  expect(result.verdict).toBe("MATCH");
  expect(result.postState).toEqual(f.postState);
 });
});
