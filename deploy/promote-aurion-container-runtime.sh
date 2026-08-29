#!/usr/bin/env bash
set -euo pipefail
unset NODE_OPTIONS

if [[ $# -ne 3 ]]; then
  echo "usage: promote-aurion-container-runtime <artifact-dir> <expected-sha40> <release-id>" >&2
  exit 64
fi

artifact_dir="$1"
expected_sha="$2"
release_id="$3"
image_archive="${artifact_dir}/aurion-full-runtime-image.tar.gz"
image_checksum="${artifact_dir}/aurion-full-runtime-image.tar.gz.sha256"
image_manifest="${artifact_dir}/aurion-full-runtime-image.json"
compose_source="${artifact_dir}/docker-compose.traefik.yml"
base=/opt/echoes-of-aurion
release="${base}/releases/${release_id}"
current="${base}/current"
env_file="${base}/.env.production"
public_network="${TRAEFIK_NETWORK:-areloria_arelorian-network}"
private_network="${AURION_PRIVATE_NETWORK:-echoes-of-aurion-internal}"
companion_memory_dir=/var/lib/echoes-of-aurion/companion-memory
project=echoes-of-aurion
service=aurion
container_name="${project}-${service}-1"

[[ "$expected_sha" =~ ^[a-f0-9]{40}$ ]]
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+$ ]]
[[ -f "$image_archive" && -f "$image_checksum" && -f "$image_manifest" && -f "$compose_source" ]]

cd "$artifact_dir"
sha256sum --strict -c "$(basename "$image_checksum")" >/dev/null

readarray -t image_identity < <(node --input-type=module - "$image_manifest" "$expected_sha" <<'NODE'
import fs from "node:fs";
const [manifestPath, expectedRevision] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.recordType !== "aurion_full_runtime_image") process.exit(2);
if (manifest.revision !== expectedRevision) process.exit(2);
if (manifest.imageReference !== `echoes-of-aurion:sha-${expectedRevision}`) process.exit(2);
if (!/^sha256:[a-f0-9]{64}$/.test(manifest.imageId)) process.exit(2);
console.log(manifest.imageReference);
console.log(manifest.imageId);
NODE
)
[[ "${#image_identity[@]}" -eq 2 ]]
image_ref="${image_identity[0]}"
expected_image_id="${image_identity[1]}"

# Discover the previous protected environment location without exposing values.
if [[ ! -f "$env_file" ]] && docker container inspect "$container_name" >/dev/null 2>&1; then
  previous_working_dir="$(docker container inspect --format='{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$container_name" 2>/dev/null || true)"
  if [[ -n "$previous_working_dir" && -f "${previous_working_dir}/.env.production" ]]; then
    install -d -o root -g root -m 0755 "$base"
    install -o root -g root -m 0600 "${previous_working_dir}/.env.production" "$env_file"
  fi
fi
[[ -f "$env_file" ]]
chown root:root "$env_file"
chmod 0600 "$env_file"
test "$(stat -c '%U:%G:%a' "$env_file")" = "root:root:600"

env_key_has_value() {
  node --input-type=module - "$env_file" "$1" <<'NODE'
import fs from "node:fs";
const [envFile, key] = process.argv.slice(2);
const source = fs.readFileSync(envFile, "utf8");
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=([\s\S]*)$/);
  if (!match || match[1] !== key) continue;
  let value = match[2].trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  if (quoted && value.length >= 2) value = value.slice(1, -1).trim();
  process.exit(value.length > 0 ? 0 : 1);
}
process.exit(1);
NODE
}

for required_name in DATABASE_URL JWT_SECRET VITE_APP_ID; do
  env_key_has_value "$required_name"
done
oidc_count=0
for oidc_name in OIDC_ISSUER_URL OIDC_CLIENT_ID OIDC_CLIENT_SECRET OIDC_REDIRECT_URI; do
  if env_key_has_value "$oidc_name"; then
    oidc_count=$((oidc_count + 1))
  fi
