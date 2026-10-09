// Shared release boundary: documentation-only PRs record memory without
// rebuilding production. A mixed change still requires the full release lane.
export function requiresAurionRelease(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new Error("RELEASE_FILE_LIST_REQUIRED");
  const excluded = new Set([
    "SUMMARY.md", "Memory.md", ".gitignore",
    ".github/workflows/game-development-studio-smoke.yml",
    "scripts/install-game-development-studio.mjs",
  ]);
  return paths.some(path => !excluded.has(path) && !path.startsWith("docs/") && !path.startsWith(".game-dev/"));
}
