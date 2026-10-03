## 2024-05-14 - Optimize retrieving first element from Set
**Learning:** Using `Array.from(set)[0]` to retrieve the first element of a Set requires O(N) time and memory allocation for the entire array.
**Action:** Use `set.values().next().value` instead to retrieve the first element in O(1) time and avoid unnecessary memory allocations.
