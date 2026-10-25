import { describe, expect, it } from "vitest";
import { inspectFadenwerk, toQuarantinedQuestTemplate, nextAuthoringVersion } from "./legacyQuestAdapter";
const basic = () => ({version:1,questlines:[{id:"first",title:"Erster Faden",entryNode:"start",
graph:{start:{id:"start",title:"Start",choices:[{id:"go",label:"Weiter",nextNode:"end"}]},
end:{id:"end",title:"Ende",choices:[] as {id:string;label:string;nextNode:string}[]}}}]});
describe("Fadenwerk legacy boundary", () => {
  it("converts only safe graph data into inactive quarantined Aurion template", () => {
    const t = toQuarantinedQuestTemplate(inspectFadenwerk(basic()).questlines[0]!,1);
    expect(t).toMatchObject({templateId:"fadenwerk_first",active:false,quarantined:true});
    expect(t.nodes.map(n=>n.type)).toEqual(["start","end"]);
    expect(t.edges[0]?.toNodeId).toBe("end");
    const v=nextAuthoringVersion(t);v.nodes[0]!.title="Changed";expect(t.nodes[0]!.title).toBe("Start");expect(v.version).toBe(2);
  });
  it("rejects dangling links, duplicate choices, cycles, and unreachable nodes", () => {
    const a=basic();a.questlines[0].graph.start.choices[0]!.nextNode="missing";
    expect(()=>inspectFadenwerk(a)).toThrow(/DANGLING_EDGE/);
    const b=basic();b.questlines[0].graph.start.choices.push({id:"go",label:"Again",nextNode:"end"});
    expect(()=>inspectFadenwerk(b)).toThrow(/DUPLICATE_CHOICE/);
    const c=basic();c.questlines[0].graph.end.choices.push({id:"back",label:"Back",nextNode:"start"});
    expect(()=>inspectFadenwerk(c)).toThrow(/GRAPH_CYCLE/);
    const d=basic() as Record<string,any>;d.questlines[0].graph.orphan={id:"orphan",title:"Orphan",choices:[]};
    expect(()=>inspectFadenwerk(d)).toThrow(/UNREACHABLE_NODE/);
  });
  it("rejects unknown semantic content and catalog impostors", () => {
    const a=basic() as Record<string,any>;
    a.items=[{id:"fake"}];a.questlines[0].graph.start.text="Story";
    a.questlines[0].graph.start.rewards=[{kind:"gold",amount:-4}];
    a.questlines[0].graph.start.featureTriggers=["combat"];
    a.questlines[0].graph.start.choices[0].requiresFlags=["admin"];
    const checked=inspectFadenwerk(a);
    for(const code of ["EXTERNAL_CATALOG_NOT_IMPORTED","UNMAPPED_NARRATIVE","UNMAPPED_REWARD","UNMAPPED_TRIGGER","UNMAPPED_FLAG"])
      expect(checked.issues.some(i=>i.code===code)).toBe(true);
    expect(()=>toQuarantinedQuestTemplate(checked.questlines[0]!,1)).toThrow(/FADENWERK_UNMAPPED/);
  });
  it("does not substitute demo quests for empty or invalid documents", () => {
    expect(()=>inspectFadenwerk({questlines:[]})).toThrow(/QUESTLINES_EMPTY/);
    expect(()=>inspectFadenwerk({questlines:"bad"})).toThrow(/QUESTLINES_INVALID/);
    expect(()=>inspectFadenwerk(null)).toThrow(/DOCUMENT_INVALID/);
  });
  it("quarantines an active template when creating the next authoring version", () => {
    const active = toQuarantinedQuestTemplate(inspectFadenwerk(basic()).questlines[0]!, 7);
    active.active = true;
    active.quarantined = false;
    const next = nextAuthoringVersion(active);
    expect(next).toMatchObject({ version: 8, active: false, quarantined: true });
    expect(active).toMatchObject({ version: 7, active: true, quarantined: false });
    next.nodes[0]!.title = "Geändert";
    expect(active.nodes[0]!.title).toBe("Start");
  });
  it("rejects excessive branch fan-out instead of locking the editor", () => {
    const doc = basic();
    for (let i = 1; i <= 16; i++) {
      doc.questlines[0]!.graph.start.choices.push({ id: "extra" + i, label: "Weiter", nextNode: "end" });
    }
    expect(() => inspectFadenwerk(doc)).toThrow(/CHOICE_COUNT_EXCESSIVE/);
    doc.questlines[0]!.graph.start.choices.pop();
    expect(inspectFadenwerk(doc).questlines[0]!.nodes[0]!.choices).toHaveLength(16);
  });
  it("keeps individual questline blockers isolated for explicit import selection", () => {
    const doc = basic();
    const bad = structuredClone(doc.questlines[0]) as Record<string, any>;
    bad.id = "second";
    bad.graph.start.text = "Ungebundener Storytext";
    const combined = { version: 1, questlines: [doc.questlines[0], bad] };
    const checked = inspectFadenwerk(combined);
    expect(checked.questlines[0]!.issues.filter(i => i.severity === "blocker")).toHaveLength(0);
    expect(checked.questlines[1]!.issues.some(i => i.code === "UNMAPPED_NARRATIVE")).toBe(true);
    expect(toQuarantinedQuestTemplate(checked.questlines[0]!, 1).quarantined).toBe(true);
    expect(() => toQuarantinedQuestTemplate(checked.questlines[1]!, 1)).toThrow(/FADENWERK_UNMAPPED/);
  });

});
