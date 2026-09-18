import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanReleaseSecrets } from "./scan-aurion-release-secrets.mjs";

test("release secret scan accepts ordinary runtime text", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"aurion-secret-scan-pass-"));
  await mkdir(path.join(root,"deploy"),{recursive:true});
  await writeFile(path.join(root,"deploy","runtime.template"),"AURION_DOMAIN=arelogic.space\n");
  const receipt=await scanReleaseSecrets({root});
  assert.equal(receipt.status,"PASS");
  assert.equal(receipt.secretValuesReturned,false);
  assert.equal(receipt.findings.length,0);
});

test("release secret scan rejects private-key and token values", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"aurion-secret-scan-fail-"));
  await writeFile(path.join(root,"bad.txt"),"github_pat_abcdefghijklmnopqrstuvwxyz1234567890");
  await assert.rejects(scanReleaseSecrets({root}),/AURION_RELEASE_SECRET_SCAN_FAILED/);
});

test("release secret scan rejects secret-like file names", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"aurion-secret-scan-path-"));
  await writeFile(path.join(root,".env.production"),"PLACEHOLDER=true\n");
  await assert.rejects(scanReleaseSecrets({root}),/forbidden_secret_path/);
});
