import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fingerprint, schemaDefinition } from "../deploy/aurion-schema-fingerprint.mjs";

const table = counter => `CREATE TABLE \`sample\` (\n  \`id\` bigint NOT NULL AUTO_INCREMENT,\n  \`note\` text DEFAULT ' AUTO_INCREMENT=10',\n  PRIMARY KEY (\`id\`)\n) ENGINE=InnoDB${counter ? ` AUTO_INCREMENT=${counter}` : ""} DEFAULT CHARSET=utf8mb4;\n`;
test("row counter advancement and first insert do not alter schema identity", () => {
  assert.equal(fingerprint(table(10)), fingerprint(table(42)));
  assert.equal(fingerprint(table(0)), fingerprint(table(42)));
  assert.match(schemaDefinition(table(42)), /bigint NOT NULL AUTO_INCREMENT/);
  assert.match(schemaDefinition(table(42)), /DEFAULT ' AUTO_INCREMENT=10'/);
});
test("DDL, column auto increment, literals and other table options still change identity", () => {
  for (const [before, after] of [["bigint", "int"], ["NOT NULL", "NULL"], ["PRIMARY KEY", "UNIQUE KEY"], ["InnoDB", "MyISAM"], ["utf8mb4", "latin1"], ["DEFAULT ' AUTO_INCREMENT=10'", "DEFAULT ' AUTO_INCREMENT=11'"], ["NOT NULL AUTO_INCREMENT", "NOT NULL"]]) {
    assert.notEqual(fingerprint(table(10)), fingerprint(table(10).replace(before, after)), before);
  }
});
test("quoted multi-line text and comments never become table options", () => {
  const sql = table(5).replace("' AUTO_INCREMENT=10'", "'x;\nCREATE TABLE evil (id int\n) ENGINE=InnoDB AUTO_INCREMENT=10;\nDELIMITER ;\n'") + "/* CREATE TABLE x (id int) ENGINE=InnoDB AUTO_INCREMENT=99; */\n";
  assert.ok(schemaDefinition(sql).includes("ENGINE=InnoDB AUTO_INCREMENT=10"));
  assert.ok(schemaDefinition(sql).includes("AUTO_INCREMENT=99"));
});
test("routine and trigger SQL remain byte-exact even when they create tables", () => {
  const routine = "DELIMITER ;;\nCREATE PROCEDURE p() BEGIN\n" + table(99) + "END;;\nDELIMITER ;\n";
  assert.equal(schemaDefinition(routine), routine);
  assert.equal(schemaDefinition(routine + table(5)), routine + table(0));
  assert.notEqual(fingerprint(routine), fingerprint(routine.replace("=99", "=100")));
});
test("malformed quotes/comments fail closed and unfamiliar option spelling is retained", () => {
  assert.throws(() => fingerprint("CREATE TABLE `broken"));
  assert.throws(() => fingerprint("/* broken"));
  const odd = table(10).replace(" AUTO_INCREMENT=10 DEFAULT", " AUTO_INCREMENT /*version*/ =10 DEFAULT");
  assert.equal(schemaDefinition(odd), odd);
});
test("CLI preserves UTF-8 bytes including BOM and never hashes invalid or empty input", () => {
  const cli = fileURLToPath(new URL("../deploy/aurion-schema-fingerprint.mjs", import.meta.url));
  const sql = "\uFEFF" + table(5);
  assert.equal(execFileSync(process.execPath, [cli], { input: sql, encoding: "utf8" }).trim(), fingerprint(sql));
  assert.equal(execFileSync(process.execPath, [cli], { input: "", encoding: "utf8" }), "");
  assert.throws(() => execFileSync(process.execPath, [cli], { input: Buffer.from([0xff]), stdio: ["pipe", "pipe", "pipe"] }));
});

// Runs only in the explicitly configured, isolated CI MariaDB container.
test("real MariaDB dump/restore stays stable across DML and rejects changed DDL", { skip: !process.env.AURION_FINGERPRINT_TEST_DB }, () => {
  const container = process.env.AURION_FINGERPRINT_TEST_DB;
  const password = process.env.AURION_APPLY_TEST_ROOT_PASSWORD;
  const run = (client, args, input) => execFileSync("docker", ["exec", "-i", "-e", `MYSQL_PWD=${password}`, container, client, "--protocol=socket", "-uroot", ...args], { input, encoding: "utf8", timeout: 30000 });
  const query = sql => run("mariadb", [], sql);
  const dump = extra => run("mariadb-dump", [...extra, "--single-transaction", "--skip-lock-tables", "--skip-comments", "--skip-dump-date", "--routines", "--events", "--triggers", "--databases", "fingerprint_proof"]);
  try {
    query("CREATE DATABASE fingerprint_proof; USE fingerprint_proof; CREATE TABLE item (id BIGINT AUTO_INCREMENT PRIMARY KEY, note TEXT); INSERT INTO item(note) VALUES ('before');");
    const backup = dump(["--add-drop-database"]), before = dump(["--no-data"]);
    query("INSERT INTO fingerprint_proof.item(note) VALUES ('after');");
    const after = dump(["--no-data"]);
    assert.notEqual(before, after, "real dump must expose DML counter drift (old gate RED)");
    assert.equal(fingerprint(before), fingerprint(after));
    query(backup);
    assert.equal(fingerprint(dump(["--no-data"])), fingerprint(before), "actual restore matches original definition");
    assert.equal(run("mariadb", ["--batch", "--skip-column-names", "-e", "SELECT COUNT(*) FROM fingerprint_proof.item"]).trim(), "1");
    query("ALTER TABLE fingerprint_proof.item ADD COLUMN changed INT;");
    assert.notEqual(fingerprint(dump(["--no-data"])), fingerprint(before));
  } finally { query("DROP DATABASE IF EXISTS fingerprint_proof;"); }
});
