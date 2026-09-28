## 2024-05-18 - Avoid O(N) Maps and Sorts inside Tick Loops
**Learning:** Found O(N) object conversion and `.sort()` on `this.zones.entries()` running on every tick inside `zoneRuntime.ts` despite the `this.sortedZonesDirty` check logic not resetting properly or logic inside tick loops causing continuous dirty states, leading to high garbage collection latency.
**Action:** Use pre-cached ordered arrays or ensure dirty flags properly avoid redundant allocations in high-frequency loops. Avoid $O(N)$ operations.
## 2024-05-18 - Avoid O(N) Maps and Object construction inside FSM Tick Loops
**Learning:** Found O(N) map construction `const presenceById = new Map(presences.map(presence => [presence.entityId, presence] as const));` inside `resolveMobFsmTick` running for every mob, on every tick inside `wasdMobFsmProtocol.ts`. This leads to excessive garbage collection latency and high CPU usage.
**Action:** Instead of creating a new Map every tick in `resolveMobFsmTick`, either pass in a pre-constructed Map, or iterate `presences` array linearly to find the target. For small N, linear scan `presences.find(p => p.entityId === current.targetEntityId)` is much faster than constructing an O(N) map.
## 2024-05-18 - Avoid unnecessary object creation for diffing in tick loop
**Learning:** `publicMobSnapshot` was being called twice per mob per tick inside `zoneMobRuntime.ts`'s `tick` loop merely to check if the mob changed, creating tons of short-lived objects.
**Action:** Avoid allocating new objects just for equality checks in hot paths. Diff properties directly against the `MobRuntimeState` objects before and after the FSM tick.
## 2024-05-18 - Optimize mob difference check
**Learning:** Checking for state changes inside `zoneMobRuntime.ts` using `sameMob(publicMobSnapshot(current), publicMobSnapshot(next))` allocates 4 new objects (position x2, snapshot x2) per mob per tick, causing GC pressure.
**Action:** Replace `sameMob` with `sameMobState(current, next)` which compares fields directly on `MobRuntimeState` avoiding object allocations.
