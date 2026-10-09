## 2024-05-23 - Optimize combat metrics reduction loop
**Learning:** Chained array operations (`.filter`, `.reduce`, `.map`) and spread syntax inside frequently executed reduction functions (like `reduceConfirmedCombatMetrics`) cause significant performance and garbage collection overhead.
**Action:** Replace functional array chains with single-pass `for` loops. Accumulate totals, perform lookups, and construct target states in a single iterative pass. For predetermined sized output arrays (like logs or charts), pre-allocate them using `new Array(size)` rather than relying on slice and map operations.
## 2024-05-23 - Optimize object serialization and parameter processing
**Learning:** Using `Object.entries(obj)` inside high-frequency serialization logic or HTTP request parameter building creates unnecessary intermediate array allocations, triggering frequent garbage collection.
**Action:** Replace `Object.entries(obj)` with direct `for (const key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) ... }` loops. Furthermore, pre-allocate arrays (`new Array(length)`) when constructing deterministic hashes or payloads to eliminate chained `.map().join()` overhead.
