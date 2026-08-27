# Suggested commands
- Install: `pnpm install --frozen-lockfile`
- Typecheck: `pnpm check`
- Full unit/integration suite: `pnpm test`
- Focused Vitest: `pnpm exec vitest run <path>`
- Browser E2E: `pnpm test:e2e`
- Audio integrity: `ffprobe -v error -show_entries format=duration,size:stream=codec_name,sample_rate,channels -of default=noprint_wrappers=1 <file>` and `sha256sum <file>`
- Git evidence: `git rev-parse HEAD`, `git diff --check`, `git status --short --branch`
- Do not run production migration/deploy from this candidate without explicit acceptance.