import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function mutationSurfaces(text: string): string[] {
  return [...text.matchAll(/trpc\.([A-Za-z0-9_.]+)\.useMutation\s*\(/g)].map(match => match[1]!).sort();
}

describe("Aurion website ownership boundary", () => {
  it("keeps Home as portal-only and AX1 as the explicit /play owner", () => {
    const home = source("client/src/pages/Home.tsx");
    const app = source("client/src/App.tsx");

    expect(home).not.toContain("MissionState");
    expect(home).not.toContain("AurionOpenWorldRuntime");
    expect(home).not.toContain("gameplay.");
    expect(home).not.toContain("crafting.");
    expect(home).not.toContain("market.");
    expect(home).not.toContain("groups.");
    expect(mutationSurfaces(home)).toEqual([]);

    expect(app).toContain('<Route path="/play" component={AurionPlayRoute} />');
    expect(app).toContain('<Route path="/" component={Home} />');
  });

  it("allows only social writes in the Aurion community host", () => {
    const overlay = source("client/src/components/CommunityOverlay.tsx");
    const host = source("client/src/components/AurionCommunityHost.tsx");

    expect(mutationSurfaces(overlay)).toEqual([
      "community.chat.send",
      "community.forum.createQuestion",
      "community.forum.reply",
    ]);
    for (const forbidden of ["gameplay.", "crafting.", "market.", "groups.", "guild.command", "world."]) {
      expect(overlay).not.toContain(`trpc.${forbidden}`);
    }
    expect(host).toContain("<CommunityOverlay");
    expect(mutationSurfaces(host)).toEqual([]);
  });

  it("allows owned read-only gameplay projections on account/community pages but no gameplay mutations", () => {
    const account = source("client/src/pages/Account.tsx");
    const community = source("client/src/pages/Community.tsx");

    expect(account).toContain("trpc.player.ui.useQuery");
    expect(account).toContain("trpc.crafting.read.useQuery");
    expect(account).toContain("trpc.groups.read.useQuery");
    expect(account).toContain("trpc.guild.mine.useQuery");
    expect(account).toContain("Read-only Projektion");

    for (const page of [account, community]) {
      expect(mutationSurfaces(page)).toEqual([]);
      expect(page).not.toMatch(/trpc\.[A-Za-z0-9_.]+\.(?:mutate|mutateAsync)\s*\(/);
    }

    for (const forbidden of [
      "trpc.gameplay.startEncounter",
      "trpc.gameplay.act",
      "trpc.gameplay.acceptQuest",
      "trpc.gameplay.completeQuest",
      "trpc.crafting.craft",
      "trpc.market.createListing",
      "trpc.market.buyListing",
      "trpc.groups.command",
      "trpc.guild.command",
      "trpc.player.collectLoot",
      "trpc.player.equipItem",
      "trpc.player.unequipItem",
      "trpc.player.chooseClass",
      "trpc.player.setWeaponLoadout",
    ]) {
      expect(account).not.toContain(forbidden);
      expect(community).not.toContain(forbidden);
    }
  });

  it("ships the canonical ownership contract with WASD as sole gameplay owner", () => {
    const contract = source("ARCHITECTURE_OWNERSHIP.md");
    expect(contract).toContain("Aurion = Host + Website + Account + Community + DB + Evidence");
    expect(contract).toContain("AX1    = Spielruntime + UI + Renderer + Input");
    expect(contract).toContain("WASD   = Gameplayregeln + deterministische Simulation");
    expect(contract).toContain("Aurion Website, Admin UI, Admin MCP, Datenbankhelper, Worker oder Service Cells dürfen nicht");
  });
});
