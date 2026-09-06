import { validWorldPosition } from "../shared/zonePresenceContract";
import type { WasdMobPosition } from "./wasdMobFsmProtocol";

export const WASD_MOB_COLLISION_SUBSTEP_MAX_MM = 340;
export type WasdMobCollisionResolver = (from: WasdMobPosition, desired: WasdMobPosition) => WasdMobPosition;

export function mobCollisionSubsteps(from: WasdMobPosition, desired: WasdMobPosition): readonly WasdMobPosition[] {
  if (!validWorldPosition(from) || !validWorldPosition(desired)) throw new Error("WASD_MOB_COLLISION_INPUT_INVALID");
  const dx = desired.x - from.x, dz = desired.z - from.z;
  if (dx === 0 && dz === 0) return Object.freeze([]);
  const steps = Math.max(1, Math.ceil(Math.abs(dx) / WASD_MOB_COLLISION_SUBSTEP_MAX_MM), Math.ceil(Math.abs(dz) / WASD_MOB_COLLISION_SUBSTEP_MAX_MM));
  const targets: WasdMobPosition[] = [];
  for (let step = 1; step <= steps; step += 1) targets.push(Object.freeze({ x: from.x + Math.round(dx * step / steps), z: from.z + Math.round(dz * step / steps) }));
  return Object.freeze(targets);
}

/** Pure WASD sweep sequencing. Concrete world geometry is injected by the runtime. */
export function resolveWasdMobCollisionMovement(from: WasdMobPosition, desired: WasdMobPosition, resolveStep: WasdMobCollisionResolver): WasdMobPosition {
  let current: WasdMobPosition = from;
  for (const target of mobCollisionSubsteps(from, desired)) {
    if (Math.abs(target.x - current.x) > WASD_MOB_COLLISION_SUBSTEP_MAX_MM || Math.abs(target.z - current.z) > WASD_MOB_COLLISION_SUBSTEP_MAX_MM) throw new Error("WASD_MOB_COLLISION_SUBSTEP_INVALID");
    const resolved = resolveStep(current, target);
    if (!validWorldPosition(resolved)) throw new Error("WASD_MOB_COLLISION_RESULT_INVALID");
    current = Object.freeze({ x: resolved.x, z: resolved.z });
    if (current.x !== target.x || current.z !== target.z) return current;
  }
  return current;
}
