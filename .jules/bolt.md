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

## 2026-09-12 - Transition from O(N) iterative lookups to O(1) Map lookups for resolving entities in high-frequency loops
**Learning:** High-frequency game loops experience performance degradation and garbage collection latency when using O(N) array iterations to locate entities on every tick.
**Action:** Implemented O(1) Map lookups (`peersByEntityId`) populated dynamically during lifecycle events (join/leave) instead of searching via array iteration, particularly beneficial in `AuthoritativeMovementZone.resolveMobAttacks()` and `AuthoritativeMovementZone.join()`.

## 2024-05-19 - Optimization: caching sorted array to avoid map lookups/dynamic mapping in game loops
**Learning:** Found a specific anti-pattern in the server game loop codebase: iterating over $O(1)$ maps dynamically on each high frequency tick or converting a map to a sorted array inside `snapshot` each time it is requested. Due to fixed 100ms game ticks, Map lookups in inner loops across numerous entities and allocating arrays mapping those states create huge overhead and GC pressure.
**Action:** When working on arrays that map static keys to mutable states inside `tick()` or `snapshot()` routines in `zone*Runtime.ts`, pre-sort the list in the constructor as an array cache (like `this.orderedStates`). Use the array inside `tick()` loops and iterate exactly using `for...of` avoiding map `.get()` and avoiding spread + `.map()` dynamic allocations.

## 2024-05-24 - Elimination of Array.from and map.entries() during high-frequency server tick loops
**Learning:** Using `Array.from(map.entries())`, `Array.from(map.values())`, and mapping over `Array.from()` inside high-frequency server loops (like `zoneRuntime.tick()`) dynamically allocates intermediate arrays and tuple objects for each map entry. This creates significant overhead and causes garbage collection pauses, which degrades game server performance.
**Action:** Replace `Array.from(map.values())` with `for...of map.values()` and pushing to a pre-allocated or newly allocated array. Replace `Array.from(map.entries()).sort()` with a multi-step process: extract keys using `for...of map.keys()`, sort the array of keys directly, and retrieve values from the map by iterating over the sorted keys using `.get()`. This eliminates the intermediate tuple allocations and improves execution speed inside server tick loops.
