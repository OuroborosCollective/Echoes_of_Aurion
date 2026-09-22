import { describe, expect, it } from "vitest";
import { AdminQuestStudioService } from "./adminService";
import { QuestTemplateVersion } from "../../shared/aurionQuestContract";

describe("AdminQuestStudioService Integration (AIM-298 #463)", () => {
  const validTemplateV1: QuestTemplateVersion = {
    templateId: "tpl_ancient_beacon",
    version: 1,
    title: "Light the Ancient Beacon",
    description: "Rekindle the ancient beacon tower.",
    active: true,
    quarantined: false,
    prerequisiteFacts: [],
    roles: [
      {
        roleName: "giver",
        entityType: "npc",
        predicates: [],
      },
      {
        roleName: "target_location",
        entityType: "location",
        predicates: [],
      },
    ],
    nodes: [
      {
        id: "node_start",
        title: "Speak with Guard",
        description: "Speak with the beacon guard.",
        type: "start",
        actionsOnEnter: [],
        actionsOnExit: [],
      },
      {
        id: "node_light",
        title: "Light the beacon",
        description: "Ignite the flame atop the beacon tower.",
        type: "objective",
        objective: {
          key: "light_beacon",
          description: "Ignite beacon",
          targetValue: 1,
          eventBinding: {
            source: "world_chunk_delta",
            event: "structure_placed",
            matchField: "targetId",
            matchValue: "beacon_fire",
          },
        },
        actionsOnEnter: [],
        actionsOnExit: [],
      },
      {
        id: "node_end",
        title: "Beacon Lit",
        description: "The beacon burns brightly across Aurion.",
        type: "end",
        actionsOnEnter: [],
        actionsOnExit: [],
      },
    ],
    edges: [
      {
        id: "edge_start_to_light",
        fromNodeId: "node_start",
        toNodeId: "node_light",
        priority: 0,
      },
      {
        id: "edge_light_to_end",
        fromNodeId: "node_light",
        toNodeId: "node_end",
        priority: 0,
      },
    ],
    outcomes: [
      {
        id: "outcome_success",
        semanticFlag: "beacon_rekindled",
        factEffects: [],
        rewards: [
          {
            type: "xp",
            amount: 500,
          },
        ],
      },
    ],
    maxCompositionDepth: 10,
  };

  it("admin creates and publishes template → persists version 1 with valid hash", async () => {
    const service = new AdminQuestStudioService();

    const publishResult = await service.publishTemplate({
      actorUserId: 1,
      actorRole: "admin",
      template: validTemplateV1,
    });

    expect(publishResult.template.templateId).toBe("tpl_ancient_beacon");
    expect(publishResult.template.version).toBe(1);
    expect(publishResult.templateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(publishResult.templateSetHash).toMatch(/^[a-f0-9]{64}$/);

    const templates = await service.getTemplates();
    const registered = templates.find(t => t.templateId === "tpl_ancient_beacon");
    expect(registered).toBeDefined();
    expect(registered?.version).toBe(1);
  });

  it("admin publishes update → creates version 2, active quests on v1 stay on v1", async () => {
    const service = new AdminQuestStudioService();

    // 1. Publish v1
    await service.publishTemplate({
      actorUserId: 1,
      actorRole: "admin",
      template: validTemplateV1,
    });

    // 2. Offer quest on v1 to player 100
    const offered = await service.offerQuest({
      playerUserId: 100,
      templateId: "tpl_ancient_beacon",
    });
    expect(offered.instance.templateVersion).toBe(1);

    // 3. Publish v2 with updated description and reward
    const v2Update = {
      ...validTemplateV1,
      title: "Light the Ancient Beacon (Enhanced)",
      description: "Rekindle the ancient beacon tower with sacred oils.",
      outcomes: [
        {
          id: "outcome_success",
          semanticFlag: "beacon_rekindled",
          factEffects: [],
          rewards: [
            {
              type: "xp" as const,
              amount: 1000,
            },
          ],
        },
      ],
    };

    const updateResult = await service.updateTemplate({
      actorUserId: 1,
      actorRole: "admin",
      templateId: "tpl_ancient_beacon",
      template: v2Update,
    });

    expect(updateResult.template.templateId).toBe("tpl_ancient_beacon");
    expect(updateResult.template.version).toBe(2);

    // 4. Verify existing active instance for player 100 remains pinned to v1
    const playerInstance = (await service.listInstances({ playerUserId: 100 }))[0];
    expect(playerInstance).toBeDefined();
    expect(playerInstance.templateId).toBe("tpl_ancient_beacon");
    expect(playerInstance.templateVersion).toBe(1);

    // 5. Subsequent quest offer uses the updated version 2
    const offeredV2 = await service.offerQuest({
      playerUserId: 101,
      templateId: "tpl_ancient_beacon",
    });
    expect(offeredV2.instance.templateVersion).toBe(2);
  });

  it("non-admin attempts mutation → rejected fail-closed with QUEST_ADMIN_FORBIDDEN", async () => {
    const service = new AdminQuestStudioService();

    // Non-admin attempting publish
    await expect(
      service.publishTemplate({
        actorUserId: 99,
        actorRole: "user",
        template: validTemplateV1,
      })
    ).rejects.toThrow("QUEST_ADMIN_FORBIDDEN");

    // Non-admin attempting update
    await expect(
      service.updateTemplate({
        actorUserId: 99,
        actorRole: "user",
        templateId: "tpl_ancient_beacon",
        template: validTemplateV1,
      })
    ).rejects.toThrow("QUEST_ADMIN_FORBIDDEN");

    // Non-admin attempting quarantine
    await expect(
      service.quarantineTemplate({
        actorUserId: 99,
        actorRole: "user",
        templateId: "tpl_ancient_beacon",
        version: 1,
        quarantined: true,
      })
    ).rejects.toThrow("QUEST_ADMIN_FORBIDDEN");
  });

  it("invalid template graph (cycles, missing roles) → rejected with validation errors", async () => {
    const service = new AdminQuestStudioService();

    // 1. Template with cycle in edges
    const cyclicTemplate: QuestTemplateVersion = {
      ...validTemplateV1,
      templateId: "tpl_cyclic_quest",
      version: 1,
      edges: [
        {
          id: "edge_start_to_light",
          fromNodeId: "node_start",
          toNodeId: "node_light",
          priority: 0,
        },
        {
          id: "edge_light_to_start",
          fromNodeId: "node_light",
          toNodeId: "node_start", // CYCLE!
          priority: 0,
        },
        {
          id: "edge_light_to_end",
          fromNodeId: "node_light",
          toNodeId: "node_end",
          priority: 0,
        },
      ],
    };

    await expect(
      service.publishTemplate({
        actorUserId: 1,
        actorRole: "admin",
        template: cyclicTemplate,
      })
    ).rejects.toThrow(/QUEST_TEMPLATE_VALIDATION_FAILED.*CYCLE_DETECTED/);

    // 2. Template with missing roles
    const noRolesTemplate: QuestTemplateVersion = {
      ...validTemplateV1,
      templateId: "tpl_no_roles_quest",
      version: 1,
      roles: [], // MISSING ROLES!
    };

    await expect(
      service.publishTemplate({
        actorUserId: 1,
        actorRole: "admin",
        template: noRolesTemplate,
      })
    ).rejects.toThrow(/QUEST_TEMPLATE_VALIDATION_FAILED.*MISSING_ROLES/);
  });
});
