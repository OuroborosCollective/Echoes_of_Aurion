import { describe, expect, it } from "vitest";
import { adminMcpCapabilities } from "./adminMcp";
import {
  AURION_ADMIN_AUTHORING_WRITE_SCOPE,
  AURION_ADMIN_GLB_WRITE_SCOPE,
} from "./adminMcpProtocol";

describe("Issue 144: admin/MCP gameplay authority boundary", () => {
  it("keeps the default surface read-only and explicitly denies raw gameplay writes", () => {
    const capabilities = adminMcpCapabilities([], { wolframConfigured: true });
    expect(capabilities.consent.defaultAuthority).toBe("read_only");
    expect(capabilities.consent.gameplayMutation).toBe(
      "aurion_plan_confirm_only"
    );
    expect(capabilities.tools.every(tool => tool.mode === "read")).toBe(true);
    expect(capabilities.unavailable).toEqual(
      expect.arrayContaining([
        "raw_world_delta_write",
        "raw_object_placement",
        "npc_reward_mutation",
        "causal_rollback",
        "database_access",
        "shell_access",
        "git_or_vps_access",
      ])
    );
  });

  it("never exposes gameplay mutation tools even when visual and authoring scopes are granted", () => {
    const capabilities = adminMcpCapabilities(
      [AURION_ADMIN_GLB_WRITE_SCOPE, AURION_ADMIN_AUTHORING_WRITE_SCOPE],
      { wolframConfigured: true }
    );
    const allowedScopedWrite =
      /^aurion_(?:admin_(?:glb_|os3a_|gds_|named_npc_visual_|world_design_|dungeon_design_)|quest_(?:draft_propose|publish))/;
    const writeTools = capabilities.tools.filter(tool => tool.mode === "write");
    expect(writeTools.length).toBeGreaterThan(0);
    expect(writeTools.every(tool => allowedScopedWrite.test(tool.name))).toBe(
      true
    );
    expect(capabilities.consent.gameplayMutation).toBe(
      "aurion_plan_confirm_only"
    );
    expect(capabilities.writePath).toContain(
      "typed Aurion plan→confirm writes"
    );
  });

  it("keeps donor/projection evidence descriptive rather than authoritative", () => {
    const capabilities = adminMcpCapabilities();
    const donor = capabilities.tools.find(
      tool => tool.name === "aurion_donor_ledger"
    );
    const overview = capabilities.tools.find(
      tool => tool.name === "aurion_admin_get_world_overview"
    );
    expect(donor?.mode).toBe("read");
    expect(donor?.description).toContain("donor migration ledger");
    expect(overview?.description).toContain("without advancing an epoch");
  });
});
