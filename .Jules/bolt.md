## 2026-10-04 - Optimize Map to Array conversion in hot loops
**Learning:** Using `Array.from(map.values()).sort()` in high-frequency game loops (like `tick` loops) causes excessive object allocations and garbage collection pressure, leading to server latency spikes.
**Action:** Always maintain the array length explicitly (`array.length = size`) and populate it in-place using an index counter (`let i = 0`) and a `for...of` loop over the Map's values, followed by calling `.sort()` directly on the cached array.
