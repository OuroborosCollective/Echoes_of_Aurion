import { describe, it, expect, beforeEach } from "vitest";
import { AurionTemporalEventIndex } from "./aurionTemporalEventIndex";
import { CausalHistoryExplainService } from "./causalHistoryExplainService";
import { createTemporalEvent } from "../../shared/aurionTemporalEventContract";

describe("CausalHistoryExplainService", () => {
  let index: AurionTemporalEventIndex;
  let service: CausalHistoryExplainService;

  beforeEach(() => {
    index = new AurionTemporalEventIndex();
    service = new CausalHistoryExplainService(index);
  });

  it("explains why a fact was true backward along causal receipt chain", async () => {
    const genesisRoot = "sha256:0000000000000000000000000000000000000000000000000000000000000001";
    const receipt1 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

    const ev1 = createTemporalEvent({
      eventId: "ev_mine_1000",
      worldId: "world-global",
      epoch: 1000,
      domain: "faction",
      subjectIds: ["mine:ember-mine"],
      validFromEpoch: 1000,
      validToEpoch: null,
      sourceReceiptHash: receipt1,
      sourceWorldRoot: genesisRoot,
      predecessorEventIds: [],
      payload: { controllingFaction: "faction:iron-vanguard", cause: "SIEGE_CONQUEST" },
    });
    await index.ingestEvent(ev1);

    const receipt2 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    const worldRoot2 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
    const ev2 = createTemporalEvent({
      eventId: "ev_mine_1050",
      worldId: "world-global",
      epoch: 1050,
      domain: "faction",
      subjectIds: ["mine:ember-mine"],
      validFromEpoch: 1050,
      validToEpoch: null,
      sourceReceiptHash: receipt2,
      sourceWorldRoot: worldRoot2,
      predecessorEventIds: [ev1.eventId],
      payload: { controllingFaction: "faction:iron-vanguard", taxRateBps: 500 },
    });
    await index.ingestEvent(ev2);

    const explanation = await service.explainFactAtEpoch({
      worldId: "world-global",
      targetFactOrEventId: "mine:ember-mine",
      epoch: 1060,
    });

    expect(explanation.status).toBe("MATCH");
    expect(explanation.chain.length).toBe(2);
    expect(explanation.rootEvidenceReached).toBe(true);
    expect(explanation.chain[0].eventId).toBe(ev2.eventId);
    expect(explanation.chain[0].receiptHash).toBe(receipt2);
    expect(explanation.chain[1].eventId).toBe(ev1.eventId);
    expect(explanation.chain[1].receiptHash).toBe(receipt1);
  });

  it("returns UNPROVABLE when target fact does not exist in history", async () => {
    const explanation = await service.explainFactAtEpoch({
      worldId: "world-global",
      targetFactOrEventId: "nonexistent:subject",
      epoch: 500,
    });

    expect(explanation.status).toBe("UNPROVABLE");
    expect(explanation.reason).toBe("TARGET_FACT_NOT_FOUND_IN_HISTORY");
  });
});
