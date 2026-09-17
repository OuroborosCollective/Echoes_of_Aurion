
## 2024-11-20 - High-Frequency Map Sort Optimizations
**Learning:** Calling `Array.from(map.values()).sort(...)` in high-frequency game loops (like A* pathfinding and Threat Matrix evaluation in `server/ax1CombatAuthority.ts`) creates massive memory allocation overhead and redundant string sorting overhead, especially in TypeScript maps.
**Action:** Replace map value array sorts with inline `for...of` linear O(N) iteration when searching for minimum or maximum values. Pre-cache string keys on value object payload instances to avoid runtime re-evaluations inside the tight loop. Handle tie-breaking manually in the comparison condition. Also, take care when merging modified TypeScript objects synchronized across zones to avoid silently dropping sync payload fields (like `entropy`), and initialize accumulators appropriately (e.g. `Number.NEGATIVE_INFINITY` rather than `-1` for threat calculation bounds).

## 2024-11-20 - Nullability in Optimization State Resets
**Learning:** When using typescript with strict null checks, avoid resetting variable references to `null` while typing them as `string | null` if they are passed to mapping sets, index lookups, or strict types immediately afterwards.
**Action:** When scanning and storing the highest/lowest values with a loop cursor in TS, initialize string keys to `""` instead of `null` if the variable acts as a key for `Map`/`Set` operations later, avoiding unnecessary type narrowing checks.
