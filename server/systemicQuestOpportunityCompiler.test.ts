import { describe, expect, it } from "vitest";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import {
  buildWorldPressureField,
  deriveWorldDirectorCandidates,
  decideWorldDirectors,
} from "../shared/worldPressureProtocol";
import { DEFAULT_SEED_TEMPLATES, QuestTemplateRegistry } from "./questCompiler/templateRegistry";
import { QuestRuntimeEngine } from "./questCompiler/runtime";
import { WorldFactEngine } from "./questCompiler/worldFacts";
import { compileSystemicQuestIntoExistingRuntime, compileSystemicQuestOpportunities } from "./systemicQuestOpportunityCompiler";

const SOURCE_REVISION = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function directorFixture() {
  const worldPlan = buildGlobalWorldPlan({
    worldSeed: "aurion-systemic-quest-e2e",
    epoch: 7,
    activePlayerCount: 120,
    highWaterPlayerCount: 120,
  });
  const field = buildWorldPressureField({
    worldPlan,
    worldRevision: SOURCE_REVISION,
    logicalTick: 700,
    sourceRootHash: "sha256:" + "b".repeat(64),
  });
  const candidates = deriveWorldDirectorCandidates(field, worldPlan);
  if (candidates.length === 0) throw new Error("SYSTEMIC_QUEST_DIRECTOR_CANDIDATE_REQUIRED");
  const decision = decideWorldDirectors({
    field,
    candidates,
    causalReceiptHash: "sha256:" + "c".repeat(64),
    seedDigest: "sha256:" + "d".repeat(64),
    previousReceiptHash: null,
    maxIntents: 8,
  });
  if (decision.intents.length === 0) throw new Error("SYSTEMIC_QUEST_DIRECTOR_INTENT_REQUIRED");
  return { decision, worldPlan };
}

function actorFixture(decision: ReturnType<typeof directorFixture>["decision"]) {
  const regions = [...new Set(decision.intents.flatMap(intent => [intent.sourceRegionId, ...(intent.targetRegionId ? [intent.targetRegionId] : [])]))].sort();
  return regions.map((regionId, index) => ({ actorId: `npc_systemic_${index + 1}`, regionId }));
}

describe("Aurion systemic quest opportunity compiler", () => {
  it("derives a stable bounded opportunity set from confirmed director consequences", () => {
    const { decision } = directorFixture();
    const actors = actorFixture(decision);
    const first = compileSystemicQuestOpportunities({
      worldId: decision.worldId,
      sourceRevision: SOURCE_REVISION,
      decision,
      confirmedActors: actors,
      maxCandidates: 8,
    });
    const second = compileSystemicQuestOpportunities({
      worldId: decision.worldId,
      sourceRevision: SOURCE_REVISION,
      decision,
      confirmedActors: [...actors].reverse(),
      maxCandidates: 8,
    });
    expect(second).toEqual(first);
    expect(first.opportunities.length).toBeGreaterThan(0);
    expect(first.opportunities.length).toBeLessThanOrEqual(8);
    expect(first.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.opportunities.every(item =>
      item.sourceReceiptIds.length === 1 &&
      item.sourceReceiptIds[0] === decision.causalReceiptHash &&
      item.expirationTick >= item.originTick &&
      /^sha256:[a-f0-9]{64}$/.test(item.opportunityHash)
    )).toBe(true);
  });

  it("fails closed when the causal decision belongs to another world or revision", () => {
    const { decision } = directorFixture();
    const actors = actorFixture(decision);
    expect(() => compileSystemicQuestOpportunities({
      worldId: decision.worldId,
      sourceRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      decision,
      confirmedActors: actors,
    })).toThrow("SYSTEMIC_QUEST_WORLD_SCOPE_MISMATCH");
  });

  it("feeds a derived opportunity through the existing QuestRuntimeEngine", () => {
    const { decision } = directorFixture();
    const actors = actorFixture(decision);
    const compilation = compileSystemicQuestOpportunities({
      worldId: decision.worldId,
      sourceRevision: SOURCE_REVISION,
      decision,
      confirmedActors: actors,
      maxCandidates: 8,
    });
    const opportunity = compilation.opportunities[0]!;
    const base = DEFAULT_SEED_TEMPLATES[0]!;
    const template = Object.freeze({
      ...base,
      templateId: opportunity.questTemplateId,
      prerequisiteFacts: [],
      title: `Systemic ${opportunity.type}`,
    });
    const registry = new QuestTemplateRegistry([template]);
    const facts = new WorldFactEngine();
    const runtime = new QuestRuntimeEngine(undefined, undefined as never);

    const firstEngine = new QuestRuntimeEngine(facts, registry);
    const first = compileSystemicQuestIntoExistingRuntime({
      opportunity,
      worldFacts: facts,
      questRuntime: firstEngine,
      worldId: decision.worldId,
      playerUserId: 7,
    });

    const readback = new WorldFactEngine();
    const secondEngine = new QuestRuntimeEngine(readback, new QuestTemplateRegistry([template]));
    const second = compileSystemicQuestIntoExistingRuntime({
      opportunity,
      worldFacts: readback,
      questRuntime: secondEngine,
      worldId: decision.worldId,
      playerUserId: 7,
    });

    expect(first.event.payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.instance.triggerEventId).toBe(first.event.id);
    expect(first.instance.planHash).toBe(second.instance.planHash);
    expect(first.instance.id).toBe(second.instance.id);
    expect(first.plan.graphHash).toBe(second.plan.graphHash);
    expect(first.event.id).toBe(second.event.id);
  });
});
