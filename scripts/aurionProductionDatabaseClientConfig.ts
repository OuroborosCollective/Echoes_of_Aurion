import { readFile } from "node:fs/promises";

function fail(): never {
  throw new Error("DATABASE_CLIENT_CONFIGURATION_INVALID");
}

function parseEnvironmentValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1);
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\([\\"nrt])/g, (_match, escaped: string) => {
      if (escaped === "n") return "\n";
      if (escaped === "r") return "\r";
      if (escaped === "t") return "\t";
      return escaped;
    });
  }
  return value;
}

async function databaseUrlFromEnvironmentFile(envFile: string): Promise<string> {
  const source = await readFile(envFile, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=([\s\S]*)$/);
    if (!match) continue;
    const value = parseEnvironmentValue(match[1]);
    if (!value || /[\r\n\0]/.test(value)) fail();
    return value;
  }
  fail();
}

function quotedOption(value: string): string {
  if (!value || /[\r\n\0]/.test(value)) fail();
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function main(): Promise<void> {
  if (process.argv.length !== 5 || process.argv[2] !== "--env-file") fail();
  const envFile = process.argv[3];
  const output = process.argv[4];
  if (!envFile || !["--my-cnf", "--database-name"].includes(output)) fail();
  const value = await databaseUrlFromEnvironmentFile(envFile);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail();
  }
  if (url.protocol !== "mysql:" || !url.hostname || !url.username || !url.pathname || url.pathname === "/") fail();
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_$]+$/.test(database)) fail();
  if (output === "--database-name") {
    process.stdout.write(database);
    return;
  }

  const port = url.port ? Number(url.port) : 3306;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail();
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (/[^A-Za-z0-9_.:-]/.test(url.hostname)) fail();
  process.stdout.write([
    "[client]",
    `host=${quotedOption(url.hostname)}`,
    `port=${port}`,
    `user=${quotedOption(username)}`,
    `password=${quotedOption(password)}`,
    `database=${quotedOption(database)}`,
    "",
  ].join("\n"));
}

main().catch(() => {
  process.exitCode = 2;
});
