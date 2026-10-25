1. **Remove per-tick allocation of `actionSequenceWatermarks` Map**:
   - In `server/zoneRuntime.ts`, move the `actionSequenceWatermarks` instantiation (`new Map`) out of the `tick()` function loop to become a class property of `AuthoritativeMovementZone`.
   - Initialize it as `private actionSequenceWatermarks = new Map<number, number>();` in `AuthoritativeMovementZone`.
   - In `tick()`, replace `const actionSequenceWatermarks = new Map(...)` with a loop to clear and repopulate the existing class-level `Map`:
     ```typescript
     this.actionSequenceWatermarks.clear();
     for (const peer of this.sortedPeers) {
       this.actionSequenceWatermarks.set(peer.userId, peer.lastAcceptedClientSeq);
     }
     ```
   - Update usages in `tick()` from `actionSequenceWatermarks.get(...)` and `.set(...)` to `this.actionSequenceWatermarks.get(...)` and `.set(...)`.

2. **Verify changes**:
   - Run `pnpm test --run` to ensure no tests break.

3. **Complete pre-commit steps**:
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
