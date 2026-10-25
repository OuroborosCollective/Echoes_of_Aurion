// Isolate manually dispatched infrastructure security tooling from Aurion releases.
// Mixed security + runtime changes still require production release evidence.
export function requiresAurionRelease(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new Error("RELEASE_FILE_LIST_REQUIRED");
  const excluded = new Set([
    "SUMMARY.md", "Memory.md", ".gitignore",
    ".github/workflows/game-development-studio-smoke.yml",
    "scripts/install-game-development-studio.mjs",
    "scripts/aurion-release-paths.mjs",
  ]);
  return paths.some(path =>
    !excluded.has(path) &&
    !path.startsWith("docs/") &&
    !path.startsWith(".game-dev/") &&
    !path.startsWith(".github/nerva/") &&
    path !== ".github/workflows/aurion-nerva-security.yml"
  );
}
