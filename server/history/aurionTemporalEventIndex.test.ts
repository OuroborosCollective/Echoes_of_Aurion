import { describe, it, expect, beforeEach } from "vitest";
import {
  createTemporalEvent,
  verifyTemporalEventIntegrity,
  type AurionTemporalEvent,
} from "../../shared/aurionTemporalEventContract";
import { AurionTemporalEventIndex } from "./aurionTemporalEventIndex";
import { HistoricalWorldStateService } from "./historicalWorldStateService";
import { CausalHistoryExplainService } from "./causalHistoryExplainService";

describe("Aurion Temporal Event Index & Historical Reconstruction (Steps 32-34)", () => {
  let index: AurionTemporalEventIndex;
  let historyService: HistoricalWorldStateService;
  let explainService: CausalHistoryExplainService;

  const WORLD_ID = "echoes-of-aurion-global";
  const ROOT_EPOCH_100 = "sha256:root_epoch_100_deterministic_hash_aaaaaaaa";
  const ROOT_EPOCH_200 = "sha256:root_epoch_200_deterministic_hash_bbbbbbbb";
  const ROOT_EPOCH_300 = "sha256:root_epoch_300_deterministic_hash_cccccccc";

  beforeEach(() => {
    index = new AurionTemporalEventIndex();
    historyService = new HistoricalWorldStateService(index);
    explainService = new CausalHistoryExplainService(index);
  });

  it("Step 32: Ingests valid temporal events into append-only index deterministically", async () => {
    const event1 = createTemporalEvent({
      eventId: "ev_mine_claim_100",
      worldId: WORLD_ID,
      epoch: 100,
      domain: "faction",
      subjectIds: ["faction:valkyr", "poi:ember_mine"],
      validFromEpoch: 100,
      validToEpoch: null,
      sourceReceiptHash: "sha256:receipt_warfront_claim_100",
      sourceWorldRoot: ROOT_EPOCH_100,
      predecessorEventIds: [],
      payload: { factionId: "valkyr", controlState: "CLAIMED", resourceYieldPerTick: 50 },
    });

    const result = await index.ingestEvent(event1);
    expect(result.accepted).toBe(true);
    expect(result.eventHash).toBe(event1.eventHash);

    // Verify retrieval
    const retrieved = await index.getEventById("ev_mine_claim_100");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.eventHash).toBe(event1.eventHash);
    expect(retrieved?.payload.factionId).toBe("valkyr");

    // Idempotency: re-ingesting exact same event succeeds without mutation
    const reIngest = await index.ingestEvent(event1);
    expect(reIngest.accepted).toBe(true);
  });

  it("Step 32: Rejects corrupted or tampering events deterministically", async () => {
    const validEvent = createTemporalEvent({
      eventId: "ev_valid_1",
      worldId: WORLD_ID,
      epoch: 50,
      domain: "quest",
      subjectIds: ["quest:ember_trial"],
      validFromEpoch: 50,
      sourceReceiptHash: "sha256:receipt_50",
      sourceWorldRoot: ROOT_EPOCH_100,
      payload: { status: "ACTIVE" },
    });

    // Tampered payload
    const tamperedEvent: AurionTemporalEvent = {
      ...validEvent,
      payload: { status: "COMPLETED_FAKE" },
    };

    const result = await index.ingestEvent(tamperedEvent);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("PAYLOAD_HASH_MISMATCH");
  });

  it("Step 33: Reconstructs historical state across time epochs accurately", async () => {
    // Epoch 100: Valkyr claims mine
    const ev1 = createTemporalEvent({
      eventId: "ev_mine_100",
      worldId: WORLD_ID,
      epoch: 100,
      domain: "faction",
      subjectIds: ["poi:ember_mine"],
      validFromEpoch: 100,
      validToEpoch: 200, // Valid from 100 to 200
      sourceReceiptHash: "sha256:receipt_100",
      sourceWorldRoot: ROOT_EPOCH_100,
      predecessorEventIds: [],
      payload: { controller: "valkyr", status: "SECURE" },
    });

    // Epoch 200: Silver Hand captures mine (supersedes ev1)
    const ev2 = createTemporalEvent({
      eventId: "ev_mine_200",
      worldId: WORLD_ID,
      epoch: 200,
      domain: "faction",
      subjectIds: ["poi:ember_mine"],
      validFromEpoch: 200,
      validToEpoch: null, // Still active
      sourceReceiptHash: "sha256:receipt_200",
      sourceWorldRoot: ROOT_EPOCH_200,
      predecessorEventIds: ["ev_mine_100"],
      payload: { controller: "silver_hand", status: "CONTESTED_WON" },
    });

    await index.ingestBatch([ev1, ev2]);

    // Query at Epoch 150: Should be Valkyr
    const res150 = await historyService.reconstructStateAtEpoch({
      worldId: WORLD_ID,
      epoch: 150,
      subjectId: "poi:ember_mine",
    });
    expect(res150.status).toBe("MATCH");
    expect(res150.facts.length).toBe(1);
    expect(res150.facts[0].state.controller).toBe("valkyr");

    // Query at Epoch 250: Should be Silver Hand
    const res250 = await historyService.reconstructStateAtEpoch({
      worldId: WORLD_ID,
      epoch: 250,
      subjectId: "poi:ember_mine",
    });
    expect(res250.status).toBe("MATCH");
    expect(res250.facts.length).toBe(1);
    expect(res250.facts[0].state.controller).toBe("silver_hand");

    // Query at Epoch 50 (before creation): Should return UNPROVABLE
    const res50 = await historyService.reconstructStateAtEpoch({
      worldId: WORLD_ID,
      epoch: 50,
      subjectId: "poi:ember_mine",
    });
    expect(res50.status).toBe("UNPROVABLE");
    expect(res50.reason).toBe("QUERY_EPOCH_BEFORE_CREATION");
  });

  it("Step 33 Negative Tests: Missing predecessor produces UNPROVABLE (TEMPORAL_EVIDENCE_GAP)", async () => {
    // Event pointing to non-existent predecessor
    const evGap = createTemporalEvent({
      eventId: "ev_with_gap",
      worldId: WORLD_ID,
      epoch: 300,
      domain: "ownership",
      subjectIds: ["item:excalibur"],
      validFromEpoch: 300,
      sourceReceiptHash: "sha256:receipt_300",
      sourceWorldRoot: ROOT_EPOCH_300,
      predecessorEventIds: ["ev_non_existent_predecessor"],
      payload: { owner: "player_arthur" },
    });

    await index.ingestEvent(evGap);

    const res = await historyService.reconstructStateAtEpoch({
      worldId: WORLD_ID,
      epoch: 300,
      subjectId: "item:excalibur",
    });
    expect(res.status).toBe("UNPROVABLE");
    expect(res.reason).toBe("TEMPORAL_EVIDENCE_GAP");
    expect(res.unprovableGaps).toContain("MISSING_PREDECESSOR:ev_non_existent_predecessor");
  });

  it("Step 34: Causal Explain backwards to authority root and receipts", async () => {
    const evRoot = createTemporalEvent({
      eventId: "ev_quest_init",
      worldId: WORLD_ID,
      epoch: 10,
      domain: "quest",
      subjectIds: ["quest:ember_init"],
      validFromEpoch: 10,
      sourceReceiptHash: "sha256:receipt_quest_init_10",
      sourceWorldRoot: ROOT_EPOCH_100,
      predecessorEventIds: [],
      payload: { stage: "OFFERED" },
    });

    const evStep1 = createTemporalEvent({
      eventId: "ev_combat_clear",
      worldId: WORLD_ID,
      epoch: 50,
      domain: "zone",
      subjectIds: ["poi:ember_mine"],
      validFromEpoch: 50,
      sourceReceiptHash: "sha256:receipt_combat_50",
      sourceWorldRoot: ROOT_EPOCH_100,
      predecessorEventIds: ["ev_quest_init"],
      payload: { guardsDefeated: true },
    });

    const evFinal = createTemporalEvent({
      eventId: "ev_faction_capture",
      worldId: WORLD_ID,
      epoch: 100,
      domain: "faction",
      subjectIds: ["poi:ember_mine"],
      validFromEpoch: 100,
      sourceReceiptHash: "sha256:receipt_capture_100",
      sourceWorldRoot: ROOT_EPOCH_100,
      predecessorEventIds: ["ev_combat_clear"],
      payload: { faction: "valkyr", captured: true },
    });

    await index.ingestBatch([evRoot, evStep1, evFinal]);

    const explanation = await explainService.explainFactAtEpoch({
      worldId: WORLD_ID,
      targetFactOrEventId: "ev_faction_capture",
      epoch: 100,
    });

    expect(explanation.status).toBe("MATCH");
    expect(explanation.rootEvidenceReached).toBe(true);
    expect(explanation.chain.length).toBe(3);
    expect(explanation.chain[0].eventId).toBe("ev_faction_capture");
    expect(explanation.chain[1].eventId).toBe("ev_combat_clear");
    expect(explanation.chain[2].eventId).toBe("ev_quest_init");
  });
});
