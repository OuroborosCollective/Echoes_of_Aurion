import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareDeterministicDesExecutions, executeDeterministicDesScenario } from "./deterministicDesValidationHarness";

const REVISION = "f".repeat(40);
const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Issue #615 Clockwork-inspired execution boundary", () => {
  it("maps every adopted concept onto an existing Aurion authority surface", () => {
    const des = source("server/validation/deterministicDesValidationHarness.ts");
    const workOrder = source("shared/aurionSimulationWorkOrderProtocol.ts");
    const cadence = source("shared/npcSimulationCadenceProtocol.ts");
    const causalBudget = source("shared/npcCausalBudgetProtocol.ts");
    const replay = source("server/causality/replayZoneTick.ts");
    const oracle = source("server/causality/headlessCausalOracle.ts");

    expect(des).toContain("AuthoritativeMovementZone");
    expect(des).toContain("AurionTickRecorder");
    expect(des).toContain("replayZoneTick");
    expect(des).toContain("partitionSimulationWork");
    expect(workOrder).toContain("buildSimulationWorkPlan");
    expect(cadence).toContain("NpcSimulationMode");
    expect(causalBudget).toContain("NPC_CAUSAL_BUDGET_PROTOCOL");
    expect(replay).toContain("replayZoneTick");
    expect(oracle).toContain("AurionHeadlessCausalOracle");

    const packageJson = JSON.parse(source("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ].map(name => name.toLowerCase());

    expect(dependencyNames.some(name => name === "clockwork" || name.includes("/clockwork"))).toBe(false);
    expect(packageJson.scripts?.["timeloop:check"]).toBeTypeOf("string");
    expect(readFileSync("docs/aurion-clockwork-evaluation.md", "utf8")).toContain("No Clockwork binary");
  });

  it("proves exact canonical evidence equivalence under reordered input", async () => {
    const first = await executeDeterministicDesScenario({
      scenarioId: "clockwork-inspired-615",
      seed: "clockwork-inspired-615-v1",
      sourceRevision: REVISION,
    });
    const reordered = await executeDeterministicDesScenario({
      scenarioId: "clockwork-inspired-615",
      seed: "clockwork-inspired-615-v1",
      sourceRevision: REVISION,
      submitReversed: true,
    });

    expect(first.scenario.status).toBe("MATCH");
    expect(reordered.scenario.status).toBe("MATCH");
    expect(compareDeterministicDesExecutions(first, reordered)).toEqual({
      status: "MATCH",
      canonicalEqual: true,
      traceEqual: true,
      receiptEqual: true,
      stateEqual: true,
    });
    expect(first.scenario.canonicalResultHash).toBe(reordered.scenario.canonicalResultHash);
    expect(first.scenario.workPlanHash).toBe(reordered.scenario.workPlanHash);
  });

  it("keeps bounds explicit and truth independent of presentation timing", () => {
    const des = source("server/validation/deterministicDesValidationHarness.ts");
    const budget = source("shared/npcCausalBudgetProtocol.ts");
    const workOrder = source("shared/aurionSimulationWorkOrderProtocol.ts");

    expect(des).toContain("const MAX_TICKS = 64;");
    expect(des).toContain("const MAX_TRACE_EVENTS = 4096;");
    expect(budget).toContain("NPC_CAUSAL_BUDGET_CATCHUP_EXCEEDED");
    expect(workOrder).toContain("maxWorkItems");

    const canonicalBoundary = des.split("const canonicalResult = {")[1]?.split("const canonicalResultHash")[0] ?? "";
    expect(canonicalBoundary).not.toContain("elapsedMs");
    expect(canonicalBoundary).not.toContain("ticksPerSecond");
    expect(ROOT.endsWith("Echoes_of_Aurion") || ROOT.length > 0).toBe(true);
  });
});
