#!/usr/bin/env node
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// A MariaDB --no-data dump includes the next row ID, which changes under DML.
// Keep every byte except that table-level counter. Column AUTO_INCREMENT,
// quoted values, comments, routines, engine, collation and constraints remain.
export function schemaDefinition(sql) {
  let i = 0, delimiter = ";", tokens = [];
  const removals = [];
  function finish() {
    if (tokens[0]?.text.toUpperCase() !== "CREATE" || tokens[1]?.text.toUpperCase() !== "TABLE") {
      tokens = []; return;
    }
    let depth = 0, body = false, closed = false;
    for (let n = 2; n < tokens.length; n++) {
      const t = tokens[n];
      if (t.kind === "symbol" && t.text === "(") { depth++; body = true; }
      if (t.kind === "symbol" && t.text === ")") { depth--; if (body && depth === 0) closed = true; }
      if (!closed || depth !== 0 || t.kind !== "word" || t.text !== "AUTO_INCREMENT") continue;
      const eq = tokens[n + 1], value = tokens[n + 2], after = tokens[n + 3];
      if (eq?.text !== "=" || value?.kind !== "word" || !/^[0-9]+$/.test(value.text)) continue;
      if (after && after.text !== ";" && after.kind !== "word") continue;
      const start = t.start - 1, end = value.end;
      // Only the exact output form of mariadb-dump is normalized. Ambiguous
      // SQL, comments between tokens and other forms remain comparison inputs.
      if (/^ AUTO_INCREMENT=[0-9]+$/.test(sql.slice(start, end))) removals.push([start, end]);
    }
    tokens = [];
  }
  while (i < sql.length) {
    // DELIMITER is a client directive, never recognized inside a quoted token.
    if (i === 0 || sql[i - 1] === "\n") {
      const directive = /^[\t ]*DELIMITER[\t ]+(\S+)[\t ]*(?:\r?\n|$)/.exec(sql.slice(i));
      if (directive) { delimiter = directive[1]; tokens = []; i += directive[0].length; continue; }
    }
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#" || (sql.startsWith("--", i) && /\s/.test(sql[i + 2] ?? ""))) {
      const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end; continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new Error("SCHEMA_COMMENT_UNTERMINATED");
      i = end + 2; continue;
    }
    const start = i;
    let kind = "symbol";
    if (c === "'" || c === '"' || c === "`") {
      kind = "quoted"; i++; let closed = false;
      while (i < sql.length) {
        if (sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === c) {
          if (sql[i + 1] === c) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw new Error("SCHEMA_QUOTE_UNTERMINATED");
    } else if (/[A-Za-z0-9_$]/.test(c)) {
      kind = "word";
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
    } else i++;
    if (delimiter !== ";") continue; // preserve complete routine/trigger bodies
    tokens.push({ kind, text: sql.slice(start, i), start, end: i });
    if (kind === "symbol" && c === ";") finish();
  }
  let result = "", previous = 0;
  for (const [start, end] of removals) { result += sql.slice(previous, start); previous = end; }
  return result + sql.slice(previous);
}

export const fingerprint = sql => createHash("sha256").update(schemaDefinition(sql)).digest("hex");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chunks = []; let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) throw new Error("SCHEMA_INPUT_LIMIT");
      chunks.push(chunk);
    }
    // No hash on empty input: the caller rejects it, while pipefail retains
    // an upstream dump timeout rather than masking it with our own exit code.
    if (bytes) process.stdout.write(fingerprint(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks))) + "\n");
  } catch {
    process.stderr.write("schema fingerprint unavailable\n"); process.exitCode = 70;
  }
}
