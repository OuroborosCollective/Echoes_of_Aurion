import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendLedger, exportLedger, readLedger } from "./ledger";
import { recordCompanionObservation, startCompanionSession, transitionCompanionSession } from "./companionLearning";
import { COMPANION_FRAME_REQUEST_EVENT, COMPANION_FRAME_RESPONSE_EVENT, requestCompanionFrame } from "./companionFrameCapture";

describe("explicit identity and observation inputs", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());
  it("replays the same retained ledger and export without random or clock reads", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("implicit random"); });
    const run = () => { for (let i = 0; i < 35; i++) appendLedger({ kind: "command", title: `Action ${i}`, detail: "confirmed input" }); return exportLedger(); };
    const first = run(); expect(readLedger()).toHaveLength(28); expect(readLedger()[0].id).toBe("ledger:8"); expect(readLedger()[27].id).toBe("ledger:35");
    localStorage.clear(); clock.mockReturnValue(9000000000000); expect(run()).toBe(first);
    expect(JSON.parse(first)).toMatchObject({ version: 2, timeBasis: "event_sequence" });
  });
  it("binds companion identity to the confirmed gateway and requires an observed timestamp", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("implicit random"); });
    const input = { frameDataUrl: "data:image/png;base64,AAAA", featureVector: new Array(16).fill(.5), action: [.1, .2, .8, 1] as [number, number, number, number] };
    const run = () => { startCompanionSession(11, "LLM", "gateway_confirmed_11"); transitionCompanionSession("connect"); transitionCompanionSession("learn"); expect(recordCompanionObservation(input)).toBeNull(); return recordCompanionObservation({ ...input, capturedAt: 123456 }); };
    const row = run(); expect(row?.session_id).toBe("cmp_gateway_confirmed_11");
    expect(startCompanionSession(11, "LLM", "gateway_confirmed_11").datasetRows).toBe(1);
    localStorage.clear(); clock.mockReturnValue(9000000000000); expect(run()).toEqual(row);
    expect(() => startCompanionSession(11, "LLM", "")).toThrow("CONFIRMED_GATEWAY_SESSION_REQUIRED");
  });
  it("correlates concurrent frame requests with unique ordered request numbers", async () => {
    const ids: string[] = [];
    const listener = (event: Event) => { const { requestId } = (event as CustomEvent).detail; ids.push(requestId); window.dispatchEvent(new CustomEvent(COMPANION_FRAME_RESPONSE_EVENT, { detail: { requestId, error: "unavailable" } })); };
    window.addEventListener(COMPANION_FRAME_REQUEST_EVENT, listener);
    try { expect(await Promise.all([requestCompanionFrame(), requestCompanionFrame()])).toEqual([null, null]); expect(ids[0]).not.toBe(ids[1]); expect(Number(ids[1].split("-").at(-1))).toBe(Number(ids[0].split("-").at(-1)) + 1); }
    finally { window.removeEventListener(COMPANION_FRAME_REQUEST_EVENT, listener); }
  });
});
