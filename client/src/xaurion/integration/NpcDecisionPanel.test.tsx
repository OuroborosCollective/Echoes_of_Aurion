import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeNpcSnapshot } from "@shared/npcSnapshotProtocol";
import { NpcDecisionPanel } from "./NpcDecisionPanel";
const fixture=vi.hoisted(()=>({
 query:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()},
 memory:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()},
 actions:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()},
 graph:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()},
}));
vi.mock("@/lib/trpc",()=>({trpc:{gameplay:{npcActions:{useQuery:()=>fixture.actions},npcMultiMemory:{useQuery:()=>fixture.memory},npcSemanticGraph:{useQuery:()=>fixture.graph},npcSnapshots:{useQuery:()=>fixture.query}}}}));
beforeEach(()=>{fixture.query.data=undefined;fixture.query.isError=false;fixture.memory.data=undefined;fixture.memory.isError=false;fixture.actions.data=undefined;fixture.actions.isError=false;fixture.graph.data=undefined;fixture.graph.isError=false;});
describe("confirmed NPC decision panel",()=>{
 it("shows confirmed decisions and rejects a corrupt or foreign packet without partial display",()=>{
  const data=btoa(String.fromCharCode(...encodeNpcSnapshot([{npcId:"lyra",regionId:"observatory_threshold",resolutionIndex:2,goal:"trade",needs:{safety:0,resources:0,belonging:0,status:0,wealth:1,power:0},memoryCount:1,decisionHash:"12".repeat(32)}])));
  fixture.query.data={userId:7,format:"aurion-public-npc.v2",data};const {rerender}=render(<NpcDecisionPanel userId={7}/>);expect(screen.getByText("Handel treiben")).toBeTruthy();
  fixture.query.data={userId:8,format:"aurion-public-npc.v2",data};rerender(<NpcDecisionPanel userId={7}/>);expect(screen.queryByText("Handel treiben")).toBeNull();expect(screen.getByRole("alert")).toBeTruthy();
  fixture.query.data={userId:7,format:"aurion-public-npc.v2",data:data.slice(4)};rerender(<NpcDecisionPanel userId={7}/>);expect(screen.queryByText("Lyra")).toBeNull();expect(screen.getByRole("button",{name:"NPC-Verhalten aktualisieren"})).toBeTruthy();
 });
 it("shows four confirmed classes and hides foreign, malformed or failed memory readmodels",()=>{
  const npc={version:"wasd-npc-memory-public.v4",npcId:"ax1_merchant_observatory_threshold",resolutionIndex:42,goal:"trade",planStatus:"planned",memoryHash:"a".repeat(64),sourceRevision:"b".repeat(40),counts:{working:1,episodic:24,semantic:64,procedural:2},conflictedFacts:3,expiredFacts:4};
  fixture.memory.data={userId:7,format:"aurion-public-npc-memory.v4",npcs:[npc]};
  const {rerender}=render(<NpcDecisionPanel userId={7}/>);
  expect(screen.getByText("Valen")).toBeTruthy();expect(screen.getByText("Erinnerte Entscheidungen")).toBeTruthy();expect(screen.getByText("3 widersprüchliche Fakten")).toBeTruthy();expect(screen.getByText("4 abgelaufene Fakten")).toBeTruthy();
  fixture.memory.data={userId:8,format:"aurion-public-npc-memory.v4",npcs:[npc]};rerender(<NpcDecisionPanel userId={7}/>);expect(screen.queryByText("Valen")).toBeNull();
  fixture.memory.data={userId:7,format:"aurion-public-npc-memory.v4",npcs:[{...npc,counts:{...npc.counts,semantic:65}}]};rerender(<NpcDecisionPanel userId={7}/>);expect(screen.queryByText("Valen")).toBeNull();
  fixture.memory.isError=true;rerender(<NpcDecisionPanel userId={7}/>);expect(screen.getByRole("button",{name:"Erinnerungen aktualisieren"})).toBeTruthy();
 });
 it("shows only the bounded verified semantic graph and rejects foreign or raw-provenance packets",()=>{
  const node={nodeId:"smn_"+"1".repeat(60),kind:"goal",semanticKey:"trade",status:"active",depth:1,score:1200,payloadHash:"2".repeat(64)};
  const graph={npcId:"ax1_merchant_observatory_threshold",generation:9,graphHash:"3".repeat(64),sourceResultHash:"4".repeat(64),resultHash:"5".repeat(64),sourceRevision:"6".repeat(40),provenanceStatus:"VERIFIED",bounds:{maxDepth:4,maxCandidates:64,maxResults:32},nodes:[node],relations:[],excluded:{expired:1,contradicted:2,superseded:3}};
  fixture.graph.data={userId:7,format:"aurion-public-npc-semantic-graph.v2",graphs:[graph]};
  const {rerender}=render(<NpcDecisionPanel userId={7}/>);
  const row=screen.getByTestId("npc-semantic-graph-row");
  expect(row.getAttribute("data-graph-hash")).toBe("3".repeat(64));
  expect(screen.getByText("goal: trade")).toBeTruthy();
  expect(screen.getByText("1 abgelaufen · 2 widersprochen · 3 ersetzt")).toBeTruthy();
  fixture.graph.data={userId:8,format:"aurion-public-npc-semantic-graph.v2",graphs:[graph]};rerender(<NpcDecisionPanel userId={7}/>);
  expect(screen.queryByText("goal: trade")).toBeNull();
 fixture.graph.data={userId:7,format:"aurion-public-npc-semantic-graph.v2",graphs:[{...graph,rawProvenance:[{id:"private"}]}]};rerender(<NpcDecisionPanel userId={7}/>);
  expect(screen.queryByText("goal: trade")).toBeNull();
 });
 it("derives provenance atomically from the displayed verified graph without a second poll",()=>{
  const node={nodeId:"smn_"+"1".repeat(60),kind:"goal",semanticKey:"trade",status:"active",depth:1,score:1200,payloadHash:"2".repeat(64)};
  const graph={npcId:"ax1_merchant_observatory_threshold",generation:9,graphHash:"3".repeat(64),sourceResultHash:"4".repeat(64),resultHash:"5".repeat(64),sourceRevision:"6".repeat(40),provenanceStatus:"VERIFIED",bounds:{maxDepth:4,maxCandidates:64,maxResults:32},nodes:[node],relations:[],excluded:{expired:0,contradicted:0,superseded:0}};
  fixture.graph.data={userId:7,format:"aurion-public-npc-semantic-graph.v2",graphs:[graph]};
  const {rerender}=render(<NpcDecisionPanel userId={7}/>);
  const row=screen.getByTestId("npc-projection-provenance-row");
  expect(row.getAttribute("data-generation")).toBe("9");
  expect(row.getAttribute("data-source-revision")).toBe("6".repeat(40));
  expect(row.getAttribute("data-provenance-status")).toBe("VERIFIED");
  expect(screen.getByText("Quellrevision 666666666666…")).toBeTruthy();
  fixture.graph.data={userId:8,format:"aurion-public-npc-semantic-graph.v2",graphs:[graph]};rerender(<NpcDecisionPanel userId={7}/>);
  expect(screen.queryByTestId("npc-projection-provenance-row")).toBeNull();
  fixture.graph.data={userId:7,format:"aurion-public-npc-semantic-graph.v2",graphs:[{...graph,rawProvenance:[{id:"private"}]}]};rerender(<NpcDecisionPanel userId={7}/>);
  expect(screen.queryByTestId("npc-projection-provenance-row")).toBeNull();
  expect(screen.getByRole("button",{name:"Provenienz aktualisieren"})).toBeTruthy();
 });
 it("shows only effect-readback-confirmed actions and rejects a foreign action packet",()=>{
  const actionPacket={userId:7,format:"aurion-public-npc-actions.v1",actions:[{npcId:"ax1_merchant_observatory_threshold",actionReceiptId:"nar_"+"1".repeat(56),resolutionIndex:9,action:"caravan",effectsHash:"2".repeat(64),readbackHash:"3".repeat(64),sourceRevision:"4".repeat(40)}]};
  fixture.actions.data=actionPacket;
  const {rerender}=render(<NpcDecisionPanel userId={7}/>);
  expect(screen.getByText("Ausgeführt: caravan")).toBeTruthy();
  const row=screen.getByTestId("npc-action-row");
  expect(row.getAttribute("data-action-receipt-id")).toMatch(/^nar_/);
  expect(row.getAttribute("data-effect-readback-hash")).toBe("3".repeat(64));
  fixture.actions.data={...actionPacket,userId:8};
  rerender(<NpcDecisionPanel userId={7}/>);
  expect(screen.queryByText("Ausgeführt: caravan")).toBeNull();
  expect(screen.getByRole("button",{name:"Aktionen aktualisieren"})).toBeTruthy();
 });
});
