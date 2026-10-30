#!/usr/bin/env bash
# Invoked only inside the canonical, attested runtime promotion after its gates.
set -euo pipefail
[[ $# -eq 3 && "$2" =~ ^[a-f0-9]{40}$ && "$EUID" -eq 0 && "$3" =~ ^[01]$ ]]
release="$1"
revision="$2"
[[ "$(readlink -f /opt/aurion-traefik-runtime/current)" == "$release" ]]
python3 "${release}/deploy/verify-aurion-godot-feed.py" unit-preflight
unit=/etc/systemd/system/aurion-godot-bridge.service
if [[ -e "$unit" || -L "$unit" ]]; then
  [[ -f "$unit" && ! -L "$unit" && "$(stat -c '%U:%G:%a' "$unit")" == root:root:644 ]]
  grep -Fqx '# aurion-godot-bridge-release: 1' "$unit"
fi
if [[ "$3" == 0 ]]; then
  if [[ -e "$unit" ]]; then
    systemctl disable --now aurion-godot-bridge.service >/dev/null
    if systemctl is-active --quiet aurion-godot-bridge.service; then exit 70; fi
    if systemctl is-enabled --quiet aurion-godot-bridge.service; then exit 70; fi
  fi
  exit 0
fi
python3 "${release}/deploy/verify-aurion-godot-feed.py" preflight
node --input-type=module -e '
  import fs from "node:fs";
  import { createHash } from "node:crypto";
  const [release,revision]=process.argv.slice(1);
  const p=release+"/godot-bridge/";
  const m=JSON.parse(fs.readFileSync(p+"build-manifest.json","utf8"));
  const hash=createHash("sha256").update(fs.readFileSync(p+"aurion-godot-bridge.mjs")).digest("hex");
  if(m.schema!=="aurion.godot.bridge.build.v1"||m.sourceRevision!==revision||m.bridge?.file!=="aurion-godot-bridge.mjs"||m.bridge.sha256!==hash) process.exit(70);
' "$release" "$revision"
release_id="$(basename "$release")"
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+$ && "$release_id" == "${revision}-"* ]]
bridge_base=/srv/serverin/tools/aurion-godot-bridge
bridge_release="${bridge_base}/releases/${release_id}"
for directory in "$bridge_base" "${bridge_base}/releases" "$bridge_release"; do
  [[ ! -L "$directory" ]]
done
install -d -o root -g aurion-deploy -m 0750 "$bridge_base" "${bridge_base}/releases" "$bridge_release"
for file in aurion-godot-bridge.mjs build-manifest.json; do
  if [[ -e "${bridge_release}/${file}" ]]; then
    [[ ! -L "${bridge_release}/${file}" ]]
    [[ "$(stat -c '%U:%G:%a' "${bridge_release}/${file}")" == "root:aurion-deploy:440" ]]
    cmp -s "${release}/godot-bridge/${file}" "${bridge_release}/${file}"
  else
    install -o root -g aurion-deploy -m 0440 "${release}/godot-bridge/${file}" "${bridge_release}/${file}"
  fi
done
[[ ! -e "${bridge_base}/current" || -L "${bridge_base}/current" ]]
ln -sTfn "$bridge_release" "${bridge_base}/current.next"
mv -Tf "${bridge_base}/current.next" "${bridge_base}/current"
install -d -o aurion-deploy -g aurion-deploy -m 0750 /srv/serverin/evidence/aurion-godot-bridge
install -o root -g root -m 0644 "${release}/deploy/aurion-godot-bridge.service" /etc/systemd/system/aurion-godot-bridge.service
install -o root -g root -m 0600 "${release}/deploy/aurion-godot-bridge.environment.template" /etc/aurion-godot-bridge.env
systemctl daemon-reload
systemctl enable aurion-godot-bridge.service >/dev/null
systemctl restart aurion-godot-bridge.service
systemctl is-active --quiet aurion-godot-bridge.service
