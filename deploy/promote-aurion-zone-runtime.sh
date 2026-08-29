#!/usr/bin/env bash
# aurion-traefik-promoter-protocol: 2
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
runtime_archive="${artifact_dir}/aurion-traefik-runtime-release.tgz"
runtime_checksum="${artifact_dir}/aurion-traefik-runtime-release.tgz.sha256"
runtime_base=/opt/aurion-traefik-runtime
runtime_env=/etc/aurion-traefik-runtime.env
receipt_dir=/var/lib/aurion-traefik-runtime/receipts
public_readback_dir=/var/lib/aurion-traefik-runtime-readback
schema_artifact="${artifact_dir}/dist-production-reconcile"
schema_installer="${schema_artifact}/deploy/install-aurion-production-schema-reconcile"
schema_current=/opt/echoes-of-aurion-schema-reconcile/current
schema_apply_artifact="${artifact_dir}/dist-production-apply"
schema_apply_installer="${schema_apply_artifact}/deploy/install-aurion-production-schema-apply"
schema_apply_current=/opt/echoes-of-aurion-schema-apply/current
legacy_service=aurion-zone-runtime.service
phase=preflight
trap 'status=$?; if [[ "$status" -ne 0 ]]; then printf "aurion-traefik-promoter failed phase=%s status=%s\\n" "$phase" "$status" >&2; fi' EXIT

