import { ZONE_POSITION_LIMIT, ZONE_POSITION_MIN, validWorldPosition } from "../shared/zonePresenceContract";

export type WasdZonePosition = Readonly<{ x: number; z: number }>;
export type WasdZoneMovementIntent = Readonly<{ x: number; z: number }>;
export type WasdCollisionResolver = (from: WasdZonePosition, desired: WasdZonePosition) => WasdZonePosition;

export const WASD_ZONE_CARDINAL_STEP_FIXED = 340;
export const WASD_ZONE_DIAGONAL_STEP_FIXED = 240;

function clampFixed(value: number): number {
  return Math.max(ZONE_POSITION_MIN, Math.min(ZONE_POSITION_LIMIT, value));
}

/** Pure WASD fixed-point movement rule. World collision is injected as data/geometry authority. */
export function integrateWasdZoneMovement(position: WasdZonePosition, input: WasdZoneMovementIntent, resolveCollision: WasdCollisionResolver): WasdZonePosition {
  if (!validWorldPosition(position) || ![input.x, input.z].every(value => Number.isInteger(value) && Math.abs(value) <= 1)) throw new Error("WASD_MOVEMENT_COORDINATE_INVALID");
  const step = input.x !== 0 && input.z !== 0 ? WASD_ZONE_DIAGONAL_STEP_FIXED : WASD_ZONE_CARDINAL_STEP_FIXED;
  const desired = Object.freeze({ x: clampFixed(position.x + input.x * step), z: clampFixed(position.z + input.z * step) });
  const resolved = resolveCollision(position, desired);
  if (!validWorldPosition(resolved)) throw new Error("WASD_MOVEMENT_COLLISION_RESULT_INVALID");
  return Object.freeze({ x: resolved.x, z: resolved.z });
}
