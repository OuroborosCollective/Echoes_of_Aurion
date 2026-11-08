#!/usr/bin/env bash
# Explicit post-release host install. Does not mutate Aurion DB or spawn actors.
set -euo pipefail
source_release="${1:?usage: install-aurion-glb-catalog-sync.sh /path/to/verified/release}"
[[ -f "$source_release/manifest.json" && -f "$source_release/scripts/godot/sync-approved-glbs.mjs" ]] || { echo 'CATALOG_RELEASE_FILES_MISSING' >&2; exit 1; }
root=/srv/serverin/tools/aurion-glb-sync
revision="$(python3 - "$source_release/manifest.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))['revision']
if len(r)!=40 or any(c not in '0123456789abcdef' for c in r): raise SystemExit('CATALOG_RELEASE_REVISION_INVALID')
print(r)
PY
)"
target="$root/releases/$revision"
# Root-owned and read-only for the service account (aurion-deploy runs it, cannot change it).
install -d -m 0755 "$root" "$root/releases" "$target"
install -m 0644 "$source_release/scripts/godot/sync-approved-glbs.mjs" "$target/sync-approved-glbs.mjs"
install -m 0644 "$source_release/deploy/aurion-glb-catalog-sync.service" /etc/systemd/system/aurion-glb-catalog-sync.service
install -m 0644 "$source_release/deploy/aurion-glb-catalog-sync.timer" /etc/systemd/system/aurion-glb-catalog-sync.timer
ln -sfn "$target" "$root/.current-$revision"
mv -Tf "$root/.current-$revision" "$root/current"
systemctl daemon-reload
systemctl enable --now aurion-glb-catalog-sync.timer
systemctl is-active --quiet aurion-glb-catalog-sync.timer
printf 'CATALOG_SYNC_INSTALLED revision=%s\n' "$revision"
