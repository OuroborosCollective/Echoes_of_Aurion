import { describe, expect, it } from "vitest";
import { adminMcpCapabilities } from "./adminMcp";
import { getGlobalWorldAdminReadModel } from "./db";

const BASE_READ_TOOLS = [
  "aurion_admin_get_capabilities",
  "aurion_admin_get_world_overview",
  "aurion_admin_wolfram_status",
  "aurion_causality_status",
  "aurion_assurance_status",
  "aurion_tick_receipt_get",
  "aurion_tick_explain",
  "aurion_tick_replay",
  "aurion_replay_range",
  "aurion_runtime_identity",
  "aurion_recovery_plan",
  "aurion_donor_ledger",
  "aurion_donor_capability_explain",
  "aurion_admin_os3a_source",
  "aurion_admin_os3a_search",
  "aurion_admin_os3a_gap_scan",
] as const;

const WOLFRAM_READ_TOOLS = [
  "aurion_admin_wolfram_compute",
  "aurion_admin_wolfram_hints",
  "aurion_admin_wolfram_alpha_results",
  "aurion_admin_wolfram_alpha_context",
  "aurion_admin_wolfram_canary",
] as const;

const ASSET_TOOLS = [
  "aurion_admin_glb_plan",
  "aurion_admin_glb_import",
  "aurion_admin_glb_catalog",
  "aurion_admin_glb_assign",
  "aurion_admin_os3a_plan",
  "aurion_admin_os3a_apply",
  "aurion_admin_os3a_gap_reconcile",
  "aurion_admin_gds_status",
  "aurion_admin_gds_plan",
  "aurion_admin_gds_apply",
  "aurion_admin_named_npc_visual_plan",
  "aurion_admin_named_npc_visual_apply",
] as const;

const AUTHORING_TOOLS = [
  "aurion_admin_world_design_read",
  "aurion_admin_world_design_plan",
  "aurion_admin_world_design_apply",
  "aurion_admin_dungeon_design_read",
  "aurion_admin_dungeon_design_plan",
  "aurion_admin_dungeon_design_apply",
  "aurion_quest_draft_propose",
  "aurion_quest_publish_plan",
  "aurion_quest_publish",
] as const;

describe("adminMcp", () => {
  it("exposes server-side GDS/NPC writes only behind the dedicated asset scope", () => {
    const writable = adminMcpCapabilities(["aurion.admin.read", "aurion.admin.assets.write"], { wolframConfigured: true });
    expect(writable.tools.map(tool => tool.name)).toEqual([
      ...BASE_READ_TOOLS,
      ...WOLFRAM_READ_TOOLS,
      ...ASSET_TOOLS,
    ]);
    expect(writable.tools.filter(tool => tool.mode === "write").map(tool => tool.name)).toEqual([
      "aurion_admin_glb_import",
      "aurion_admin_glb_assign",
      "aurion_admin_os3a_apply",
      "aurion_admin_os3a_gap_reconcile",
      "aurion_admin_gds_apply",
      "aurion_admin_named_npc_visual_apply",
    ]);
    expect(writable.tools.map(tool => tool.name)).not.toEqual(expect.arrayContaining([...AUTHORING_TOOLS]));
    expect(writable.consent).toMatchObject({
      defaultAuthority: "read_only",
      gameplayMutation: "aurion_plan_confirm_only",
      assetWriteScope: "aurion.admin.assets.write",
      authoringWriteScope: null,
    });
  });

  it("exposes world and dungeon publish only behind the separate authoring scope", () => {
    const authoring = adminMcpCapabilities(["aurion.admin.read", "aurion.admin.authoring.write"]);
    expect(authoring.tools.map(tool => tool.name)).toEqual([...BASE_READ_TOOLS, ...AUTHORING_TOOLS]);
    expect(authoring.tools.filter(tool => tool.mode === "write").map(tool => tool.name)).toEqual([
      "aurion_admin_world_design_apply",
      "aurion_admin_dungeon_design_apply",
      "aurion_quest_draft_propose",
      "aurion_quest_publish",
    ]);
    expect(authoring.tools.map(tool => tool.name)).not.toEqual(expect.arrayContaining([...ASSET_TOOLS]));
    expect(authoring.consent).toMatchObject({
      assetWriteScope: null,
      authoringWriteScope: "aurion.admin.authoring.write",
    });
    expect(authoring.unavailable).toEqual(expect.arrayContaining([
      "raw_world_delta_write",
      "raw_object_placement",
      "npc_reward_mutation",
      "database_access",
      "shell_access",
      "git_or_vps_access",
    ]));
  });

  it("keeps Wolfram external-evidence tools conditional without mutation authority", () => {
    const unavailable = adminMcpCapabilities(["aurion.admin.read"]);
    expect(unavailable.wolfram).toEqual({ configured: false, mutationAuthority: "none" });
    expect(unavailable.tools.map(tool => tool.name)).toEqual(BASE_READ_TOOLS);

    const configured = adminMcpCapabilities(["aurion.admin.read"], { wolframConfigured: true });
    expect(configured.wolfram).toEqual({ configured: true, mutationAuthority: "none" });
    expect(configured.tools.map(tool => tool.name)).toEqual([...BASE_READ_TOOLS, ...WOLFRAM_READ_TOOLS]);
    expect(configured.tools.every(tool => tool.mode === "read")).toBe(true);
  });

  it("keeps the no-write token read-only", () => {
    const capabilities = adminMcpCapabilities();
    expect(capabilities.chatGptProMode).toBe("read_evidence_only");
    expect(capabilities.tools.map(tool => tool.name)).toEqual(BASE_READ_TOOLS);
    expect(capabilities.tools.every(tool => tool.mode === "read")).toBe(true);
    expect(capabilities.consent).toMatchObject({
      defaultAuthority: "read_only",
      assetWriteScope: null,
      authoringWriteScope: null,
    });
  });

  it("builds a deterministic preview when no database is configured instead of advancing world state", async () => {
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
