import { describe, it, expect, beforeEach } from "vitest";
import { AurionTemporalEventIndex } from "./aurionTemporalEventIndex";
import { HistoricalWorldStateService } from "./historicalWorldStateService";
import { createTemporalEvent } from "../../shared/aurionTemporalEventContract";

describe("HistoricalWorldStateService", () => {
  let index: AurionTemporalEventIndex;
  let service: HistoricalWorldStateService;

  beforeEach(() => {
    index = new AurionTemporalEventIndex();
    service = new HistoricalWorldStateService(index);
  });

  it("reconstructs state deterministically at a specific epoch (MATCH)", async () => {
    const ev1 = createTemporalEvent({
      eventId: "ev_mine_conquest_100",
      worldId: "world-alpha",
      epoch: 100,
      domain: "faction",
      subjectIds: ["mine:ember-mine"],
      validFromEpoch: 100,
      validToEpoch: null,
      sourceReceiptHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      sourceWorldRoot: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      predecessorEventIds: [],
      payload: { controllingFaction: "faction:iron-vanguard" },
    });

    await index.ingestEvent(ev1);

    const result = await service.reconstructStateAtEpoch({
      worldId: "world-alpha",
      epoch: 150,
      subjectId: "mine:ember-mine",
    });

    expect(result.status).toBe("MATCH");
    expect(result.facts.length).toBe(1);
    expect(result.facts[0].subjectId).toBe("mine:ember-mine");
    expect(result.facts[0].payload).toEqual({ controllingFaction: "faction:iron-vanguard" });
  });

  it("proves superseded fact remains historically queryable at past epoch", async () => {
    const ev1 = createTemporalEvent({
      eventId: "ev_mine_conquest_100",
      worldId: "world-alpha",
      epoch: 100,
      domain: "faction",
      subjectIds: ["mine:ember-mine"],
      validFromEpoch: 100,
      validToEpoch: null,
      sourceReceiptHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      sourceWorldRoot: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      predecessorEventIds: [],
      payload: { controllingFaction: "faction:iron-vanguard" },
    });
    await index.ingestEvent(ev1);

    // Later at epoch 200, faction changes
    const ev2 = createTemporalEvent({
      eventId: "ev_mine_conquest_200",
      worldId: "world-alpha",
      epoch: 200,
      domain: "faction",
      subjectIds: ["mine:ember-mine"],
      validFromEpoch: 200,
      validToEpoch: null,
      sourceReceiptHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      sourceWorldRoot: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      predecessorEventIds: [ev1.eventId],
      payload: { controllingFaction: "faction:solar-dawn" },
    });
    await index.ingestEvent(ev2);

    // Query past epoch 150: MUST report iron-vanguard
    const pastResult = await service.reconstructStateAtEpoch({
      worldId: "world-alpha",
      epoch: 150,
      subjectId: "mine:ember-mine",
    });
    expect(pastResult.status).toBe("MATCH");
    expect(pastResult.facts[0].payload).toEqual({ controllingFaction: "faction:iron-vanguard" });

    // Query current epoch 250: MUST report solar-dawn
    const currentResult = await service.reconstructStateAtEpoch({
      worldId: "world-alpha",
      epoch: 250,
      subjectId: "mine:ember-mine",
    });
    expect(currentResult.status).toBe("MATCH");
    expect(currentResult.facts[0].payload).toEqual({ controllingFaction: "faction:solar-dawn" });
  });

  it("returns UNPROVABLE with TEMPORAL_EVIDENCE_GAP if predecessor event is missing", async () => {
    const evWithMissingPred = createTemporalEvent({
      eventId: "ev_with_missing_pred_100",
      worldId: "world-alpha",
      epoch: 100,
      domain: "ownership",
      subjectIds: ["item:excalibur"],
      validFromEpoch: 100,
      validToEpoch: null,
      sourceReceiptHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      sourceWorldRoot: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      predecessorEventIds: ["ev_missing_genesis_9999"],
      payload: { owner: "player:arthur" },
    });

    await index.ingestEvent(evWithMissingPred);

    const result = await service.reconstructStateAtEpoch({
      worldId: "world-alpha",
      epoch: 105,
      subjectId: "item:excalibur",
    });

    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("TEMPORAL_EVIDENCE_GAP");
    expect(result.unprovableGaps).toContain("MISSING_PREDECESSOR:ev_missing_genesis_9999");
  });

  it("returns UNPROVABLE if queried before subject creation", async () => {
    const ev1 = createTemporalEvent({
      eventId: "ev_npc_creation_500",
      worldId: "world-alpha",
      epoch: 500,
      domain: "npc",
      subjectIds: ["npc:lyra"],
      validFromEpoch: 500,
      validToEpoch: null,
      sourceReceiptHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      sourceWorldRoot: "sha256:8888888888888888888888888888888888888888888888888888888888888888",
      predecessorEventIds: [],
      payload: { status: "ACTIVE" },
    });
    await index.ingestEvent(ev1);

    const result = await service.reconstructStateAtEpoch({
      worldId: "world-alpha",
      epoch: 200,
      subjectId: "npc:lyra",
    });

    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("QUERY_EPOCH_BEFORE_CREATION");
  });
});
