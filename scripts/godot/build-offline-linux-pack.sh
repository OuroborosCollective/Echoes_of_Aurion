#!/usr/bin/env bash
# SHA-bound public Godot source and Linux editor; never bundles paid third-party source.
set -euo pipefail
export LC_ALL=C
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
OUT="${1:-.aurion-local-test-pack/godot-linux}"
test -f godot-client/project.godot || { echo 'Godot project missing' >&2; exit 1; }
test -f config/godot-toolchain.lock.json || { echo 'Godot toolchain lock missing' >&2; exit 1; }
SOURCE_SHA="$(git rev-parse HEAD)"
if [ -n "${AURION_RELEASE_SHA:-}" ] && [ "$SOURCE_SHA" != "$AURION_RELEASE_SHA" ]; then echo 'requested Git SHA does not match checkout' >&2; exit 1; fi
if [ -n "$(git ls-files -- godot-client/addons/modular_character_system/)" ]; then echo 'private licensed vendor source found in tracked files' >&2; exit 1; fi
if ! git diff --quiet HEAD -- godot-client config/godot-toolchain.lock.json scripts/godot; then echo 'dirty source files - refuse unpinned package' >&2; exit 1; fi
IFS='|' read -r ENGINE_FILE ENGINE_VERSION ARCHIVE_SHA < <(node -e 'const a=require("./config/godot-toolchain.lock.json").engine; console.log([a.file,a.version,a.sha256].join("|"))')
[[ "$ENGINE_FILE" =~ ^Godot_v[0-9A-Za-z._-]+$ && "$ENGINE_VERSION" =~ ^[0-9A-Za-z._-]+$ && "$ARCHIVE_SHA" =~ ^[0-9a-f]{64}$ ]] || { echo 'invalid Godot lock' >&2; exit 1; }
EDITOR_ROOT="${AURION_GODOT_WORKSPACE:-$ROOT/.aurion-godot}"
EDITOR_PATH="$EDITOR_ROOT/editor/$ENGINE_FILE"
RECEIPT="$EDITOR_ROOT/editor-receipt.json"
test -f "$EDITOR_PATH" && test -f "$RECEIPT" || { echo 'verified Godot editor or receipt missing' >&2; exit 1; }
EDITOR_SHA="$(sha256sum "$EDITOR_PATH" | cut -d' ' -f1)"
node -e 'const fs=require("fs"),[f,sha,ver,archive]=process.argv.slice(1),r=JSON.parse(fs.readFileSync(f,"utf8"));if(r.binarySha256!==sha||r.version!==ver||r.archiveSha256!==archive){console.error("Godot editor receipt checksum mismatch");process.exit(1)}' "$RECEIPT" "$EDITOR_SHA" "$ENGINE_VERSION" "$ARCHIVE_SHA"
ACTUAL_VERSION="$("$EDITOR_PATH" --headless --version)"
test "$ACTUAL_VERSION" = "$ENGINE_VERSION" || { echo 'Godot runtime version mismatch' >&2; exit 1; }
if [ -e "$OUT" ]; then
  test -d "$OUT" && test -z "$(find "$OUT" -mindepth 1 -maxdepth 1 -print -quit)" || { echo 'output not empty: stale artifact risk' >&2; exit 1; }
fi
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd -P)"
git archive HEAD godot-client scripts/godot config/godot-toolchain.lock.json | zstd -T0 -6 -o "$OUT/aurion-godot-project.tar.zst" >/dev/null
zstd -T0 -6 -f -o "$OUT/$ENGINE_FILE.zst" "$EDITOR_PATH" >/dev/null
cp config/godot-toolchain.lock.json "$OUT/godot-toolchain.lock.json"
cat > "$OUT/README.md" <<README
# Aurion Godot Linux offline workspace

Exact Git source revision: $SOURCE_SHA
Godot editor: $ENGINE_VERSION (Linux x86_64 only).

The git-tracked godot-client project includes its project.godot, scenes, scripts,
public add-ons, configuration, committed assets and original scripts/godot tooling. It does not contain .godot
cache or private paid add-ons. This is not an Android APK or a live world.

After downloading on Linux (requires zstd and tar):

    sha256sum --check SHA256SUMS
    zstd -dc aurion-godot-project.tar.zst | tar -xf -
    zstd -dc $ENGINE_FILE.zst > $ENGINE_FILE
    chmod +x $ENGINE_FILE
    ./$ENGINE_FILE --editor --path godot-client

Or use Godot Project Manager to import godot-client/project.godot.
The first editor launch creates local import caches.
The owner-purchased Modular Character System 1.0 is not included in public
GitHub artifacts. Stage it privately using the original purchased ZIP and
Aurion's private staging script after obtaining the source snapshot that
contains that script. Do not commit or redistribute paid toolkit files.
Some live generated assets require separate server-authorized staging.
README
AURION_PACK_OUT="$OUT" AURION_PACK_SHA="$SOURCE_SHA" AURION_PACK_EDITOR_SHA="$EDITOR_SHA" AURION_PACK_EDITOR_VERSION="$ENGINE_VERSION" AURION_PACK_ARCHIVE_SHA="$ARCHIVE_SHA" AURION_PACK_ENGINE_FILE="$ENGINE_FILE" node -e '
const fs=require("fs"),path=require("path"),crypto=require("crypto"),dir=process.env.AURION_PACK_OUT;
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(path.join(dir,p))).digest("hex");
const result={schemaVersion:"aurion.godot-linux-offline-pack.v1",sourceRevision:process.env.AURION_PACK_SHA,projectPath:"godot-client/project.godot",engineVersion:process.env.AURION_PACK_EDITOR_VERSION,engineBinarySha256:process.env.AURION_PACK_EDITOR_SHA,officialEditorArchiveSha256:process.env.AURION_PACK_ARCHIVE_SHA,projectArchiveSha256:sha("aurion-godot-project.tar.zst"),engineCompressedSha256:sha(process.env.AURION_PACK_ENGINE_FILE+".zst"),licensedAddonsBundled:false,productionDataBundled:false};
fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(result,null,2)+"\n");'
(
  cd "$OUT"
  sha256sum manifest.json README.md godot-toolchain.lock.json aurion-godot-project.tar.zst "$ENGINE_FILE.zst" > SHA256SUMS
  sha256sum --check SHA256SUMS
)
echo "AURION_GODOT_OFFLINE_PACK_PASS $SOURCE_SHA $OUT"
