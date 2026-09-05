import { describe, expect, it, vi } from "vitest";
import { rewardReceiptIdentity } from "./rewardReceiptIdentity";
describe("deterministic reward receipt identity", () => {
  it("replays independently of clocks and entropy and isolates owner/domain/source", () => {
    const a = vi.spyOn(Math,"random").mockImplementation(() => { throw new Error("unexpected entropy"); });
    const b = vi.spyOn(Date,"now").mockImplementation(() => { throw new Error("unexpected clock"); });
    try {
      const first = rewardReceiptIdentity("expres",1,"quest:confirmed:result");
      expect(rewardReceiptIdentity("expres",1,"quest:confirmed:result")).toBe(first);
      expect(new Set([first,rewardReceiptIdentity("expres",2,"quest:confirmed:result"),rewardReceiptIdentity("skillev",1,"quest:confirmed:result"),rewardReceiptIdentity("expres",1,"quest:another:result")]).size).toBe(4);
      expect(first.length).toBeLessThanOrEqual(64);
      expect(() => rewardReceiptIdentity("expres",NaN,"source")).toThrow("INVALID");
      expect(() => rewardReceiptIdentity("expres",1,"")).toThrow("INVALID");
    } finally { a.mockRestore(); b.mockRestore(); }
  });
});
