import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Production 2026-11-04: 300 never-pruned release directories (121 GB) left too little
// space for the schema recovery capacity gate (DB x 3 + 512 MiB) and blocked a release.
const promoter = readFileSync("deploy/promote-aurion-zone-runtime.sh", "utf8");
const start = promoter.indexOf("# release-retention-start");
const end = promoter.indexOf("# release-retention-end");
const block = promoter.slice(start, end);

describe("promoter release retention", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  function fixture(count: number) {
    const runtimeBase = mkdtempSync(join(tmpdir(), "aurion-retention-"));
    roots.push(runtimeBase);
    const releases = join(runtimeBase, "releases");
    mkdirSync(releases);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = `${i.toString(16).padStart(40, "a")}-${41000000000 + i}`;
      mkdirSync(join(releases, id));
      const at = new Date(Date.UTC(2026, 9, 1 + i));
      utimesSync(join(releases, id), at, at);
      ids.push(id);
    }
    return { runtimeBase, releases, ids };
  }
  const run = (runtimeBase: string, release: string) => execFileSync("bash", ["-euo", "pipefail", "-c", `runtime_base=${JSON.stringify(runtimeBase)}\nrelease=${JSON.stringify(release)}\n${block}`], { encoding: "utf8" });

  it("keeps the newest releases and the active one, prunes the rest, and never touches other entries", () => {
    const { runtimeBase, releases, ids } = fixture(9);
    // A rollback: the active release is old; the promoted one is the newest.
    symlinkSync(join(releases, ids[1]), join(runtimeBase, "current"));
    mkdirSync(join(releases, "operator-notes"));
    symlinkSync(join(releases, ids[0]), join(releases, `${"f".repeat(40)}-1`));
    const out = run(runtimeBase, join(releases, ids[8]));
    expect(JSON.parse(out.trim().split("\n").pop()!)).toEqual({ recordType: "aurion.release-retention", schemaVersion: 1, keep: 5, pruned: 3 });
    // Kept: the five newest releases (incl. the promoted one), the active one, and every
    // non-release entry. Pruned: the three older non-active releases (incl. the symlink's target
    // ids[0] is a real release and is pruned; the symlink entry itself stays).
    expect(readdirSync(releases).sort()).toEqual([...ids.slice(4), ids[1], "operator-notes", `${"f".repeat(40)}-1`].sort());
  });

  it("does nothing when at most five releases exist", () => {
    const { runtimeBase, releases, ids } = fixture(4);
    symlinkSync(join(releases, ids[3]), join(runtimeBase, "current"));
    expect(run(runtimeBase, join(releases, ids[3]))).toContain('"pruned":0');
    expect(readdirSync(releases)).toHaveLength(4);
  });

  it("runs after the promotion and its readbacks, as report-only", () => {
    expect(start).toBeGreaterThan(promoter.indexOf('mv -Tf "${runtime_base}/current.next" "${runtime_base}/current"'));
    expect(start).toBeGreaterThan(promoter.indexOf("phase=godot-bridge-installation"));
    expect(block).not.toMatch(/^\s*exit\b/m);
  });
});
