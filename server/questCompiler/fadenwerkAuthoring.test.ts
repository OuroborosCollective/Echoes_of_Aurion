import { describe, expect, it } from "vitest";
import { aurionQuestRouter } from "../routes/aurionQuestRouter";
import type { TrpcContext } from "../_core/context";
import { inspectFadenwerk, toQuarantinedQuestTemplate } from "../../shared/fadenwerkLegacyAdapter";
import { QuestTemplateVersionSchema } from "../../shared/aurionQuestContract";
import { QuestValidator } from "./validator";
import { QuestRuntimeEngine } from "./runtime";
import { WorldFactEngine } from "./worldFacts";
import { QuestTemplateRegistry } from "./templateRegistry";
import { fixedOperationalClock } from "../../shared/operationalClock";

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
  it("blocks a lone start node before conversion instead of inventing an end", async () => {
    const sourceJson = JSON.stringify({version:1,questlines:[{id:"one",title:"One",entryNode:"entry",graph:{entry:{id:"entry",title:"Entry",choices:[]}}}]});
    const inspected = await caller().fadenwerkInspect({sourceJson});
    expect(inspected.questlines[0]!.issues).toContainEqual(expect.objectContaining({code:"DISTINCT_END_NODE_REQUIRED",severity:"blocker"}));
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1})).rejects.toThrow("FADENWERK_UNMAPPED");
    const valid = await caller().fadenwerkDraft({sourceJson:JSON.stringify(source()),questlineIndex:0,version:1});
    expect(QuestValidator.validateTemplate(valid.template).valid).toBe(true);
  });
  it("rejects dense drafts beyond persistence capacity before presenting an import", async () => {
    const graph = Object.fromEntries(Array.from({length:50}, (_, i) => ["n"+i, {
      id:"n"+i,title:"Node "+i,choices:i===49?[]:Array.from({length:i===0?1:16},(_,j)=>({id:"c"+j,label:"Weiter",nextNode:"n"+(i+1)})),
    }]));
    const document = {version:1,questlines:[{id:"dense",title:"Dense",entryNode:"n0",graph}]};
    const sourceJson = JSON.stringify(document);
    expect(Buffer.byteLength(sourceJson,"utf8")).toBeLessThan(120000);
    const template = toQuarantinedQuestTemplate(inspectFadenwerk(document).questlines[0]!,1);
    expect(QuestValidator.validateTemplate(template).valid).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(template),"utf8")).toBeGreaterThan(65535);
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1})).rejects.toThrow("FADENWERK_DRAFT_TOO_LARGE");
  });

  it("surfaces external item sources, colliding edges and ambiguous starts before conversion", async () => {
    const external = {...source(),itemsSource:"private-items.json"};
    const ambiguous = source();
    ambiguous.questlines[0]!.graph.start.choices.push({id:"also",label:"Also",nextNode:"end"});
    const collision = {version:1,questlines:[{id:"collision",title:"Collision",entryNode:"a",graph:{
      a:{id:"a",title:"A",choices:[{id:"b_c",label:"Continue",nextNode:"a_b"}]},
      a_b:{id:"a_b",title:"B",choices:[{id:"c",label:"Finish",nextNode:"end"}]},
      end:{id:"end",title:"End",choices:[]},
    }}]};
    for (const [document,code] of [[external,"EXTERNAL_CATALOG_NOT_IMPORTED"],[ambiguous,"START_EDGE_COUNT"],[collision,"EDGE_ID_COLLISION"]] as const) {
      const sourceJson = JSON.stringify(document);
      const inspected = await caller().fadenwerkInspect({sourceJson});
      expect(inspected.questlines[0]!.issues).toContainEqual(expect.objectContaining({code,severity:"blocker"}));
      await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1})).rejects.toMatchObject({code:"BAD_REQUEST",message:"FADENWERK_UNMAPPED"});
    }
  });

  it("runs an imported branching quest through the real deterministic quest engine", async () => {
    const sourceJson = JSON.stringify({version:1,questlines:[{id:"branching",title:"Branching",entryNode:"start",graph:{
      start:{id:"start",title:"Start",choices:[{id:"go",label:"Begin",nextNode:"branch"}]},
      branch:{id:"branch",title:"Choose",choices:[{id:"left",label:"Left",nextNode:"endLeft"},{id:"right",label:"Right",nextNode:"endRight"}]},
      endLeft:{id:"endLeft",title:"Left end",choices:[]},endRight:{id:"endRight",title:"Right end",choices:[]},
    }}]});
    const converted = await caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1});
    // Explicit isolated fixture activation, never production approval.
    const template = {...converted.template,active:true,quarantined:false};
    const run = () => {
      const engine = new QuestRuntimeEngine(new WorldFactEngine(),new QuestTemplateRegistry([template]),fixedOperationalClock(0));
      const offered = engine.compileAndOfferQuest({worldId:"isolated-fadenwerk",playerUserId:42,triggerEventId:"isolated-import",requestedTemplateId:template.templateId});
      const accepted = engine.acceptQuest(offered.instance,offered.plan);
      expect(accepted.updatedInstance).toMatchObject({state:"active",currentNodeId:"branch"});
      const chosen = engine.chooseBranch(accepted.updatedInstance,offered.plan,"edge_branch_right",{eventSequence:2});
      expect(chosen.updatedInstance.currentNodeId).toBe("endRight");
      expect(chosen.receipt.previousStateHash).toBe(accepted.receipt.resultStateHash);
      return {offered,accepted,chosen};
    };
    expect(run()).toEqual(run());
  });
  it("rejects edge identifiers that cannot pass the player choice route", async () => {
    const nodeId = "n".repeat(48), choiceId = "c".repeat(48);
    const sourceJson = JSON.stringify({version:1,questlines:[{id:"long",title:"Long",entryNode:"start",graph:{
      start:{id:"start",title:"Start",choices:[{id:"go",label:"Begin",nextNode:nodeId}]},
      [nodeId]:{id:nodeId,title:"Branch",choices:[{id:choiceId,label:"End",nextNode:"end"}]},
      end:{id:"end",title:"End",choices:[]},
    }}]});
    expect((await caller().fadenwerkInspect({sourceJson})).questlines[0]!.issues)
      .toContainEqual(expect.objectContaining({code:"EDGE_ID_TOO_LONG",severity:"blocker"}));
    await expect(caller().fadenwerkDraft({sourceJson,questlineIndex:0,version:1})).rejects.toThrow("FADENWERK_UNMAPPED");
  });

});
