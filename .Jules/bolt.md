
## 2024-10-24 - Avoid Chained Array Methods in Tick Evaluations
**Learning:** Chaining array methods like `[...Array.from(map.values()).filter().map()]` allocates multiple intermediate array objects and closure contexts per evaluation. In a high-frequency loop (like the combat buff multiplier evaluation per tick), this causes severe garbage collection pressure resulting in latency spikes.
**Action:** When filtering or mapping Map values into an array during a hot loop, preallocate an array and use a direct `for...of` iteration over `.values()` to `.push()` the results directly, eliminating intermediate allocations.
