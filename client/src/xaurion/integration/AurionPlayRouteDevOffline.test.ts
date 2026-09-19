import { describe, expect, it } from "vitest";
import {
  AURION_PLAY_LAUNCH_KEY,
  DEV_OFFLINE_FIXTURE,
  consumeLaunch,
  persistConfirmedPlayLaunch,
} from "./AurionPlayRoute";

describe("Option 2: Offline Dev Session Injection Contract", () => {
  it("provides a valid deterministic offline launch fixture", () => {
    expect(DEV_OFFLINE_FIXTURE.displayName).toContain("Offline Dev Testbed");
    expect(DEV_OFFLINE_FIXTURE.globalWorld.worldSeed.length).toBeGreaterThanOrEqual(3);
    expect(DEV_OFFLINE_FIXTURE.globalWorld.epoch).toBeGreaterThanOrEqual(0);
    expect(DEV_OFFLINE_FIXTURE.globalWorld.deterministicHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(DEV_OFFLINE_FIXTURE.isOfflineTestbed).toBe(true);
  });

  it("successfully persists the offline fixture to sessionStorage via persistConfirmedPlayLaunch", () => {
    sessionStorage.clear();
    const persisted = persistConfirmedPlayLaunch(DEV_OFFLINE_FIXTURE);
    expect(persisted).toBe(true);

    const stored = sessionStorage.getItem(AURION_PLAY_LAUNCH_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.globalWorld.worldSeed).toBe(DEV_OFFLINE_FIXTURE.globalWorld.worldSeed);
    expect(parsed.globalWorld.epoch).toBe(DEV_OFFLINE_FIXTURE.globalWorld.epoch);
  });

  it("consumes launch from sessionStorage correctly", () => {
    sessionStorage.clear();
    persistConfirmedPlayLaunch(DEV_OFFLINE_FIXTURE);
    const consumed = consumeLaunch();
    expect(consumed).not.toBeNull();
    expect(consumed?.isOfflineTestbed).toBe(true);
    // After consumption, session storage is cleaned up
    expect(sessionStorage.getItem(AURION_PLAY_LAUNCH_KEY)).toBeNull();
  });

  it("rejects invalid non-conforming launch objects", () => {
    expect(persistConfirmedPlayLaunch(null)).toBe(false);
    expect(persistConfirmedPlayLaunch({})).toBe(false);
    expect(persistConfirmedPlayLaunch({ globalWorld: { worldSeed: "ab" } })).toBe(false); // seed < 3 chars
    expect(persistConfirmedPlayLaunch({ globalWorld: { worldSeed: "valid", epoch: -1 } })).toBe(false);
  });
});
