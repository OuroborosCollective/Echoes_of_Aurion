## 2024-05-30 - Replace Array.from(set)[0] with set.values().next().value
**Learning:** Using `Array.from(set)[0]` causes unnecessary $O(N)$ overhead by creating an entire array just to access the first element of a Set.
**Action:** Always use `set.values().next().value` to retrieve the first element of a Set in $O(1)$ time, which is especially important for runtime optimizations in frequent or hot path functions.
