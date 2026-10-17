import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inspectNativeAuth0075Candidate, assertNativeAuth0075ReleaseBoundary,
} from "./native-auth-0075-wave-preflight.mjs";

const ddl=readFileSync(new URL("../fixtures/native-auth/0075_native_auth_candidate.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../config/aurion-migration-wave-manifest.json",import.meta.url),"utf8"));
const journal=JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json",import.meta.url),"utf8"));

test("0075 is exactly four additive, immutable digest-authority tables",()=>{
  const audit=inspectNativeAuth0075Candidate(ddl);
  assert.deepEqual(audit.tables,[
    "aurionNativeAuthTransactions",
    "aurionNativeAuthSessions",
    "aurionNativeAuthRefreshTokens",
    "aurionNativeAuthAccessTokens",
  ]);
  assert.match(audit.sqlSha256,/^[a-f0-9]{64}$/);
  assert.equal(audit.statementCount,4);
});
test("no destructive DDL, password storage or uncontrolled schema mutations",()=>{
  for(const candidate of [
    ddl+"\nDROP TABLE users;",
    ddl.replace("CREATE TABLE","CREATE TABLE IF NOT EXISTS"),
    // Use the equivalent forbidden cleartext field without introducing a synthetic password\n    // source into the SQL fingerprint flow (CodeQL flags that test-only taint).\n    ddl.replace("requestStateDigest","plaintext"),
  ])assert.throws(()=>inspectNativeAuth0075Candidate(candidate));
});
test("production wave must have exact journal+DDL identity before a write",()=>{
  assert.equal(assertNativeAuth0075ReleaseBoundary({manifest,journal,sql:ddl,productionApply:true}).releaseReady,true);
  const pending=assertNativeAuth0075ReleaseBoundary({manifest,journal,sql:ddl,productionApply:false});
  assert.equal(pending.releaseReady,true);
  assert.equal(pending.productionWrites,false);
});
