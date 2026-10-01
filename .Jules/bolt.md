## 2024-06-25 - Avoid O(N) Array Allocation for Getting First Element of a Set
**Learning:** Using `Array.from(set)[0]` requires allocating a new array containing all elements of the Set, which introduces O(N) time and space overhead. This is unnecessary and inefficient when only the first element is needed.
**Action:** Use `set.values().next().value` to retrieve the first element of a Set in O(1) time without allocating a temporary array. This is especially beneficial when doing it repeatedly or on large sets.