done
legacy_oauth=0
if env_key_has_value OAUTH_SERVER_URL; then
  legacy_oauth=1
fi
if [[ "$oidc_count" -eq 4 ]]; then
  auth_mode=oidc
elif [[ "$oidc_count" -eq 0 && "$legacy_oauth" -eq 1 ]]; then
  auth_mode=legacy_oauth
else
  echo "Aurion authentication configuration is incomplete" >&2
  exit 65
fi

docker network inspect "$public_network" >/dev/null
docker network inspect "$private_network" >/dev/null
install -d -o root -g root -m 0755 "${base}/releases"
install -d -o 1000 -g 1000 -m 0750 "$companion_memory_dir"
install -d -o root -g root -m 0755 "$release"
install -o root -g root -m 0644 "$compose_source" "${release}/docker-compose.traefik.yml"
install -o root -g root -m 0644 "$image_manifest" "${release}/aurion-full-runtime-image.json"

# Load only the exact, checksum-bound image produced on the trusted hosted runner.
gzip -dc "$image_archive" | docker load >/dev/null
actual_image_id="$(docker image inspect --format='{{.Id}}' "$image_ref")"
actual_revision="$(docker image inspect --format='{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")"
[[ "$actual_image_id" = "$expected_image_id" ]]
[[ "$actual_revision" = "$expected_sha" ]]

run_compose() {
  local image_tag="$1"
  local revision="$2"
  shift 2
  AURION_IMAGE_TAG="$image_tag" \
  AURION_RUNTIME_REVISION="$revision" \
  AURION_ENV_FILE="$env_file" \
  AURION_COMPANION_MEMORY_DIR="$companion_memory_dir" \
  TRAEFIK_NETWORK="$public_network" \
  AURION_PRIVATE_NETWORK="$private_network" \
  docker compose --project-name "$project" --env-file "$env_file" -f "${release}/docker-compose.traefik.yml" "$@"
}

image_tag="sha-${expected_sha}"
run_compose "$image_tag" "$expected_sha" config --quiet

# Prove application startup and private-network name resolution before touching the public service.
canary="aurion-canary-${expected_sha:0:12}"
docker rm -f "$canary" >/dev/null 2>&1 || true
docker run -d \
  --name "$canary" \
  --env-file "$env_file" \
  --network "$private_network" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e STRICT_PORT=true \
  -e TRUST_PROXY_HOPS=1 \
  -e AURION_RUNTIME_REVISION="$expected_sha" \
  -e COMPANION_MEMORY_DIR=/tmp/companion-memory \
  "$image_ref" >/dev/null

canary_ready=0
for _attempt in $(seq 1 30); do
  canary_health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$canary")"
  if [[ "$canary_health" = "healthy" ]]; then
    canary_ready=1
    break
  fi
  if [[ "$canary_health" = "unhealthy" || "$canary_health" = "exited" || "$canary_health" = "dead" ]]; then
    break
  fi
  sleep 2
done
docker rm -f "$canary" >/dev/null 2>&1 || true
[[ "$canary_ready" -eq 1 ]]

