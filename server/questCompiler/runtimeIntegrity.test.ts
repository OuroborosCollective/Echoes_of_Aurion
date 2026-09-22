import { describe, expect, it } from "vitest";
import { fixedOperationalClock } from "../../shared/operationalClock";
import { computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";
import { WorldFactEngine } from "./worldFacts";
import { QuestTemplateRegistry } from "./templateRegistry";
import { QuestRuntimeEngine } from "./runtime";
import { AdminQuestStudioService } from "./adminService";

describe("AIM-298 runtime integrity hardening", () => {
  it("keeps logical quest state identity stable across wall-clock metadata", () => {
    const factEngine = new WorldFactEngine();
    factEngine.recordEvent({
      id: "evt_hash_clock",
      type: "CARAVAN_ATTACKED",
      source: "test",
      data: { caravanId: "c1", merchantId: "npc_merchant_kaelen", playerUserId: "1" },
    });

    const registry = new QuestTemplateRegistry();
    const first = new QuestRuntimeEngine(factEngine, registry, fixedOperationalClock(1_750_000_000_000));
    const second = new QuestRuntimeEngine(factEngine, registry, fixedOperationalClock(1_750_000_123_000));

    const a = first.compileAndOfferQuest({
      worldId: "world_clock",
      playerUserId: 7,
      triggerEventId: "evt_hash_clock",
    });
    const b = second.compileAndOfferQuest({
      worldId: "world_clock",
      playerUserId: 7,
      triggerEventId: "evt_hash_clock",
    });

    expect(a.instance.createdAt).not.toBe(b.instance.createdAt);
    expect(computeQuestStateHash(a.instance)).toBe(computeQuestStateHash(b.instance));
  });

  it("serializes concurrent identical quest accepts to one durable receipt", async () => {
    const service = new AdminQuestStudioService(fixedOperationalClock(1_750_000_000_000));
    const offered = await service.offerQuest({
      playerUserId: 7002,
      templateId: "tpl_caravan_investigation",
    });

    const [a, b] = await Promise.all([
      service.acceptQuest(7002, offered.instance.id),
      service.acceptQuest(7002, offered.instance.id),
    ]);

    expect(a.receipt.id).toBe(b.receipt.id);
    expect(new Set([a.receipt.id, b.receipt.id]).size).toBe(1);
    expect(a.updatedInstance.state).toBe("active");
    expect(b.updatedInstance.state).toBe("active");
  });

  it("does not append the same canonical world event twice", () => {
    const engine = new WorldFactEngine();
    const first = engine.recordEvent({
      id: "evt_idempotent_world",
      type: "CARAVAN_ATTACKED",
      source: "test",
      data: { caravanId: "c2", merchantId: "npc_kaelen", playerUserId: "9" },
    });
    const second = engine.recordEvent({
      id: "evt_idempotent_world",
      type: "CARAVAN_ATTACKED",
      source: "test",
      data: { caravanId: "c2", merchantId: "npc_kaelen", playerUserId: "9" },
    });

    expect(second.event.sequence).toBe(first.event.sequence);
    expect(second.newFacts).toEqual([]);
    expect(engine.getEvents()).toHaveLength(1);

    expect(() => engine.recordEvent({
      id: "evt_idempotent_world",
      type: "CARAVAN_ATTACKED",
      source: "tampered",
      data: { caravanId: "c2", merchantId: "npc_kaelen", playerUserId: "9" },
    })).toThrow("WORLD_EVENT_ID_CONFLICT:evt_idempotent_world");
  });

  it("replays an already committed accept receipt instead of attempting a second transition", async () => {
    const service = new AdminQuestStudioService(fixedOperationalClock(1_750_000_000_000));
    const offered = await service.offerQuest({
      playerUserId: 7001,
      templateId: "tpl_caravan_investigation",
    });

    const first = await service.acceptQuest(7001, offered.instance.id);
    const second = await service.acceptQuest(7001, offered.instance.id);

    expect(second.receipt.id).toBe(first.receipt.id);
    expect(second.receipt.idempotencyKey).toBe(first.receipt.idempotencyKey);
    expect(second.updatedInstance.state).toBe("active");
  });
});
