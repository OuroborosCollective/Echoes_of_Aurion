import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeNpcSnapshot } from "@shared/npcSnapshotProtocol";
import { NpcDecisionPanel } from "./NpcDecisionPanel";
const fixture=vi.hoisted(()=>({query:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()},memory:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()}}));
vi.mock("@/lib/trpc",()=>({trpc:{gameplay:{npcMultiMemory:{useQuery:()=>fixture.memory},npcSnapshots:{useQuery:()=>fixture.query}}}}));
beforeEach(()=>{fixture.query.data=undefined;fixture.query.isError=false;fixture.memory.data=undefined;fixture.memory.isError=false;});
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
});
