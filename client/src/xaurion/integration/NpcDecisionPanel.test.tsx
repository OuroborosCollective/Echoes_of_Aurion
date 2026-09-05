import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeNpcSnapshot } from "@shared/npcSnapshotProtocol";
import { NpcDecisionPanel } from "./NpcDecisionPanel";
const fixture=vi.hoisted(()=>({query:{data:undefined as unknown,isError:false,isStale:false,refetch:vi.fn()}}));
vi.mock("@/lib/trpc",()=>({trpc:{gameplay:{npcSnapshots:{useQuery:()=>fixture.query}}}}));
beforeEach(()=>{fixture.query.data=undefined;fixture.query.isError=false;});
describe("confirmed NPC decision panel",()=>{
 it("shows confirmed decisions and rejects a corrupt or foreign packet without partial display",()=>{
  const data=btoa(String.fromCharCode(...encodeNpcSnapshot([{npcId:"lyra",regionId:"observatory_threshold",resolutionIndex:2,goal:"trade",needs:{safety:0,resources:0,belonging:0,status:0,wealth:1,power:0},memoryCount:1,decisionHash:"12".repeat(32)}])));
  fixture.query.data={userId:7,format:"aurion-public-npc.v2",data};const {rerender}=render(<NpcDecisionPanel userId={7}/>);expect(screen.getByText("Handel treiben")).toBeTruthy();
  fixture.query.data={userId:8,format:"aurion-public-npc.v2",data};rerender(<NpcDecisionPanel userId={7}/>);expect(screen.queryByText("Handel treiben")).toBeNull();expect(screen.getByRole("alert")).toBeTruthy();
  fixture.query.data={userId:7,format:"aurion-public-npc.v2",data:data.slice(4)};rerender(<NpcDecisionPanel userId={7}/>);expect(screen.queryByText("Lyra")).toBeNull();expect(screen.getByRole("button",{name:"NPC-Verhalten aktualisieren"})).toBeTruthy();
 });
});
