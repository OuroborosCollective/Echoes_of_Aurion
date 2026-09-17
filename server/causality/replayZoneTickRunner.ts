import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import type { AurionZoneIntent } from "../../shared/aurionZoneIntentContract";
import type { CanonicalZoneState } from "./zoneCanonicalState";
import { replayZoneTick } from "./replayZoneTick";
import type { ReplayVerdict } from "../../shared/aurionReplayContract";

export async function executeZoneReplaySimulation(
  zoneId: string,
  startTick: number,
  endTick: number,
  fetchReceipts: (zoneId: string, from: number, to: number) => Promise<AurionCausalTickReceipt[]>,
  fetchIntents: (zoneId: string, tick: number) => Promise<AurionZoneIntent[]>,
  fetchPreState: (zoneId: string, tick: number) => Promise<CanonicalZoneState>
): Promise<{ tick: number; verdict: ReplayVerdict }[]> {
  const receipts = await fetchReceipts(zoneId, startTick, endTick);
  const results: { tick: number; verdict: ReplayVerdict }[] = [];

  for (const receipt of receipts) {
    const preState = await fetchPreState(zoneId, receipt.tick);
    const intents = await fetchIntents(zoneId, receipt.tick);

    const verdict = replayZoneTick({
      preState,
      intents,
      expectedReceipt: receipt,
    });
    results.push({ tick: receipt.tick, verdict });

    if (verdict.verdict !== "MATCH") {
      // Stop on first divergence found in historical chain
      break;
    }
  }

  return results;
}
