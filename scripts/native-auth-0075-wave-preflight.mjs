import { createHash } from "node:crypto";

export const NATIVE_AUTH_0075_TAG = "0075_aurion_native_auth_sessions";
export const NATIVE_AUTH_0075_TABLES = Object.freeze([
  "aurionNativeAuthTransactions",
  "aurionNativeAuthSessions",
  "aurionNativeAuthRefreshTokens",
  "aurionNativeAuthAccessTokens",
]);

const fail=()=>{throw new Error("NATIVE_AUTH_0075_WAVE_NOT_READY");};
const hash=value=>createHash("sha256").update(value,"utf8").digest("hex");

/** Pure fail-closed DDL inventory. No database connection or writes. */
export function inspectNativeAuth0075Candidate(sql){
  if(typeof sql!=="string" || !sql.endsWith("\n")) fail();
  const parts=sql.trim().split("--> statement-breakpoint").map(x=>x.trim());
  if(parts.length!==NATIVE_AUTH_0075_TABLES.length) fail();
  for(const [i,stmt] of parts.entries()){
    if(!stmt.startsWith("CREATE TABLE `"+NATIVE_AUTH_0075_TABLES[i]+"` (") ||
       !stmt.endsWith(");") ||
       /\b(?:DROP|ALTER|DELETE|UPDATE|INSERT|TRUNCATE|REPLACE|GRANT|REVOKE|CREATE\s+TRIGGER|IF\s+NOT\s+EXISTS)\b/i.test(stmt) ||
       /(?:--(?!> statement-breakpoint)|\/\*|#)/.test(stmt))fail();
  }
  const joined=parts.join("\n");
  if(!joined.includes("`requestStateDigest` varchar(64) NOT NULL") ||
     !joined.includes("`requestStateSealed` varchar(256) NOT NULL") ||
     !joined.includes("`handoffCodeDigest` varchar(64) NULL") ||
     !joined.includes("`tokenDigest` varchar(64) NOT NULL PRIMARY KEY") ||
     !joined.includes("UNIQUE KEY `aurionNativeAuthTransactions_handoff_uq`") ||
     /\b(?:password|plaintext|jwtSecret)\b/i.test(joined))fail();
  return Object.freeze({tag:NATIVE_AUTH_0075_TAG,statementCount:parts.length,
    tables:[...NATIVE_AUTH_0075_TABLES],sqlSha256:hash(sql)});
}

/**
 * Before any production schema action require the exact 0075 journal tail and
 * a NEW owner-approved wave contract. Current 0074 wave remains blocked.
 * This check never interprets human approval as a DB backup/restore receipt.
 */
export function assertNativeAuth0075ReleaseBoundary({manifest,journal,sql,productionApply=false}){
  const ddl=inspectNativeAuth0075Candidate(sql);
  const entries=journal?.entries;
  const migrations=manifest?.migrations;
  const ready=Array.isArray(entries)&&Array.isArray(migrations)&&
    entries.at(-1)?.tag===ddl.tag &&
    entries.at(-1)?.idx===74 &&
    migrations.at(-1)?.tag===ddl.tag &&
    manifest?.waveId==="aurion-production-0075-native-auth" &&
    manifest?.policy?.ownerApprovalRequired===true &&
    manifest?.policy?.futureTagsRequireNewManifest===true &&
    manifest?.policy?.productionWritesScheduled===false &&
    typeof entries.at(-1)?.when==="number" &&
    entries.at(-1).when>entries.at(-2).when;
  if(productionApply && !ready)fail();
  return Object.freeze({tag:ddl.tag,sqlSha256:ddl.sqlSha256,
    releaseReady:Boolean(ready),productionWrites:false});
}
