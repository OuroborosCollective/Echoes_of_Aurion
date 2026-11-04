import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, open, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FabricLedger } from "./ledger";
import { FabricConfigSchema, routing, premiumLimit } from "./policy";
const dirs: string[] = [];
afterEach(async () => { for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true }); });
async function ledger(now = () => 1000) { const dir = await mkdtemp(join(tmpdir(), "aurion-ai-")); dirs.push(dir); return new FabricLedger(join(dir, "ledger.json"), now); }
function record(taskId: string, route: "premium" | "free" = "premium") { return { taskId, route, model: "unit-fixture:free", reservedMicros: route === "premium" ? 80 : 0, inputHash: "a".repeat(64), sourceRevision: "unit-test", promptVersion: "test" }; }
const settled = { actualMicros: 30, outputHash: "b".repeat(64), provider: "unit-test", tokens: 5, validation: "INVALID_DRAFT" };
describe("operational budget with real durable filesystem (not live provider evidence)", () => {
  it("never selects premium automatically, even with an approved budget", () => {
    const c = FabricConfigSchema.parse({ ledgerPath: "/tmp/test" });
    expect(routing("auto", c)).toEqual(["local", "free"]);
    expect(() => routing("premium", c)).toThrow("PREMIUM_NOT_APPROVED");
    expect(premiumLimit(c)).toBe(0);
    expect(routing("auto", { ...c, premiumEnabled: true, premiumApproval: "owner-pilot", premiumBudgetEurMicros: 2e6, approvedUsdPerEur: 1 })).not.toContain("premium");
  });
  it("serializes competing process handles and keeps pending reservations after restart", async () => {
    const a = await ledger(); const b = new FabricLedger(a.file, () => 1000);
    const calls = await Promise.allSettled([a.reserve(record("one"), 100, 50), b.reserve(record("two"), 100, 50)]);
    expect(calls.filter(c => c.status === "fulfilled")).toHaveLength(1);
    expect((await b.status(100)).remainingMicros).toBe(20);
    await expect(b.reserve(record("three"), 100, 50)).rejects.toThrow("COST_UNRESOLVED");
    const saved = JSON.parse(await readFile(a.file, "utf8"));
    expect(saved.records).toHaveLength(1);
  });
  it("settles a charged request after bounded lock contention without repeating inference", async () => {
    const l = await ledger(); await l.reserve(record("charged"), 100, 50);
    const lock = await open(l.file + ".lock", "wx");
    const settlement = l.finish("charged", settled);
    await delay(60); await lock.close(); await unlink(l.file + ".lock");
    expect((await settlement).status).toBe("complete");
    expect((await l.status(100)).spentMicros).toBe(30);
  });
  it("accounts for paid invalid responses and refuses exhausted budgets", async () => {
    const l = await ledger(); await l.reserve(record("one"), 100, 50); await l.finish("one", settled);
    expect((await l.status(100)).spentMicros).toBe(30);
    await expect(l.reserve(record("two"), 100, 50)).rejects.toThrow("BUDGET_EXHAUSTED");
  });
  it("unknown costs block further premium across independent instances", async () => {
    const l = await ledger(); await l.reserve(record("one"), 100, 50); await l.finish("one", { ...settled, actualMicros: null }, true);
    expect((await new FabricLedger(l.file).status(100)).blocked).toBe(true);
  });
  it("records unexpected free charges and blocks all further inference", async () => {
    const l = await ledger(); await l.reserve(record("unexpected", "free"), 100, 50);
    await l.finish("unexpected", { ...settled, actualModel: "provider-reported-model" });
    expect((await l.status(100)).spentMicros).toBe(30);
    await expect(l.reserve(record("next", "free"), 100, 50)).rejects.toThrow("COST_UNRESOLVED");
    expect(JSON.parse(await readFile(l.file, "utf8")).records[0].actualModel).toBe("provider-reported-model");
  });
  it("counts failed free requests and enforces the minute and day caps", async () => {
    let time = 1000; const l = await ledger(() => time);
    for (let i = 0; i < 20; i++) { await l.reserve(record(String(i), "free"), 0, 21); await l.finish(String(i), { ...settled, actualMicros: 0 }); }
    await expect(l.reserve(record("21", "free"), 0, 21)).rejects.toThrow("FREE_RATE_LIMIT");
    time += 60001;
    await l.reserve(record("21", "free"), 0, 21); await l.finish("21", { ...settled, actualMicros: null }, true);
    expect((await l.status(100)).blocked).toBe(true);
    await expect(l.reserve({ ...record("premium-after-unknown"), model: "another-model" }, 100, 50)).rejects.toThrow("COST_UNRESOLVED");
    time += 60001;
    await expect(l.reserve(record("22", "free"), 0, 21)).rejects.toThrow("FREE_RATE_LIMIT");
    time += 86400000;
    await l.reserve(record("next-day", "free"), 0, 21);
  });
});
