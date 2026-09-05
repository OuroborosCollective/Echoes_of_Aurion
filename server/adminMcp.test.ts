import { describe, expect, it } from "vitest";
import { adminMcpCapabilities } from "./adminMcp";
import { getGlobalWorldAdminReadModel } from "./db";

describe("adminMcp", () => {
  it("exposes asset writes only for the dedicated scope without opening gameplay or shell authority", () => {
    const writable = adminMcpCapabilities(["aurion.admin.read", "aurion.admin.assets.write"]);
    expect(writable.tools.filter(tool => tool.mode === "write").map(tool => tool.name)).toEqual(["aurion_admin_glb_import", "aurion_admin_glb_assign"]);
    expect(writable.unavailable).toContain("shell_access");
    expect(writable.unavailable).toContain("npc_reward_mutation");
    expect(adminMcpCapabilities(["aurion.admin.read"]).tools.every(tool => tool.mode === "read")).toBe(true);
  });
  it("exposes only the bounded ChatGPT-Pro read surface", () => {
    const capabilities = adminMcpCapabilities();
    expect(capabilities.chatGptProMode).toBe("read_fetch_only");
    expect(capabilities.tools.map(tool => tool.name)).toEqual([
      "aurion_admin_get_capabilities",
      "aurion_admin_get_world_overview",
    ]);
    expect(capabilities.tools.every(tool => tool.mode === "read")).toBe(true);
    expect(capabilities.unavailable).toEqual(expect.arrayContaining([
      "world_delta_write",
      "object_placement",
      "quest_publish",
      "npc_reward_mutation",
      "database_access",
      "shell_access",
      "git_or_vps_access",
    ]));
  });

  it("builds a deterministic preview when no database is configured instead of advancing or persisting world state", async () => {
    const overview = await getGlobalWorldAdminReadModel();
    expect(overview.source).toBe("preview");
    expect(overview.updatedAt).toBeNull();
    expect(overview.globalWorld).toMatchObject({
      version: "aurion-global-world.v1",
      worldId: "echoes-of-aurion-global",
      epoch: 0,
      unlockedSectorCount: 6,
    });
  });
});
