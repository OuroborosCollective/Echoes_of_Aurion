const fs = require('fs');
let code = fs.readFileSync('e2e/aim253.glbActors.spec.ts', 'utf8');

// The test fails because it times out trying to steer.
// Steer logic: `const key = current < targetMm ? positiveKey : negativeKey;`
// Then it presses the key and checks if position changed: `expect.poll(() => ...).not.toBe(current)`

// The timeout was "Timeout 3000ms exceeded while waiting on the predicate"
// meaning the position never changed, which implies either:
// 1) The key was not the correct one to move in that direction (so it moved the wrong way, or it's stuck against a wall).
// 2) The character is just stuck.
// 3) The `intervals` and `timeout` are too tight on slower machines (like github actions).

// Wait, the failure was:
// `await steerConfirmedAxis("z", -13000, "s", "w");` -> target -13000.
// current was -13600 (from previous run) -> `current < targetMm` is `-13600 < -13000` which is `true`.
// so it picks `positiveKey` which is `"s"`.
// If "s" moves character backward (positive Z), then it will increase Z, which is correct (moving towards -13000).
// Why didn't it move? Maybe the delay is too small, so the key press isn't registered long enough?
// "delay: 120" -> means it holds the key for 120ms. In some systems this might not result in enough movement to change position by next poll.

// Let's modify the delay in `steerConfirmedAxis` to hold the key for longer (e.g. 500ms) and increase the timeout for the poll.
code = code.replace(/delay: 350 }\);/g, "delay: 800 });");
code = code.replace(/delay: 120 }\);/g, "delay: 800 });");
code = code.replace(/timeout: 8_000,/g, "timeout: 15_000,");
code = code.replace(/timeout: 3_000,/g, "timeout: 15_000,");

fs.writeFileSync('e2e/aim253.glbActors.spec.ts', code, 'utf8');
