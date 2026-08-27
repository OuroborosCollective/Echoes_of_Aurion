# Technology stack
- TypeScript 5.9, React 19, Vite 7, Babylon.js 9, tRPC 11, Drizzle ORM, MariaDB/mysql2.
- Package manager: pnpm 10; tests: Vitest 2 and Playwright.
- Client aliases: `@` -> `client/src`, `@shared` -> `shared`.
- Audio: browser Web Audio API plus optional fetch/decode asset URLs; `shared/audioProtocol.ts` is the contract and `client/src/lib/soundscape.ts` is the lifecycle-safe manager.
- Generated audio candidates are normalized PCM WAV under `audio/` and `public/audio/`.