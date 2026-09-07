## 2024-05-24 - React useMemo & Hashmap Optimization in InventoryModal
**Learning:** Found a major performance bottleneck where a component was performing `indexOf` lookups on an array inside a `.sort()` function, resulting in O(N log N) array creations/lookups on every render since filtering and mapping were not memoized.
**Action:** Used `useMemo` for heavy array mapping/filtering dependent on `readback`. Replaced array `indexOf` lookups inside `.sort` with a static hash map lookup for $O(1)$ access.
