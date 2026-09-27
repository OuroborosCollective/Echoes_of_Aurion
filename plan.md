1. **Optimize `BuffDebuffSystem.multiplier`**
   - The method `multiplier` currently uses `Array.from(this.buffs.values()).filter(...).reduce(...)` to calculate the total buff magnitude. This approach allocates a new array and creates multiple intermediate arrays, causing unnecessary garbage collection overhead in a high-frequency method.
   - Replace it with a single `for...of` loop over `this.buffs.values()` that accumulates `totalBps` directly.
   - Modify `server/ax1CombatAuthority.ts`.

2. **Run tests**
   - Run `pnpm test --run` to ensure no functionality is broken.

3. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Call `pre_commit_instructions` tool to get the required checks and follow them.

4. **Submit PR**
   - Submit the change with title "⚡ Bolt: Optimize BuffDebuffSystem multiplier calculation".
