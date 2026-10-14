## 2025-02-27 - [Optimize Set Retrieval]
**Learning:** Using `Array.from(set)[0]` or `[...set][0]` incurs O(N) array allocation overhead to retrieve a single element.
**Action:** Use `set.values().next().value` to retrieve the first element in O(1) time.
## 2025-02-27 - [Optimize Map Iteration in Hot Paths]
**Learning:** Using spread syntax like `[...map.values()].find(...)` or `[...map.values()].filter(...).reduce(...)` creates intermediate arrays that incur O(N) allocation overhead. This can significantly degrade performance when executed frequently or over large collections.
**Action:** Replace spread/Array.from operations on iterables with direct `for...of` loops over `map.values()` to achieve O(1) space complexity and enable early exit (e.g., using `break`).
