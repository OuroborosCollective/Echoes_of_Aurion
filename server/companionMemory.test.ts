import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompanionMemoryStore } from "./companionMemory";

const stores: CompanionMemoryStore[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CompanionMemoryStore", () => {
  it("persists local-first, keeps users separate, and is idempotent", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "aurion-companion-memory-"));
    dirs.push(dir);
    const store = new CompanionMemoryStore({ dataDir: dir });
    stores.push(store);
    const observation = { sessionId: "cmp_test_session", sequenceIndex: 0, timestampEpoch: Date.now(), sampleId: "sample_0001", featureVector: new Array(16).fill(0.25), targetAction: [0.5, 0.25, 1, 1] as [number, number, number, number], stateVector: [1, 1, 1, 0, 0, 1], stateMask: [1, 1, 1, 1, 1, 1], note: "test" };
    const first = await store.append(7, observation);
    const second = await store.append(7, observation);
    expect(first.local).toBe(true);
    expect(second.memoryHash).toBe(first.memoryHash);
    const file = await readFile(path.join(dir, "user-7", "cmp_test_session.jsonl"), "utf8");
    expect(file.trim().split("\n")).toHaveLength(1);
    await expect(readFile(path.join(dir, "user-8", "cmp_test_session.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
