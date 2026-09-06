import { describe, expect, it } from "vitest";
import { adminMcpCapabilities } from "./adminMcp";
import { getGlobalWorldAdminReadModel } from "./db";

describe("adminMcp", () => {
  it("exposes asset writes only for the dedicated scope without opening gameplay or shell authority", () => {
    const writable = adminMcpCapabilities(["aurion.admin.read", "aurion.admin.assets.write"], { wolframConfigured: true });
    expect(writable.tools.filter(tool => tool.mode === "write").map(tool => tool.name)).toEqual(["aurion_admin_glb_import", "aurion_admin_glb_assign"]);
    expect(writable.unavailable).toContain("shell_access");
    expect(writable.unavailable).toContain("npc_reward_mutation");
    expect(adminMcpCapabilities(["aurion.admin.read"], { wolframConfigured: true }).tools.every(tool => tool.mode === "read")).toBe(true);
  });

  it("keeps Wolfram status visible but exposes provider calls only when the server key is configured", () => {
    const unavailable = adminMcpCapabilities(["aurion.admin.read"]);
    expect(unavailable.wolfram).toEqual({ configured: false, mutationAuthority: "none" });
    expect(unavailable.tools.map(tool => tool.name)).toEqual([
      "aurion_admin_get_capabilities",
      "aurion_admin_get_world_overview",
      "aurion_admin_wolfram_status",
    ]);

    const configured = adminMcpCapabilities(["aurion.admin.read"], { wolframConfigured: true });
    expect(configured.wolfram).toEqual({ configured: true, mutationAuthority: "none" });
    expect(configured.tools.map(tool => tool.name)).toEqual([
      "aurion_admin_get_capabilities",
      "aurion_admin_get_world_overview",
      "aurion_admin_wolfram_status",
      "aurion_admin_wolfram_compute",
      "aurion_admin_wolfram_hints",
      "aurion_admin_wolfram_alpha_results",
      "aurion_admin_wolfram_alpha_context",
      "aurion_admin_wolfram_canary",
    ]);
    expect(configured.tools.every(tool => tool.mode === "read")).toBe(true);
  });

  it("exposes only the bounded ChatGPT-Pro read surface when Wolfram is not configured", () => {
    const capabilities = adminMcpCapabilities();
    expect(capabilities.chatGptProMode).toBe("read_fetch_only");
    expect(capabilities.tools.map(tool => tool.name)).toEqual([
      "aurion_admin_get_capabilities",
      "aurion_admin_get_world_overview",
      "aurion_admin_wolfram_status",
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