previous_image_id=""
previous_image_ref=""
previous_revision=""
rollback_tag=""
rollback_revision="0000000000000000000000000000000000000000"
if docker container inspect "$container_name" >/dev/null 2>&1; then
  previous_image_id="$(docker container inspect --format='{{.Image}}' "$container_name")"
  previous_image_ref="$(docker container inspect --format='{{.Config.Image}}' "$container_name")"
  previous_revision="$(docker image inspect --format='{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$previous_image_id" 2>/dev/null || true)"
  if [[ "$previous_revision" =~ ^[a-f0-9]{40}$ ]]; then
    rollback_revision="$previous_revision"
  fi
  if [[ "$previous_image_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    rollback_tag="rollback-${release_id}"
    docker image tag "$previous_image_id" "echoes-of-aurion:${rollback_tag}"
  fi
fi

rollback_public_service() {
  if [[ -n "$rollback_tag" ]]; then
    run_compose "$rollback_tag" "$rollback_revision" up -d --no-build --force-recreate "$service" >/dev/null 2>&1 || true
  fi
}

if ! run_compose "$image_tag" "$expected_sha" up -d --no-build --force-recreate "$service"; then
  rollback_public_service
  exit 70
fi

container_id="$(run_compose "$image_tag" "$expected_sha" ps -q "$service")"
[[ -n "$container_id" ]]
container_ready=0
for _attempt in $(seq 1 40); do
  container_health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  if [[ "$container_health" = "healthy" ]]; then
    container_ready=1
    break
  fi
  if [[ "$container_health" = "unhealthy" || "$container_health" = "exited" || "$container_health" = "dead" ]]; then
    break
  fi
  sleep 2
done
if [[ "$container_ready" -ne 1 ]]; then
  rollback_public_service
  exit 71
fi

container_image_id="$(docker container inspect --format='{{.Image}}' "$container_id")"
container_revision="$(docker container inspect --format='{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id")"
[[ "$container_image_id" = "$expected_image_id" ]]
[[ "$container_revision" = "$expected_sha" ]]
for required_network in "$public_network" "$private_network"; do
  docker container inspect --format='{{json .NetworkSettings.Networks}}' "$container_id" | grep -Fq "\"${required_network}\""
done

public_ready=0
public_health=""
for _attempt in $(seq 1 40); do
  if public_health="$(curl --fail --silent --show-error --max-time 10 https://arelogic.space/healthz 2>/dev/null)"; then
    if EXPECTED_SHA="$expected_sha" HEALTH_JSON="$public_health" node -e '
      const body=JSON.parse(process.env.HEALTH_JSON);
      if(body.ok!==true||body.status!=="ok"||body.service!=="echoes-of-aurion"||body.revision!==process.env.EXPECTED_SHA) process.exit(1);
    '; then
      public_ready=1
      break
    fi
  fi
  sleep 2
done
if [[ "$public_ready" -ne 1 ]]; then
  rollback_public_service
  exit 72
fi

# Publish the release pointer only after the exact public SHA is visible.
ln -sTfn "$release" "${base}/current.next"
mv -Tf "${base}/current.next" "$current"
test "$(readlink -f "$current")" = "$release"

# The mutable convenience tag is updated only after exact container and public readback succeed.
docker image tag "$image_ref" echoes-of-aurion:production
receipt="${release}/deployment-receipt.json"
EXPECTED_SHA="$expected_sha" IMAGE_ID="$expected_image_id" PREVIOUS_IMAGE_ID="$previous_image_id" PREVIOUS_IMAGE_REF="$previous_image_ref" PREVIOUS_REVISION="$previous_revision" PUBLIC_NETWORK="$public_network" PRIVATE_NETWORK="$private_network" AUTH_MODE="$auth_mode" RECEIPT="$receipt" node -e '
  const fs=require("node:fs");
  const receipt={
    schemaVersion:1,
    recordType:"aurion_full_container_deployment",
    revision:process.env.EXPECTED_SHA,
    imageId:process.env.IMAGE_ID,
    previousImageId:process.env.PREVIOUS_IMAGE_ID||null,
    previousImageReference:process.env.PREVIOUS_IMAGE_REF||null,
    previousRevision:process.env.PREVIOUS_REVISION||null,
    networks:[process.env.PUBLIC_NETWORK,process.env.PRIVATE_NETWORK],
    authMode:process.env.AUTH_MODE,
    publicHealth:true,
    databaseMutationPerformed:false,
    secretValuesReturned:false,
  };
  fs.writeFileSync(process.env.RECEIPT,JSON.stringify(receipt,null,2)+"\n",{mode:0o644});
'
cat "$receipt"
