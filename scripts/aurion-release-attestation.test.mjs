import assert from "node:assert/strict";
import test from "node:test";
import { buildArtifactAttestationPredicate, buildRuntimeReleaseIdentity, scanReleaseMetadataForSecrets } from "./aurion-release-attestation.mjs";

const sha="a".repeat(40);
const digest=`sha256:${"b".repeat(64)}`;

test("artifact predicate binds revision and canonical digests",()=>{
  const predicate=buildArtifactAttestationPredicate({
    sourceRevision:sha,
    buildInputDigest:digest,
    artifactDigest:digest,
    releaseArchiveDigest:digest,
    secretScanReceiptDigest:digest,
    sbomDigest:digest,
    secretValuesReturned:false,
    workflow:".github/workflows/deploy-aurion-zone-runtime.yml",
    workflowRunId:"123",
  });
  assert.equal(predicate.sourceRevision,sha);
  assert.equal(predicate.buildInputDigest,digest);
  assert.equal(predicate.artifactName,"aurion-traefik-runtime-release.tgz");
  assert.equal(predicate.secretValuesReturned,false);
  assert.equal(predicate.secretScanReceiptDigest,digest);
  assert.equal(predicate.sbomDigest,digest);
});

test("runtime identity binds inspected image to exact merge and artifact attestation",()=>{
  const identity=buildRuntimeReleaseIdentity({
    sourceRevision:sha,
    mergeSha:sha,
    releaseId:`${sha}-123`,
    buildInputDigest:digest,
    artifactDigest:digest,
    runtimeImageDigest:digest,
    releaseArchiveDigest:digest,
    containerId:"c".repeat(64),
    artifactAttestationId:"456",
    artifactAttestationUrl:"https://github.com/OuroborosCollective/Echoes_of_Aurion/attestations/456",
  });
  assert.equal(identity.runtimeImageDigest,digest);
  assert.equal(identity.mergeSha,sha);
});

test("invalid digest or stale merge identity fails closed",()=>{
  assert.throws(()=>buildArtifactAttestationPredicate({
    sourceRevision:sha,buildInputDigest:"unknown",artifactDigest:digest,releaseArchiveDigest:digest,secretScanReceiptDigest:digest,sbomDigest:digest,secretValuesReturned:false,workflow:"w",workflowRunId:"1"
  }),/BUILD_INPUT_DIGEST_INVALID/);
  assert.throws(()=>buildRuntimeReleaseIdentity({
    sourceRevision:sha,mergeSha:"c".repeat(40),releaseId:`${sha}-1`,buildInputDigest:digest,artifactDigest:digest,runtimeImageDigest:digest,releaseArchiveDigest:digest,containerId:"c".repeat(64),artifactAttestationId:"1",artifactAttestationUrl:"https://github.com/x/y/attestations/1"
  }),/MERGE_SHA_MISMATCH/);
});

test("secret-like metadata is rejected before signing",()=>{
  assert.throws(()=>scanReleaseMetadataForSecrets({accessToken:"github_pat_abcdefghijklmnopqrstuvwxyz123456"}),/SECRET/);
  assert.throws(()=>buildArtifactAttestationPredicate({
    sourceRevision:sha,buildInputDigest:digest,artifactDigest:digest,releaseArchiveDigest:digest,secretScanReceiptDigest:digest,secretValuesReturned:false,workflow:"sk-abcdefghijklmnopqrstuvwxyz12345",workflowRunId:"1"
  }),/SECRET/);
});

test("SBOM digest is mandatory and must be a SHA-256 identity",()=> {
  assert.throws(()=>buildArtifactAttestationPredicate({
    sourceRevision:sha,
    buildInputDigest:digest,
    artifactDigest:digest,
    releaseArchiveDigest:digest,
    secretScanReceiptDigest:digest,
    sbomDigest:"unknown",
    secretValuesReturned:false,
    workflow:"w",
    workflowRunId:"1",
  }),/SBOM_DIGEST_INVALID/);
});

test("production release workflow contains only immutable external action pins",async()=>{
  const fs=(await import("node:fs")).default;
  const workflow=fs.readFileSync(".github/workflows/deploy-aurion-zone-runtime.yml","utf8");
  for(const line of workflow.split("\n")){
    const match=line.match(/uses:\s+([^\s]+)/);
    if(!match) continue;
    const ref=match[1];
    if(ref.startsWith("./")) continue;
    assert.match(ref,/^[^@\s]+@[a-f0-9]{40}$/,"un-pinned external action: "+ref);
  }
});
