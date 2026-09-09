# Aurion local test pack

`Aurion Local Test Pack` creates an exact-revision, offline-friendly test workspace for repository and MariaDB regression work.

The artifact is deliberately **not** a production database backup. It contains no player rows, account rows, credentials, environment files, or production secrets. Its database copy is schema-only and is created by applying the repository's complete Drizzle migration chain to a disposable `mariadb:11.4` service.

The pack contains:

- `aurion-source.tar.zst`: exact Git source tree for the tested commit;
- `node_modules.tar.zst`: the frozen-lockfile dependency tree used by CI;
- `mariadb-11.4-image.tar.zst`: the exact local container image pulled by CI;
- `schema.sql`: schema-only dump after all migrations executed successfully;
- `schema-columns.tsv`: table/column/type/nullability inventory read from MariaDB;
- migration/type/test logs and SHA-256 manifests;
- `bootstrap-aurion-local-test-pack.sh`: verifies the archived source, dependencies, manifest, MariaDB image and schema before restoring them, then imports the schema into `aurion_local_classless_test`.

## Restore

With Docker and `zstd` installed:

```bash
./bootstrap-aurion-local-test-pack.sh /path/to/unpacked-artifact /path/to/aurion-offline-worktree
```

The target worktree must be absent or empty; the bootstrap refuses to mix a new exact-revision archive with stale files from an older restore. The script prints a `DATABASE_URL` using port `3307` by default. Override the port with `AURION_LOCAL_MARIADB_PORT`. The restored database name ends in `_classless_test`, matching the fail-closed MariaDB regression guard, and contains no production data.

`artifact.sha256` is checked before any source/dependency extraction or database-image load, and `schema.sha256` is checked before schema import. The manifest binds source SHA, MariaDB version/image ID, dependency lock hash and schema hash so a later test can prove which repository/database state it exercised.
