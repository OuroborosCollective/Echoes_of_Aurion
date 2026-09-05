import { describe, expect, it } from "vitest";
import { renderBudget } from "./renderBudget";
describe("bounded visual GPU workload", () => {
  it("caps actual framebuffer pixels at every viewport and uses a genuine software GPU fallback", () => {
    for (const [width,height] of [[412,915],[800,1280],[1440,900],[3840,2160]]) {
      for (const renderer of ["ANGLE SwiftShader Device", "Mesa llvmpipe", "Hardware GPU"]) {
        const budget = renderBudget(width,height,3,renderer);
        expect(Math.floor(width*budget.pixelRatio)*Math.floor(height*budget.pixelRatio)).toBeLessThanOrEqual(budget.maximumPixels);
        expect(budget.pixelRatio).toBeGreaterThan(0);
        expect(budget.software).toBe(renderer !== "Hardware GPU");
      }
    }
  });
  it("is repeatable and rejects malformed projection dimensions", () => {
    expect(renderBudget(800,1280,2,"Hardware GPU")).toEqual(renderBudget(800,1280,2,"Hardware GPU"));
    for(const invalid of [NaN,Infinity,0,-1]) expect(()=>renderBudget(invalid,1280,2,"GPU")).toThrow();
  });
});
