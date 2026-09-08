const fs = require('fs');
let code = fs.readFileSync('e2e/aim253.glbActors.spec.ts', 'utf8');

// I will just modify the timeout for the predicate:
// await expect.poll(() => presence!.position[axis], { timeout: 3_000, intervals: [25, 50, 100] }).not.toBe(current);
// => timeout: 5_000
code = code.replace(/timeout: 3_000, intervals: \[25, 50, 100\] }\)\.not\.toBe\(current\)/g, "timeout: 8_000, intervals: [25, 50, 100] }).not.toBe(current)");

// Also maybe the key delay:
// await page.keyboard.press(key, { delay: 120 });
// => await page.keyboard.press(key, { delay: 250 });
code = code.replace(/delay: 120 }\);/g, "delay: 350 });");

fs.writeFileSync('e2e/aim253.glbActors.spec.ts', code, 'utf8');
console.log("Patched test");
