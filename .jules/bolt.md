## 2024-05-24 - React useMemo & Hashmap Optimization in InventoryModal
**Learning:** Found a major performance bottleneck where a component was performing `indexOf` lookups on an array inside a `.sort()` function, resulting in O(N log N) array creations/lookups on every render since filtering and mapping were not memoized.
**Action:** Used `useMemo` for heavy array mapping/filtering dependent on `readback`. Replaced array `indexOf` lookups inside `.sort` with a static hash map lookup for $O(1)$ access.
- Cached the allowed origins from environment variable in `server/_core/index.ts` to optimize the `allowedCorsOrigin` function. This avoids performing expensive string operations (split, map, filter) on every incoming HTTP request, which will slightly improve the overall request throughput and lower latency.

## 2026-09-08 - Array Allocation Overhead in Zone Tick Loop
**Learning:** Found a severe performance bottleneck in `server/zoneRuntime.ts` where methods called in the 10Hz game loop (`presences()`, `combatants()`, `resolveMobAttacks()`) were allocating excessive intermediate arrays using `Array.from(...).map(...)` and `[...this.peers.values()].find(...)`. In a high-frequency tick environment, these temporary allocations create significant garbage collection pressure which can impact server latency.
**Action:** Replaced dynamic array creations and chaining methods with static array initialization and iterative `for...of` loops, avoiding intermediate arrays entirely and reducing GC pressure on every server tick.
## 2026-09-09 - [High-Frequency Server Ticks and Garbage Collection]
**Learning:** Using dynamic array allocations (e.g., `Array.from()`), spread syntax, and `.sort()` on every server tick causes massive garbage collection latency, significantly harming performance in high-frequency game loops like `server/zoneRuntime.ts` and `server/zoneMobRuntime.ts`.
**Action:** Always cache sorted arrays and use dirty flags to recalculate sorting only when items are added or removed. Use iterative `for...of` loops and pre-allocated arrays where possible, avoiding inline allocations on hot code paths.
## 2026-09-11 - Optimization: O(1) entity lookup in game loop\n**Learning:** Replaced O(N) array iteration with O(1) Map lookup () in `server/zoneRuntime.ts` high-frequency game loop for performance.\n**Action:** Updated `AuthoritativeMovementZone` to cache users in a map keyed by their `entityId` upon join, and removed them upon leave. Used this map in `resolveMobAttacks` instead of iterating over all peers.
## 2026-09-11 - Optimization: O(1) entity lookup in game loop
**Learning:** Replaced O(N) array iteration with O(1) Map lookup (peersByEntityId) in server/zoneRuntime.ts high-frequency game loop for performance.
**Action:** Updated AuthoritativeMovementZone to cache users in a map keyed by their entityId upon join, and removed them upon leave. Used this map in resolveMobAttacks instead of iterating over all peers.
