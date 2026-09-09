#!/usr/bin/env bash
set -euo pipefail

PACK_DIR="${1:-$(pwd)}"
TARGET_DIR="${2:-$(pwd)/aurion-offline-worktree}"
DB_CONTAINER="${AURION_LOCAL_MARIADB_CONTAINER:-aurion-local-mariadb}"
DB_PORT="${AURION_LOCAL_MARIADB_PORT:-3307}"
DB_PASSWORD="${AURION_LOCAL_MARIADB_PASSWORD:-aurion-local-test}"
DB_NAME="aurion_local_classless_test"

for required in manifest.json artifact.sha256 aurion-source.tar.zst node_modules.tar.zst mariadb-11.4-image.tar.zst schema.sql schema.sha256 schema-columns.tsv mariadb-version.txt; do
  test -f "$PACK_DIR/$required" || { echo "missing pack file: $required" >&2; exit 1; }
done
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v zstd >/dev/null || { echo "zstd is required" >&2; exit 1; }

# Verify every byte that will be restored or used as exact-revision evidence before
# extracting source/dependencies or loading the bundled database image.
(
  cd "$PACK_DIR"
  sha256sum -c artifact.sha256
  sha256sum -c schema.sha256
)

if [ -e "$TARGET_DIR" ] && [ -n "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  echo "offline worktree must be absent or empty: $TARGET_DIR" >&2
  exit 1
fi
mkdir -p "$TARGET_DIR"
tar --zstd -xf "$PACK_DIR/aurion-source.tar.zst" -C "$TARGET_DIR"
tar --zstd -xf "$PACK_DIR/node_modules.tar.zst" -C "$TARGET_DIR"

zstd -dc "$PACK_DIR/mariadb-11.4-image.tar.zst" | docker load >/dev/null
docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$DB_CONTAINER" \
  -e "MARIADB_ROOT_PASSWORD=$DB_PASSWORD" \
  -e "MARIADB_DATABASE=$DB_NAME" \
  -p "${DB_PORT}:3306" mariadb:11.4 >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$DB_CONTAINER" mariadb-admin ping -h 127.0.0.1 -uroot -p"$DB_PASSWORD" --silent >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs "$DB_CONTAINER" >&2
    exit 1
  fi
  sleep 1
done

docker exec -i "$DB_CONTAINER" mariadb -uroot -p"$DB_PASSWORD" "$DB_NAME" < "$PACK_DIR/schema.sql"

echo "Aurion offline worktree: $TARGET_DIR"
echo "MariaDB container: $DB_CONTAINER"
echo "DATABASE_URL=mysql://root:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"
echo "The database contains schema only; no production player/account rows are included."
