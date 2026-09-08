## 2024-05-24 - React useMemo & Hashmap Optimization in InventoryModal
**Learning:** Found a major performance bottleneck where a component was performing `indexOf` lookups on an array inside a `.sort()` function, resulting in O(N log N) array creations/lookups on every render since filtering and mapping were not memoized.
**Action:** Used `useMemo` for heavy array mapping/filtering dependent on `readback`. Replaced array `indexOf` lookups inside `.sort` with a static hash map lookup for $O(1)$ access.
- Cached the allowed origins from environment variable in `server/_core/index.ts` to optimize the `allowedCorsOrigin` function. This avoids performing expensive string operations (split, map, filter) on every incoming HTTP request, which will slightly improve the overall request throughput and lower latency.

## 2026-09-08 - Array Allocation Overhead in Zone Tick Loop
**Learning:** Found a severe performance bottleneck in `server/zoneRuntime.ts` where methods called in the 10Hz game loop (`presences()`, `combatants()`, `resolveMobAttacks()`) were allocating excessive intermediate arrays using `Array.from(...).map(...)` and `[...this.peers.values()].find(...)`. In a high-frequency tick environment, these temporary allocations create significant garbage collection pressure which can impact server latency.
**Action:** Replaced dynamic array creations and chaining methods with static array initialization and iterative `for...of` loops, avoiding intermediate arrays entirely and reducing GC pressure on every server tick.
