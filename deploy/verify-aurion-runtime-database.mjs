// Bounded runtime readback: prove that the deployed application container can
// resolve, authenticate to, and execute one read-only statement against the
// canonical private MariaDB service. Never print the connection URL or errors.
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

if (!databaseUrl) {
  process.exit(20);
}

let target;
try {
  target = new URL(databaseUrl);
} catch {
  process.exit(21);
}

const targetPort = Number(target.port || "3306");
if (
  target.protocol !== "mysql:" ||
  target.hostname !== "mariadb" ||
  targetPort !== 3306 ||
  !target.username ||
  !target.password ||
  target.pathname.length <= 1
) {
  process.exit(21);
}

let mysql;
try {
  mysql = await import("mysql2/promise");
} catch {
  process.exit(24);
}

let connection;
try {
  connection = await mysql.createConnection(databaseUrl);
} catch {
  process.exit(22);
}

try {
  const [rows] = await connection.query(
    "SELECT 1 AS aurion_runtime_database_readback"
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0]?.aurion_runtime_database_readback !== 1
  ) {
    process.exitCode = 23;
  }
} catch {
  process.exitCode = 23;
} finally {
  try {
    await connection.end();
  } catch {
    process.exitCode ||= 22;
  }
}

// The GLB volume must be writable by the actual unprivileged runtime identity.
// Probe bytes are removed; no user asset, approval or assignment is created.
if (!process.exitCode) {
  let probe;
  try {
    const fs = await import("node:fs/promises");
    const { randomUUID } = await import("node:crypto");
    if (process.env.AURION_GLB_STORAGE_DIR !== "/var/lib/aurion/glb") throw new Error("GLB volume configuration missing");
    probe = `/var/lib/aurion/glb/.deployment-probe-${randomUUID()}`;
    const handle = await fs.open(probe, "wx", 0o600);
    try { await handle.writeFile("aurion-glb-volume-readback"); await handle.sync(); }
    finally { await handle.close(); }
    if (await fs.readFile(probe, "utf8") !== "aurion-glb-volume-readback") throw new Error("GLB volume readback failed");
  } catch { process.exitCode = 25; }
  finally {
    if (probe) {
      const fs = await import("node:fs/promises");
      await fs.unlink(probe).catch(() => { process.exitCode = 25; });
    }
  }
}
