## 2025-02-27 - [Optimize Set Retrieval]
**Learning:** Using `Array.from(set)[0]` or `[...set][0]` incurs O(N) array allocation overhead to retrieve a single element.
**Action:** Use `set.values().next().value` to retrieve the first element in O(1) time.
