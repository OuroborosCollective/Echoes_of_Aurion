import { describe, expect, it } from "vitest";
import { AdminQuestStudioService } from "./adminService";

describe("authored quest turn-in guards", () => {
  it("rejects early turn-in and a different guard before any receipt or reward exists", async () => {
    const service = new AdminQuestStudioService({ now: () => Date.parse("2026-01-01T00:00:00.000Z") });
    const [instance] = await service.listInstances({ playerUserId: 1 });
    expect(instance).toBeDefined();
    await expect(service.completeQuest(1, instance!.id, undefined, instance!.giverNpcId))
      .rejects.toThrow("QUEST_END_NODE_REQUIRED");
    await expect(service.completeQuest(1, instance!.id, undefined, "npc_wrong_guard"))
      .rejects.toThrow("QUEST_TURN_IN_GIVER_MISMATCH");
    expect(await service.listInstances({ playerUserId: 1 })).toEqual([instance]);
  });
});
