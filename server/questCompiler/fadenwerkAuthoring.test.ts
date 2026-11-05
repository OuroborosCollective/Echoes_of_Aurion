import { describe, expect, it } from "vitest";
import { aurionQuestRouter } from "../routes/aurionQuestRouter";
import type { TrpcContext } from "../_core/context";
import { inspectFadenwerk, toQuarantinedQuestTemplate } from "../../shared/fadenwerkLegacyAdapter";
import { QuestTemplateVersionSchema } from "../../shared/aurionQuestContract";

const source = () => ({version:1,questlines:[{id:"native",title:"Native Faden",entryNode:"start",
  graph:{start:{id:"start",title:"Start",choices:[{id:"go",label:"Weiter",nextNode:"end"}]},
  end:{id:"end",title:"End",choices:[]}}}]});
const caller = (role = "admin") => aurionQuestRouter.createCaller({user:{id:42,role}} as TrpcContext);

describe("shared Fadenwerk native authoring boundary", () => {
  it("reuses browser conversion and returns only an inactive canonical preview", async () => {
    const sourceJson = JSON.stringify(source());
    const inspected = await caller().fadenwerkInspect({sourceJson});
    expect(inspected).toMatchObject({previewOnly:true,questlines:[{id:"native",issues:[]}]});
    const prepared = await caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:3});
    expect(prepared.sourceHash).toBe(inspected.sourceHash);
    expect(prepared.template).toEqual(QuestTemplateVersionSchema.parse(toQuarantinedQuestTemplate(inspectFadenwerk(source()).questlines[0]!,3)));
    expect(prepared.template).toMatchObject({active:false,quarantined:true,version:3});
    expect(prepared).not.toHaveProperty("receipt");
  });
  it("requires the existing admin procedure and bounded input", async () => {
    const sourceJson = JSON.stringify(source());
    for (const endpoint of ["fadenwerkInspect","fadenwerkDraft"] as const) {
      const input = endpoint === "fadenwerkInspect" ? {sourceJson} : {sourceJson,questlineIndex:0,version:1};
      await expect((caller("user")[endpoint] as (input: unknown) => Promise<unknown>)(input)).rejects.toMatchObject({code:"FORBIDDEN"});
      await expect((aurionQuestRouter.createCaller({user:null} as TrpcContext)[endpoint] as (input: unknown) => Promise<unknown>)(input)).rejects.toThrow();
    }
    await expect(caller().fadenwerkInspect({sourceJson:"x".repeat(120001)})).rejects.toThrow();
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:100,version:1})).rejects.toThrow();
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:0})).rejects.toThrow();
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1,confirmation:"PUBLISH_QUEST_TEMPLATE"} as never)).rejects.toThrow();
  });
  it("rejects broken graphs, oversized UTF-8 and unmapped gameplay semantics", async () => {
    await expect(caller().fadenwerkInspect({sourceJson:"{"})).rejects.toMatchObject({code:"BAD_REQUEST"});
    await expect(caller().fadenwerkInspect({sourceJson:JSON.stringify({padding:"界".repeat(50000)})})).rejects.toThrow("FADENWERK_SOURCE_TOO_LARGE");
    const amplified = { ...source(), ["x".repeat(2000)]: true };
    amplified.questlines = Array.from({length:100}, (_, i) => ({...source().questlines[0]!,id:"line"+i}));
    await expect(caller().fadenwerkInspect({sourceJson:JSON.stringify(amplified)})).rejects.toThrow("FADENWERK_INSPECTION_TOO_LARGE");
    const doc = source();
    doc.questlines[0]!.graph.start.choices[0]!.nextNode = "missing";
    await expect(caller().fadenwerkInspect({sourceJson:JSON.stringify(doc)})).rejects.toMatchObject({code:"BAD_REQUEST"});
    const unsafe = source();
    Object.assign(unsafe.questlines[0]!.graph.start, {rewards:[{type:"gold",amount:99}]});
    const sourceJson = JSON.stringify(unsafe);
    expect((await caller().fadenwerkInspect({sourceJson})).questlines[0]!.issues.some(i=>i.code==="UNMAPPED_REWARD")).toBe(true);
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1})).rejects.toThrow("FADENWERK_UNMAPPED");
  });
});
