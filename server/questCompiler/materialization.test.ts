import { describe, expect, it } from "vitest";
import { computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";
import { WorldFactEngine } from "./worldFacts";
import { QuestTemplateRegistry } from "./templateRegistry";
import { QuestRuntimeEngine } from "./runtime";
import { materializeQuestDomainCommand } from "./materialization";

describe("Quest domain command materialization (AIM-298 #459)", () => {
  function fixture() {
    const facts = new WorldFactEngine();
    facts.recordEvent({
      id: "evt_materialization",
      type: "CARAVAN_ATTACKED",
      source: "test",
      data: { caravanId: "c_materialization", merchantId: "npc_merchant_kaelen", playerUserId: "42" },
    });
    const runtime = new QuestRuntimeEngine(facts, new QuestTemplateRegistry());
    const { instance, plan } = runtime.compileAndOfferQuest({
      worldId: "world_materialization",
      playerUserId: 42,
      triggerEventId: "evt_materialization",
    });
    return { instance, plan };
  }

  it("derives the same command identity from the same canonical inputs", () => {
    const { instance, plan } = fixture();
    const expectedStateHash = computeQuestStateHash(instance);
    const input = {
      kind: "accept" as const,
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash,
      idempotencyKey: "accept:" + instance.id,
      eventSequence: 1,
    };
    const a = materializeQuestDomainCommand(instance, plan, input);
    const b = materializeQuestDomainCommand(instance, plan, { ...input });
    expect(a).toEqual(b);
    expect(a.commandId).toMatch(/^[a-f0-9]{64}$/);
    expect(a.schemaVersion).toBe("aurion.quest-domain-command.v1");
  });

  it("changes identity when a command-semantic input changes", () => {
    const { instance, plan } = fixture();
    const expectedStateHash = computeQuestStateHash(instance);
    const base = {
      kind: "progress" as const,
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash,
      idempotencyKey: "progress-key-001",
      eventSequence: 2,
      objectiveKey: "investigate",
      amount: 1,
    };
    const a = materializeQuestDomainCommand(instance, plan, base);
    const b = materializeQuestDomainCommand(instance, plan, { ...base, amount: 2 });
    expect(a.commandId).not.toBe(b.commandId);
  });

  it("rejects a command bound to another instance or plan", () => {
    const { instance, plan } = fixture();
    const expectedStateHash = computeQuestStateHash(instance);
    expect(() => materializeQuestDomainCommand(instance, plan, {
      kind: "accept",
      instanceId: "qi_other",
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash,
      idempotencyKey: "accept:qi_other",
      eventSequence: 1,
    })).toThrow("QUEST_MATERIALIZATION_INSTANCE_MISMATCH");

    expect(() => materializeQuestDomainCommand(instance, plan, {
      kind: "accept",
      instanceId: instance.id,
      planHash: "0".repeat(64),
      graphHash: instance.graphHash,
      expectedStateHash,
      idempotencyKey: "accept:" + instance.id,
      eventSequence: 1,
    })).toThrow("QUEST_MATERIALIZATION_PLAN_MISMATCH");
  });

  it("rejects stale logical state instead of materializing against old truth", () => {
    const { instance, plan } = fixture();
    expect(() => materializeQuestDomainCommand(instance, plan, {
      kind: "complete",
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash: "f".repeat(64),
      idempotencyKey: "complete:" + instance.id,
      eventSequence: 1,
    })).toThrow("QUEST_MATERIALIZATION_STALE_STATE");
  });

  it("supports every canonical transition kind without adding a second command model", () => {
    const { instance, plan } = fixture();
    const expectedStateHash = computeQuestStateHash(instance);
    const common = {
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash,
    };

    const accept = materializeQuestDomainCommand(instance, plan, {
      ...common, kind: "accept", idempotencyKey: "accept:" + instance.id, eventSequence: 1,
    });
    const progress = materializeQuestDomainCommand(instance, plan, {
      ...common, kind: "progress", idempotencyKey: "progress-key-002", eventSequence: 2,
      objectiveKey: "investigate", amount: 1,
    });
    const choice = materializeQuestDomainCommand(instance, plan, {
      ...common, kind: "choice", idempotencyKey: "choice-key-003", eventSequence: 2,
      edgeId: "edge_choice",
    });
    const complete = materializeQuestDomainCommand(instance, plan, {
      ...common, kind: "complete", idempotencyKey: "complete:" + instance.id, eventSequence: 3,
    });

    expect(accept.kind).toBe("accept");
    expect(progress.kind).toBe("progress");
    expect(choice.kind).toBe("choice");
    expect(complete.kind).toBe("complete");
    expect(new Set([accept.commandId, progress.commandId, choice.commandId, complete.commandId]).size).toBe(4);
  });

  it("fails closed when the command identity itself is tampered", () => {
    const { instance, plan } = fixture();
    const command = materializeQuestDomainCommand(instance, plan, {
      kind: "accept",
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash: computeQuestStateHash(instance),
      idempotencyKey: "accept:" + instance.id,
      eventSequence: 1,
    });
    const tampered = { ...command, commandId: "0".repeat(64) };
    const runtime = new QuestRuntimeEngine(new WorldFactEngine(), new QuestTemplateRegistry());
    expect(() => runtime.executeDomainCommand(tampered, instance, plan)).toThrow("QUEST_DOMAIN_COMMAND_IDENTITY_MISMATCH");
  });
});