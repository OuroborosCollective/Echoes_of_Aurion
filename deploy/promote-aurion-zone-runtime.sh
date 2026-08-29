#!/usr/bin/env bash
set -euo pipefail
unset NODE_OPTIONS

if [[ $# -ne 3 ]]; then
  echo "usage: promote-aurion-zone-runtime <artifact-dir> <expected-sha40> <release-id>" >&2
  exit 64
fi

artifact_dir="$1"
expected_sha="$2"
release_id="$3"
deploy_dir="${artifact_dir}/deploy"
base=/opt/aurion-zone-runtime
service=aurion-zone-runtime.service
site=/etc/nginx/sites-enabled/arelogic.space
snippet=/etc/nginx/snippets/arelogic-zone-runtime.conf
rate_limit=/etc/nginx/conf.d/zz-aurion-zone-runtime-rate-limit.conf
env_file=/etc/aurion-zone-runtime.env
archive="${artifact_dir}/aurion-zone-runtime-release.tgz"
checksum="${artifact_dir}/aurion-zone-runtime-release.tgz.sha256"
schema_artifact="${artifact_dir}/dist-production-reconcile"
schema_installer="${schema_artifact}/deploy/install-aurion-production-schema-reconcile"
schema_current=/opt/echoes-of-aurion-schema-reconcile/current

[[ "$expected_sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+$ ]]
[[ -d "$artifact_dir" && -f "$archive" && -f "$checksum" ]]
[[ -f "${deploy_dir}/aurion-zone-runtime.service" ]]
[[ -f "${deploy_dir}/aurion-zone-runtime.environment.template" ]]
[[ -f "${deploy_dir}/arelogic-zone-runtime.nginx.conf" ]]
[[ -f "${deploy_dir}/arelogic-zone-runtime-rate-limit.nginx.conf" ]]
[[ -f "${deploy_dir}/promote-aurion-zone-runtime.sh" ]]
[[ -d "$schema_artifact" ]]
[[ -f "${schema_artifact}/manifest.json" && -f "${schema_artifact}/checksums.sha256" ]]
[[ -f "$schema_installer" ]]
[[ -f "${schema_artifact}/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" ]]

cd "$artifact_dir"
sha256sum -c "$checksum"
(
  cd "$schema_artifact"
  sha256sum --strict -c checksums.sha256 >/dev/null
)

# The self-hosted deploy runner may invoke this root-owned promoter, but it must
# never receive general Docker-root authority. Provision the immutable
# reconciliation image only after the artifact and its image contract have been
# verified, and before either runtime pointer can change.
image_contract="${schema_artifact}/deploy/aurion-reconcile-runtime-image.conf"
[[ -f "$image_contract" ]]
image_tag="$(node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(c.schemaVersion!==1||c.recordType!=="aurion_reconcile_runtime_image_contract"||c.nodeMajorVersion!==22||typeof c.imageTag!=="string"||!/^node:22[A-Za-z0-9._:-]*$/.test(c.imageTag)){process.exit(2)}; process.stdout.write(c.imageTag)' "$image_contract")"
image_digest="$(node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(!c.imageDigest||!/^sha256:[a-f0-9]{64}$/.test(c.imageDigest)){process.exit(2)}; process.stdout.write(c.imageDigest)' "$image_contract")"
pinned_image="${image_tag}@${image_digest}"
docker pull "$pinned_image"
docker image inspect --format='{{range .RepoDigests}}{{println .}}{{end}}' "$pinned_image" | grep -Fq "@${image_digest}"

install -d -o aurion-deploy -g aurion-deploy -m 0755 "${base}/releases"
release="${base}/releases/${release_id}"
if [[ -e "$release" ]]; then
  [[ -f "${release}/.aurion-zone-runtime-release.json" ]]
  [[ -f "${release}/zoneService.cjs" ]]
else
  install -d -o aurion-deploy -g aurion-deploy -m 0755 "$release"
  tar -xzf "$archive" -C "$release"
  chown -R aurion-deploy:aurion-deploy "$release"
fi
grep -F "$expected_sha" "${release}/.aurion-zone-runtime-release.json"

ln -sTfn "$release" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"
test "$(readlink -f "${base}/current")" = "$release"

install -D -m 0755 "${deploy_dir}/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime
install -D -m 0644 "${deploy_dir}/aurion-zone-runtime.service" "/etc/systemd/system/${service}"
install -D -m 0644 "${deploy_dir}/arelogic-zone-runtime-rate-limit.nginx.conf" "$rate_limit"
install -D -m 0644 "${deploy_dir}/arelogic-zone-runtime.nginx.conf" "$snippet"

# Keep the bounded read-only schema runner revision-identical to the promoted runtime.
# The installer verifies its own immutable manifest/checksums and only installs the
# fixed root runner plus its exact sudoers entry. It never applies a migration.
bash "$schema_installer" "$schema_artifact" "$expected_sha" --enable-runner
[[ -x /usr/local/sbin/aurion-production-schema-reconcile ]]
[[ -L "$schema_current" ]]
[[ "$(readlink -f "$schema_current")" == "/opt/echoes-of-aurion-schema-reconcile/releases/${expected_sha}" ]]
grep -Fq "${expected_sha}" "${schema_current}/manifest.json"
visudo -cf /etc/sudoers.d/aurion-production-schema-reconcile >/dev/null
( cd "$schema_current" && sha256sum --strict -c checksums.sha256 >/dev/null )
cmp -s "${schema_artifact}/manifest.json" "${schema_current}/manifest.json"
cmp -s "${schema_artifact}/checksums.sha256" "${schema_current}/checksums.sha256"
test -f /usr/local/sbin/aurion-production-schema-reconcile
test ! -L /usr/local/sbin/aurion-production-schema-reconcile
test "$(stat -c '%U:%G:%a' /usr/local/sbin/aurion-production-schema-reconcile)" = "root:root:755"
cmp -s "${schema_artifact}/deploy/aurion-production-schema-reconcile" /usr/local/sbin/aurion-production-schema-reconcile
test -f /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-reconcile-artifact.mjs
test ! -L /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-reconcile-artifact.mjs
test "$(stat -c '%U:%G:%a' /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-reconcile-artifact.mjs)" = "root:root:755"
cmp -s "${schema_artifact}/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-reconcile-artifact.mjs

if [[ ! -f "$env_file" ]]; then
  install -D -m 0600 "${deploy_dir}/aurion-zone-runtime.environment.template" "$env_file"
fi
sed -i "s|^AURION_RUNTIME_REVISION=.*|AURION_RUNTIME_REVISION=${expected_sha}|" "$env_file"

include='    include /etc/nginx/snippets/arelogic-zone-runtime.conf;'
if ! grep -Fq "/etc/nginx/snippets/arelogic-zone-runtime.conf" "$site"; then
  sed -i "s|^    root /var/www/echoes-of-aurion/current;|${include}\n    root /var/www/echoes-of-aurion/current;|" "$site"
fi

systemctl daemon-reload
systemctl enable "$service"
systemctl restart "$service"

runtime_ready=0
for _attempt in $(seq 1 20); do
  if health_json="$(curl --fail --silent --show-error http://127.0.0.1:3100/_runtime/healthz 2>/dev/null)"; then
    if grep -Fq "$expected_sha" <<<"$health_json"; then
      printf '%s\n' "$health_json"
      runtime_ready=1
      break
    fi
  fi
  sleep 1
done
[[ "$runtime_ready" -eq 1 ]]
nginx -t
systemctl reload nginx
