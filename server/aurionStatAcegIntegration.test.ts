import { describe, expect, it } from "vitest";
import { resolveAurionStatWallet, confirmAurionStatAllocation } from "../shared/aurionStatPointProtocol";
import { computeAcegCapabilities, resolveAcegEquipEligibility } from "../shared/aurionCapabilityEquipmentGraph";
import { scaleAcegEquipmentStat } from "./aurionAcegEquipmentAuthority";

describe("Aurion stat wallet to equipment requirements", () => {
  it("unlocks stat-gated items only after a confirmed spend, keeping level irrelevant", () => {
    const original=resolveAurionStatWallet({
      userId:8,character:{levelExact:"10",sourceReceiptId:"character-level:10"},masteries:[],allocations:[],
    });
    const receipt=confirmAurionStatAllocation(original,"strength","stat:spend:1");
    const spent=resolveAurionStatWallet({
      userId:8,character:{levelExact:"10",sourceReceiptId:"character-level:10"},masteries:[],allocations:[receipt],
    });
    const item={itemId:"blade:heavy",slot:"main_hand",modifiers:[],
      requirements:[{capability:"strength",minValue:11}],overEquipPenaltyPerPointBps:25};
    const toCapabilities=(wallet:typeof spent)=>computeAcegCapabilities({
      entityId:"player:8",tickIndex:1,
      permanentStats:wallet.attributes.map(a=>({capability:a.key,delta:Number(a.totalExact)})),
      skillRanks:[],professionModifiers:[],implants:[],buffs:[],
    });
    expect(resolveAcegEquipEligibility(item,toCapabilities(original)).eligible).toBe(false);
    expect(resolveAcegEquipEligibility(item,toCapabilities(spent)).eligible).toBe(true);
    expect(scaleAcegEquipmentStat(200,10000)).toBe(200);
  });
  it("retains earned/spent accounting and equipment eligibility after readback reconstruction", () => {
    const progression={userId:8,character:{levelExact:"12",sourceReceiptId:"level:12"},masteries:[],allocations:[]};
    const initial=resolveAurionStatWallet(progression);
    const event=confirmAurionStatAllocation(initial,"treatment","stat:spend:treatment");
    const projection=resolveAurionStatWallet({...progression,allocations:[event]});
    expect(projection.spentExact).toBe("1");
    expect(projection.availableExact).toBe("21");
    expect(projection.attributes.find(a=>a.key==="treatment")?.totalExact).toBe("1");
  });
});
