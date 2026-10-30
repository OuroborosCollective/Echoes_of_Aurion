/**
 * Deterministic layout math for the thumb-zone combat cluster.
 *
 * Angles are math-style degrees: 0 = right, 90 = up, 180 = left. Results are unit
 * vectors in SCREEN space (x to the right, y downward) that CSS multiplies by a
 * ring radius. Pure and side-effect free: same input, same output, always.
 */
export type ArcSlot = Readonly<{ index: number; angleDeg: number; x: number; y: number }>;

const round = (value: number) => Math.round(value * 1e4) / 1e4;

export function arcSlots(count: number, fromDeg: number, toDeg: number): readonly ArcSlot[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be a non-negative integer");
  if (!Number.isFinite(fromDeg) || !Number.isFinite(toDeg)) throw new RangeError("angles must be finite");
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const angleDeg = fromDeg + (toDeg - fromDeg) * t;
    const rad = (angleDeg * Math.PI) / 180;
    return { index, angleDeg: round(angleDeg), x: round(Math.cos(rad)), y: round(-Math.sin(rad)) };
  });
}

/**
 * Smallest ring radius (as a multiple of the button diameter) at which `count`
 * equally sized circles on an arc of `spanDeg` keep `spacing` x diameter between
 * their edges. Used to prove the CSS constant never lets skill buttons overlap.
 */
export function minRingRadiusInDiameters(count: number, spanDeg: number, spacing = 1.08): number {
  if (count < 2) return 0;
  const stepRad = ((spanDeg / (count - 1)) * Math.PI) / 180;
  return spacing / (2 * Math.sin(stepRad / 2));
}

/** Inner ring of utility buttons: fixed, ordered slots closest to the thumb. */
export const UTILITY_ANGLES_DEG = { interact: 135, autoAttack: 90, autoLoot: 180 } as const;

/** Skills fan from just above the left of the attack button up to just left of vertical. */
export const SKILL_ARC = { fromDeg: 176, toDeg: 84 } as const;