[[ "$expected_sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+$ ]]
[[ -d "$artifact_dir" && -f "$runtime_archive" && -f "$runtime_checksum" ]]
[[ -f "${deploy_dir}/promote-aurion-zone-runtime.sh" ]]
[[ -f "${deploy_dir}/aurion-traefik-runtime.environment.template" ]]
[[ -d "$schema_artifact" ]]
[[ -f "${schema_artifact}/manifest.json" && -f "${schema_artifact}/checksums.sha256" ]]
[[ -f "$schema_installer" ]]
[[ -f "${schema_artifact}/deploy/verify-aurion-production-schema-reconcile-artifact.mjs" ]]
[[ -d "$schema_apply_artifact" ]]
[[ -f "${schema_apply_artifact}/manifest.json" && -f "${schema_apply_artifact}/checksums.sha256" ]]
[[ -f "$schema_apply_installer" ]]
[[ -f "${schema_apply_artifact}/deploy/aurion-production-schema-apply-core" ]]
[[ -f "${schema_apply_artifact}/deploy/verify-aurion-production-schema-apply-artifact.mjs" ]]

cd "$artifact_dir"
phase=runtime-archive-integrity
sha256sum -c "$runtime_checksum"
(
  cd "$schema_artifact"
  sha256sum --strict -c checksums.sha256 >/dev/null
)
(
  cd "$schema_apply_artifact"
  sha256sum --strict -c checksums.sha256 >/dev/null
)

# The read-only schema runner uses this separately verified, digest-pinned Node
# image on the private database network. Provision it inside the root boundary;
# the self-hosted runner never receives general Docker authority.
image_contract="${schema_artifact}/deploy/aurion-reconcile-runtime-image.conf"
phase=schema-image-integrity
[[ -f "$image_contract" ]]
image_tag="$(node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(c.schemaVersion!==1||c.recordType!=="aurion_reconcile_runtime_image_contract"||c.nodeMajorVersion!==22||typeof c.imageTag!=="string"||!/^node:22[A-Za-z0-9._:-]*$/.test(c.imageTag)){process.exit(2)}; process.stdout.write(c.imageTag)' "$image_contract")"
image_digest="$(node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(!c.imageDigest||!/^sha256:[a-f0-9]{64}$/.test(c.imageDigest)){process.exit(2)}; process.stdout.write(c.imageDigest)' "$image_contract")"
pinned_image="${image_tag}@${image_digest}"
docker pull "$pinned_image"
# Docker validates the requested content digest while pulling. RepoDigests may
# instead report the selected platform manifest for a multi-platform index, so
# only require that the exact digest-qualified reference now resolves locally.
image_id="$(docker image inspect --format '{{.Id}}' "$pinned_image")"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]

# The release archive is generated on the hosted verifier and contains only a
# Docker build context. Reject paths that could escape the root-owned release
# directory before extracting it.
phase=runtime-archive-paths
tar -tzf "$runtime_archive" | while IFS= read -r entry; do
  [[ "$entry" == ./* ]]
  [[ "$entry" != *"../"* ]]
done

install -d -o root -g root -m 0750 "${runtime_base}/releases"
phase=runtime-release-extraction
release="${runtime_base}/releases/${release_id}"
if [[ ! -e "$release" ]]; then
  install -d -o root -g root -m 0750 "$release"
  tar -xzf "$runtime_archive" -C "$release"
  chown -R root:root "$release"
  chmod -R go-w "$release"
fi

[[ -f "${release}/manifest.json" && -f "${release}/checksums.sha256" ]]
phase=runtime-release-integrity
(
  cd "$release"
  sha256sum --strict -c checksums.sha256 >/dev/null
)
node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFile } from "node:fs/promises";
  import path from "node:path";
  const [release, expected] = process.argv.slice(1);
  const manifest = JSON.parse(await readFile(path.join(release, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.recordType !== "aurion_traefik_runtime_artifact" || manifest.revision !== expected) process.exit(2);
  const required = ["Dockerfile", "docker-compose.traefik.yml", "package.json", "pnpm-lock.yaml", "deploy/promote-aurion-zone-runtime.sh", "deploy/aurion-traefik-runtime.environment.template", "dist/.aurion-runtime-build.json"];
  for (const relative of required) {
    if (typeof manifest.files?.[relative] !== "string" || !/^[a-f0-9]{64}$/.test(manifest.files[relative])) process.exit(3);
  }
  for (const [relative, expectedHash] of Object.entries(manifest.files ?? {})) {
    if (!/^[A-Za-z0-9@._/:-]+$/.test(relative) || relative.split("/").includes("..")) process.exit(4);
    const absolute = path.resolve(release, relative);
    if (!absolute.startsWith(`${path.resolve(release)}${path.sep}`)) process.exit(5);
    const actualHash = createHash("sha256").update(await readFile(absolute)).digest("hex");
    if (actualHash !== expectedHash) process.exit(6);
  }
  const runtime = JSON.parse(await readFile(path.join(release, "dist/.aurion-runtime-build.json"), "utf8"));
  if (runtime.revision !== expected || runtime.artifact !== "aurion-runtime") process.exit(7);
' "$release" "$expected_sha"

# Keep the bounded, read-only schema runner revision-identical to the promoted
# container. The installer only installs its fixed verifier/runner and never
# applies a migration or data backfill.
phase=schema-runner-install
bash "$schema_installer" "$schema_artifact" "$expected_sha" --enable-runner
[[ -x /usr/local/sbin/aurion-production-schema-reconcile ]]
[[ -L "$schema_current" ]]
[[ "$(readlink -f "$schema_current")" == "/opt/echoes-of-aurion-schema-reconcile/releases/${expected_sha}" ]]
grep -Fq "$expected_sha" "${schema_current}/manifest.json"
visudo -cf /etc/sudoers.d/aurion-production-schema-reconcile >/dev/null
(
  cd "$schema_current"
  sha256sum --strict -c checksums.sha256 >/dev/null
)
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

# The write-capable path is a distinct, separately verified artifact. Installing
# it never executes a migration; the only root entrypoint accepts a revision and
# plan hash and performs its own fresh readback, backup and recovery proof.
phase=schema-apply-runner-install
bash "$schema_apply_installer" "$schema_apply_artifact" "$expected_sha" --enable-runner
[[ -x /usr/local/sbin/aurion-production-schema-apply ]]
[[ -L "$schema_apply_current" ]]
[[ "$(readlink -f "$schema_apply_current")" == "/opt/echoes-of-aurion-schema-apply/releases/${expected_sha}" ]]
grep -Fq "$expected_sha" "${schema_apply_current}/manifest.json"
visudo -cf /etc/sudoers.d/aurion-production-schema-apply >/dev/null
(
  cd "$schema_apply_current"
  sha256sum --strict -c checksums.sha256 >/dev/null
)
cmp -s "${schema_apply_artifact}/manifest.json" "${schema_apply_current}/manifest.json"
cmp -s "${schema_apply_artifact}/checksums.sha256" "${schema_apply_current}/checksums.sha256"
test -f /usr/local/sbin/aurion-production-schema-apply
test ! -L /usr/local/sbin/aurion-production-schema-apply
test "$(stat -c '%U:%G:%a' /usr/local/sbin/aurion-production-schema-apply)" = "root:root:755"
cmp -s "${schema_apply_artifact}/deploy/aurion-production-schema-apply" /usr/local/sbin/aurion-production-schema-apply
test -f /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-apply-artifact.mjs
test ! -L /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-apply-artifact.mjs
test "$(stat -c '%U:%G:%a' /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-apply-artifact.mjs)" = "root:root:755"
cmp -s "${schema_apply_artifact}/deploy/verify-aurion-production-schema-apply-artifact.mjs" /usr/local/lib/echoes-of-aurion/verify-aurion-production-schema-apply-artifact.mjs

# Preserve the existing narrow sudo entrypoint while replacing its implementation
# with this verified Traefik promoter for future releases.
phase=promoter-self-install
install -D -o root -g root -m 0755 "${deploy_dir}/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime
cmp -s "${deploy_dir}/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime

if [[ ! -f "$runtime_env" ]]; then
  install -D -o root -g root -m 0600 "${deploy_dir}/aurion-traefik-runtime.environment.template" "$runtime_env"
fi
[[ "$(stat -c '%U:%G' "$runtime_env")" == "root:root" ]]
[[ "$(stat -c '%a' "$runtime_env")" =~ ^[0-7][0-7][0-7]$ ]]

read_runtime_env() {
  local key="$1"
  awk -v key="$key" '
    $0 !~ /^#/ && index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
    }
    END {
      if (value == "") exit 1
      print value
    }
  ' "$runtime_env"
}

aurion_env_file="$(read_runtime_env AURION_ENV_FILE)"
phase=runtime-environment
aurion_domain="$(read_runtime_env AURION_DOMAIN)"
traefik_network="$(read_runtime_env TRAEFIK_NETWORK)"
traefik_certresolver="$(read_runtime_env TRAEFIK_CERTRESOLVER)"
[[ "$aurion_env_file" == "/opt/echoes-of-aurion/.env.production" ]]
[[ -f "$aurion_env_file" ]]
[[ "$aurion_domain" == "arelogic.space" ]]
[[ "$traefik_network" == "areloria_arelorian-network" ]]
[[ "$traefik_certresolver" =~ ^[A-Za-z0-9_-]+$ ]]
docker network inspect "$traefik_network" >/dev/null

base_image="$pinned_image"
[[ "$base_image" == "node:22.13.0-bookworm-slim@sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff" ]]

runtime_image="echoes-of-aurion:${expected_sha}"
phase=runtime-image-build
docker build --pull=false --build-arg "AURION_RELEASE_SHA=${expected_sha}" --tag "$runtime_image" "$release"
[[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$runtime_image")" == "$expected_sha" ]]

export AURION_ENV_FILE="$aurion_env_file"
export AURION_DOMAIN="$aurion_domain"
export TRAEFIK_NETWORK="$traefik_network"
export TRAEFIK_CERTRESOLVER="$traefik_certresolver"
export AURION_IMAGE_TAG="$expected_sha"
export AURION_RELEASE_SHA="$expected_sha"
compose=(docker compose --project-name echoes-of-aurion --env-file "$runtime_env" -f "${release}/docker-compose.traefik.yml")
phase=compose-promotion
"${compose[@]}" config --quiet
"${compose[@]}" up --detach --no-build --force-recreate --no-deps aurion

container_id="$("${compose[@]}" ps -q aurion)"
[[ "$container_id" =~ ^[a-f0-9]{64}$ ]]
[[ "$(docker inspect --format '{{ index .Config.Labels "traefik.enable" }}' "$container_id")" == "true" ]]
[[ "$(docker inspect --format '{{ index .Config.Labels "traefik.docker.network" }}' "$container_id")" == "$traefik_network" ]]
[[ "$(docker inspect --format '{{ index .Config.Labels "traefik.http.services.aurion.loadbalancer.server.port" }}' "$container_id")" == "3000" ]]
docker inspect --format '{{ index .Config.Labels "traefik.http.routers.aurion.rule" }}' "$container_id" | grep -Fq "$aurion_domain"
docker inspect --format '{{range $network, $_ := .NetworkSettings.Networks}}{{println $network}}{{end}}' "$container_id" | grep -Fxq "$traefik_network"
[[ "$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id")" == "$expected_sha" ]]

container_ready=0
phase=container-health
for _attempt in $(seq 1 30); do
  if [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")" == "healthy" ]]; then
    docker exec -e "EXPECTED_SHA=${expected_sha}" "$container_id" node --input-type=module -e '
      const response = await fetch("http://127.0.0.1:3000/healthz");
      const body = await response.json();
      if (!response.ok || body.status !== "ok" || body.service !== "echoes-of-aurion" || body.revision !== process.env.EXPECTED_SHA) process.exit(1);
    '
    container_ready=1
    break
  fi
  sleep 1
done
if [[ "$container_ready" -ne 1 ]]; then
  runtime_state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  runtime_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")"
  # Keep process output inside the root boundary. Only a fixed, non-secret
  # failure category reaches Actions logs for a safe next repair decision.
  runtime_category="$(docker logs --tail 200 "$container_id" 2>&1 | node --input-type=module -e '
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    let category = "unclassified";
    const missing = raw.match(/Cannot find (?:package|module) \\x27([^\\x27]+)\\x27/);
    const packageName = missing?.[1] ?? "";
    const safePackageName = /^(?:@[A-Za-z0-9._-]+\\/)?[A-Za-z0-9._-]+$/.test(packageName) ? packageName : "unknown";
    if (/ERR_MODULE_NOT_FOUND|Cannot find (package|module)/.test(raw)) category = `module_not_found:${safePackageName}`;
    else if (/ERR_DLOPEN_FAILED/.test(raw)) category = "native_module_load_failed";
    else if (/EACCES/.test(raw)) category = "permission_denied";
    else if (/Could not find the build directory/.test(raw)) category = "static_build_missing";
    else if (/AURION_RELEASE_SHA must be/.test(raw)) category = "release_revision_invalid";
    else if (/Server running on http/.test(raw)) category = "server_started_but_health_unhealthy";
    process.stdout.write(category);
  ')"
  printf 'aurion-container-health-diagnostic state=%s health=%s category=%s\\n' "$runtime_state" "$runtime_health" "$runtime_category" >&2
  exit 1
fi

public_ready=0
phase=public-health
for _attempt in $(seq 1 30); do
  if health_json="$(curl --fail --silent --show-error "https://${aurion_domain}/healthz?revision=${expected_sha}" 2>/dev/null)"; then
    if printf '%s' "$health_json" | node --input-type=module -e '
      let raw = "";
      for await (const chunk of process.stdin) raw += chunk;
      const body = JSON.parse(raw);
      if (body.status !== "ok" || body.service !== "echoes-of-aurion" || body.revision !== process.argv[1]) process.exit(1);
    ' "$expected_sha"; then
      printf '%s\n' "$health_json"
      public_ready=1
      break
    fi
  fi
  sleep 1
done
[[ "$public_ready" -eq 1 ]]

ln -sTfn "$release" "${runtime_base}/current.next"
mv -Tf "${runtime_base}/current.next" "${runtime_base}/current"
test "$(readlink -f "${runtime_base}/current")" = "$release"

install -d -o root -g root -m 0750 "$receipt_dir"
phase=promotion-receipt
receipt="${receipt_dir}/${release_id}.json"
receipt_tmp="${receipt}.tmp"
runtime_image_id="$(docker image inspect --format '{{.Id}}' "$runtime_image")"
umask 077
printf '{"recordType":"aurion_traefik_runtime_receipt","revision":"%s","releaseId":"%s","imageId":"%s","containerId":"%s","domain":"%s"}\n' \
  "$expected_sha" "$release_id" \
  "$runtime_image_id" \
  "$container_id" "$aurion_domain" > "$receipt_tmp"
mv -Tf "$receipt_tmp" "$receipt"
ln -sTfn "$receipt" "${receipt_dir}/current.next"
mv -Tf "${receipt_dir}/current.next" "${receipt_dir}/current.json"

# The runner must not receive root or Docker access merely to attest a completed
# promotion. Publish only non-secret immutable identities in a root-authored,
# world-readable receipt; all configuration and database credentials remain
# inside the root-only release directories.
runtime_manifest_sha256="$(sha256sum "${release}/manifest.json" | awk '{print $1}')"
schema_manifest_sha256="$(sha256sum "${schema_current}/manifest.json" | awk '{print $1}')"
[[ "$runtime_manifest_sha256" =~ ^[a-f0-9]{64}$ ]]
[[ "$schema_manifest_sha256" =~ ^[a-f0-9]{64}$ ]]
install -d -o root -g root -m 0755 "$public_readback_dir"
public_readback_tmp="${public_readback_dir}/.${release_id}.json.tmp"
public_readback="${public_readback_dir}/current.json"
printf '{"recordType":"aurion_traefik_runtime_readback","revision":"%s","releaseId":"%s","imageId":"%s","containerId":"%s","domain":"%s","runtimeManifestSha256":"%s","schemaManifestSha256":"%s","schemaMode":"read_only"}\n' \
  "$expected_sha" "$release_id" "$runtime_image_id" "$container_id" "$aurion_domain" \
  "$runtime_manifest_sha256" "$schema_manifest_sha256" > "$public_readback_tmp"
chown root:root "$public_readback_tmp"
chmod 0644 "$public_readback_tmp"
mv -Tf "$public_readback_tmp" "$public_readback"

# The legacy loopback runtime is not part of the Traefik deployment. It is
# stopped only after the labelled container and public TLS route prove the same
# immutable revision.
if systemctl cat "$legacy_service" >/dev/null 2>&1; then
  systemctl disable --now "$legacy_service"
fi

printf '{"service":"aurion-traefik-runtime","revision":"%s","image":"%s","container":"%s","mode":"traefik-labelled"}\n' \
  "$expected_sha" "$runtime_image" "$container_id"
