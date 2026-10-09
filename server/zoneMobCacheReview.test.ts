import { expect, it } from "vitest";
import { ZoneMobRuntime, resolveMobCollisionMovement } from "./zoneMobRuntime";
import { resolveMobFsmTick } from "./wasdMobFsmProtocol";

it("keeps cached mob iteration synchronized after combat, freeze and fixture reset", () => {
  const runtime = new ZoneMobRuntime();
  const ids = runtime.orderedStates().map(state => state.definition.entityId);
  const oldSnapshot = runtime.snapshot();
  const oldBytes = JSON.stringify(oldSnapshot);
  for (let tick = 1; tick <= 30; tick++) {
    if (tick === 5) runtime.applyCombatState(ids[0], { health: 0 });
    if (tick === 15) runtime.resetDevelopmentFixture(tick);
    const frozen = new Set(tick % 2 ? [ids[1]] : []);
    const expected = ids.map(id => {
      const current = runtime.stateFor(id)!;
      return frozen.has(id) ? current : resolveMobFsmTick({ current, presences: [], tick, resolveMovement: resolveMobCollisionMovement });
    });
    runtime.tick([], tick, frozen);
    expect(runtime.orderedStates()).toEqual(expected);
    expect(ids.map(id => runtime.stateFor(id))).toEqual(expected);
  }
  expect(JSON.stringify(oldSnapshot)).toBe(oldBytes);
});
