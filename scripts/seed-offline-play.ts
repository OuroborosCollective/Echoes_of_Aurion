#!/usr/bin/env tsx
/**
 * Offline Dev Session Seed Script (Option 2)
 *
 * This script prints the exact sessionStorage injection command and deterministic
 * snapshot payload to load AX1 locally in offline dev mode without live WASD network contracts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.cwd(), "fixtures/dev/offline-play-launch.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const storageKey = "aurion:confirmed-play-launch.v1";
const payload = JSON.stringify(fixture);

console.log("=== Aurion AX1 Offline Dev Session Seed ===");
console.log(`Storage Key: ${storageKey}`);
console.log(`Fixture:     ${fixturePath}`);
console.log("");
console.log("Browser DevTools Console Snippet:");
console.log(`sessionStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(payload)}); location.href = '/play';`);
console.log("");
console.log("Or in local dev server (?dev_offline=1):");
console.log("http://localhost:3000/play?dev_offline=1");
console.log("==========================================");
