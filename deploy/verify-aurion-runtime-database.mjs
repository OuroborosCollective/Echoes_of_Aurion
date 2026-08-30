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
