import {describe,it,expect} from "vitest";
import {aurionAuthoringRouter} from "../routes/aurionAuthoringRouter";
import type {TrpcContext} from "../_core/context";
const caller=(role="admin")=>aurionAuthoringRouter.createCaller({user:{id:42,role}} as TrpcContext);
describe("behavior authoring routes",()=>{
  it("returns explicit versioned templates and an untrusted-data prompt without inference",async()=>{
    for(const role of ["blacksmith","questgiver","guard","animal"] as const){
      const result=await caller().behaviorDraft({role,mode:"tree",brief:"Follow the canonical role constraints."});
      expect(result).toMatchObject({status:"DRAFT",generation:"EXPLICIT_TEMPLATE_NOT_AI",activation:"BLOCKED"});
      expect(result.artifact.version).toBe(1);
      expect(result).not.toHaveProperty("receipt");
    }
  });
  it("requires admin and rejects unknown effect-bearing inputs",async()=>{
    await expect(caller("user").behaviorActors()).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller("user").behaviorDraft({role:"guard",mode:"tree",brief:"Guard this area safely."})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller().behaviorDraft({role:"guard",mode:"tree",brief:"Guard this area safely.",apply:true} as never)).rejects.toThrow();
  });
});
