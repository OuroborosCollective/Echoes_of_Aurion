#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: promote-aurion-zone-runtime <artifact-dir> <expected-sha40> <release-id>" >&2
  exit 64
fi

artifact_dir="$1"
expected_sha="$2"
release_id="$3"
base=/opt/aurion-zone-runtime
service=aurion-zone-runtime.service
site=/etc/nginx/sites-enabled/arelogic.space
snippet=/etc/nginx/snippets/arelogic-zone-runtime.conf
rate_limit=/etc/nginx/conf.d/zz-aurion-zone-runtime-rate-limit.conf
env_file=/etc/aurion-zone-runtime.env
archive="${artifact_dir}/aurion-zone-runtime-release.tgz"
checksum="${artifact_dir}/aurion-zone-runtime-release.tgz.sha256"

[[ "$expected_sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+$ ]]
[[ -d "$artifact_dir" && -f "$archive" && -f "$checksum" ]]
[[ -f "${artifact_dir}/aurion-zone-runtime.service" ]]
[[ -f "${artifact_dir}/aurion-zone-runtime.environment.template" ]]
[[ -f "${artifact_dir}/arelogic-zone-runtime.nginx.conf" ]]
[[ -f "${artifact_dir}/arelogic-zone-runtime-rate-limit.nginx.conf" ]]

cd "$artifact_dir"
sha256sum -c "$checksum"

install -d -o aurion-deploy -g aurion-deploy -m 0755 "${base}/releases"
release="${base}/releases/${release_id}"
test ! -e "$release"
install -d -o aurion-deploy -g aurion-deploy -m 0755 "$release"
tar -xzf "$archive" -C "$release"
chown -R aurion-deploy:aurion-deploy "$release"
grep -F "$expected_sha" "${release}/.aurion-zone-runtime-release.json"

ln -sTfn "$release" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"
test "$(readlink -f "${base}/current")" = "$release"

install -D -m 0755 "${artifact_dir}/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime
install -D -m 0644 "${artifact_dir}/aurion-zone-runtime.service" "/etc/systemd/system/${service}"
install -D -m 0644 "${artifact_dir}/arelogic-zone-runtime-rate-limit.nginx.conf" "$rate_limit"
install -D -m 0644 "${artifact_dir}/arelogic-zone-runtime.nginx.conf" "$snippet"

if [[ ! -f "$env_file" ]]; then
  install -D -m 0600 "${artifact_dir}/aurion-zone-runtime.environment.template" "$env_file"
fi
sed -i "s|^AURION_RUNTIME_REVISION=.*|AURION_RUNTIME_REVISION=${expected_sha}|" "$env_file"

include='    include /etc/nginx/snippets/arelogic-zone-runtime.conf;'
if ! grep -Fq "/etc/nginx/snippets/arelogic-zone-runtime.conf" "$site"; then
  sed -i "s|^    root /var/www/echoes-of-aurion/current;|${include}\n    root /var/www/echoes-of-aurion/current;|" "$site"
fi

systemctl daemon-reload
systemctl enable "$service"
systemctl restart "$service"
curl --fail --silent --show-error http://127.0.0.1:3100/_runtime/healthz | grep -F "$expected_sha"
nginx -t
systemctl reload nginx
