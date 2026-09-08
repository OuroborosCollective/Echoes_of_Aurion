const test1 = -13000;
const tolerance = 450;
const current = -13600; // Let's say current is -13600

// In e2e test, we are trying to go from 0 to -13000 in Z.
// Wait, -13000 is smaller than 0.
// Steer loop does:
// if (Math.abs(current - targetMm) <= toleranceMm) return;
// const key = current < targetMm ? positiveKey : negativeKey;

// if current (-1000) < target (-13000) is FALSE. So it hits negativeKey.
// wait, -1000 is GREATER than -13000. So current < targetMm is FALSE.
// wait, negativeKey was passed as "w". So it presses "w".
// Does pressing "w" decrease Z or increase Z in this game?
// If "w" means forward, and we start at 0, and need to go to -13000, then "w" must decrease Z.
// Let's check: steerConfirmedAxis("z", -13000, "s", "w");
// if current is -13600, target is -13000.
// current (-13600) < target (-13000) is TRUE.
// So it will press positiveKey, which is "s".
// Pressing "s" should increase Z (from -13600 towards -13000).

// The error was: Expected: not -13600. Timeout 3000ms exceeded while waiting on the predicate (position.z not to be current).
// This means the player was stuck at -13600 and pressing "s" did not change the Z position.
// Why did the player get stuck? Maybe there's a collision at Z=-13600?
// Wait, "s" means moving backward.
// If player is at -13600, they are "behind" the target (-13000), so they press "s" to go back towards 0.
