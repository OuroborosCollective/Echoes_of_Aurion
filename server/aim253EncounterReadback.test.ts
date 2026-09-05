import { encounterActionIdentity, encounterSessionIdentity } from "./encounterIdentity";
import { describe, expect, it } from "vitest";
import { parseOwnedEncounterReadback } from "../shared/encounterReadback";
const value = () => ({ active: { id: "game_test", userId: 7, encounterKey: "asterion", status: "active", bossHp: 100, maxBossHp: 112, nextSequence: 2 }, encounters: ["asterion", "archive", "solarium", "cinder_vault"].map(key => ({ key, name: key, enemyName: key, available: key === "asterion" })) });
describe("owned encounter recovery boundary", () => {
  it("projects only a valid owned server state", () => { expect(parseOwnedEncounterReadback(value(), 7).active?.nextSequence).toBe(2); expect(() => parseOwnedEncounterReadback(value(), 8)).toThrow(); });
  it.each([0, -1, NaN, Infinity, 1.5, 2_147_483_648])("rejects invalid sequence %s", nextSequence => { const data = value(); data.active.nextSequence = nextSequence; expect(() => parseOwnedEncounterReadback(data, 7)).toThrow(); });
  it("rejects fabricated HP, duplicate choices and incomplete responses", () => {
    const data = value(); data.active.bossHp = 113; expect(() => parseOwnedEncounterReadback(data, 7)).toThrow();
    const duplicate = value(); duplicate.encounters[1] = duplicate.encounters[0]; expect(() => parseOwnedEncounterReadback(duplicate, 7)).toThrow();
    expect(() => parseOwnedEncounterReadback({}, 7)).toThrow();
  });
});

it("derives session and receipt identities from durable order only", () => {
  const first = encounterSessionIdentity(7, 1, "asterion");
  expect(first).toBe(encounterSessionIdentity(7, 1, "asterion"));
  expect(first).not.toBe(encounterSessionIdentity(7, 2, "asterion"));
  expect(first).not.toBe(encounterSessionIdentity(8, 1, "asterion"));
  expect(encounterActionIdentity(first, 1)).toBe(encounterActionIdentity(first, 1));
  expect(encounterActionIdentity(first, 1)).not.toBe(encounterActionIdentity(first, 2));
  expect(() => encounterSessionIdentity(7, Number.NaN, "asterion")).toThrow();
});
