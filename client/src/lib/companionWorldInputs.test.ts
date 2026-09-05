import { describe, expect, it } from "vitest";
import { queueHumanDemonstration } from "./companionWorldInputs";
describe("human input sampling", () => {
  it("preserves an in-flight identity only for the same continuing movement", () => {
    const first = queueHumanDemonstration(undefined, [.5,0,1,1], 1000, 1, "movement");
    const held = queueHumanDemonstration(first, [.5,0,1,1], 1200, 2, "movement");
    expect(held.id).toBe(1); expect(first.issuedAt).toBe(1000); expect(held.issuedAt).toBe(1200);
    expect(queueHumanDemonstration(held,[0,.5,1,1],1300,2,"movement").id).toBe(2);
    expect(queueHumanDemonstration(held,[.5,0,1,1],1300,2,"action").id).toBe(2);
    expect(() => queueHumanDemonstration(held,[NaN,0,1,1],1300,2,"movement")).toThrow("INVALID");
  });
});
