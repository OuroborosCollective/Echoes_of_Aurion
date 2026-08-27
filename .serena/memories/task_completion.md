# Task completion gates
1. Run `pnpm check`.
2. Run focused tests for changed modules, then `pnpm test`.
3. Run `git diff --check` and inspect `git status --short --branch`.
4. For generated audio, run ffprobe decode/duration/channel checks and SHA-256 inventory.
5. Perform browser/runtime readback for visible gameplay changes; document headless compositor limits separately.
6. Review candidate branch/PR evidence before any merge, deployment, or production mutation.