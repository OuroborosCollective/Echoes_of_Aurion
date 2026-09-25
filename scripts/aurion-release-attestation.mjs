const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^sha256:[a-f0-9]{64}$/;
const secretPatterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
];
function rejectSecrets(value,path="$"){
  if(typeof value==="string"){
    if(secretPatterns.some(pattern=>pattern.test(value))) throw new Error(`RELEASE_IDENTITY_SECRET_VALUE:${path}`);
    return;
  }
  if(Array.isArray(value)){value.forEach((item,index)=>rejectSecrets(item,`${path}[${index}]`));return;}
  if(value&&typeof value==="object"){
    for(const [key,item] of Object.entries(value)){
      if(/(?:secret|password|private[_-]?key|access[_-]?token|refresh[_-]?token)$/i.test(key)&&item) throw new Error(`RELEASE_IDENTITY_SECRET_KEY:${path}.${key}`);
      rejectSecrets(item,`${path}.${key}`);
    }
  }
}
function requiredDigest(value,name){if(!SHA256.test(value??"")) throw new Error(`RELEASE_IDENTITY_${name}_INVALID`);return value;}
function requiredRevision(value){if(!SHA40.test(value??"")) throw new Error("RELEASE_IDENTITY_REVISION_INVALID");return value;}

export function buildArtifactAttestationPredicate(input){
  const predicate={
    schemaVersion:"aurion.release-artifact-attestation.v1",
    sourceRevision:requiredRevision(input.sourceRevision),
    buildInputDigest:requiredDigest(input.buildInputDigest,"BUILD_INPUT_DIGEST"),
    artifactDigest:requiredDigest(input.artifactDigest,"ARTIFACT_DIGEST"),
    releaseArchiveDigest:requiredDigest(input.releaseArchiveDigest,"RELEASE_ARCHIVE_DIGEST"),
    secretScanReceiptDigest:requiredDigest(input.secretScanReceiptDigest,"SECRET_SCAN_RECEIPT_DIGEST"),
    sbomDigest:requiredDigest(input.sbomDigest,"SBOM_DIGEST"),
    secretValuesReturned:input.secretValuesReturned,
    artifactName:"aurion-traefik-runtime-release.tgz",
    workflow:input.workflow,
    workflowRunId:String(input.workflowRunId??""),
  };
  if(predicate.secretValuesReturned!==false) throw new Error("RELEASE_IDENTITY_SECRET_SCAN_NOT_CLEAN");
    if(typeof predicate.workflow!=="string"||!predicate.workflow.trim()) throw new Error("RELEASE_IDENTITY_WORKFLOW_INVALID");
  if(!/^[1-9][0-9]*$/.test(predicate.workflowRunId)) throw new Error("RELEASE_IDENTITY_RUN_ID_INVALID");
  rejectSecrets(predicate);
  return Object.freeze(predicate);
}

export function buildRuntimeReleaseIdentity(input){
  const identity={
    schemaVersion:"aurion.runtime-release-identity.v1",
    sourceRevision:requiredRevision(input.sourceRevision),
    mergeSha:requiredRevision(input.mergeSha),
    releaseId:input.releaseId,
    buildInputDigest:requiredDigest(input.buildInputDigest,"BUILD_INPUT_DIGEST"),
    artifactDigest:requiredDigest(input.artifactDigest,"ARTIFACT_DIGEST"),
    runtimeImageDigest:requiredDigest(input.runtimeImageDigest,"RUNTIME_IMAGE_DIGEST"),
    releaseArchiveDigest:requiredDigest(input.releaseArchiveDigest,"RELEASE_ARCHIVE_DIGEST"),
    containerId:input.containerId,
    artifactAttestationId:String(input.artifactAttestationId??""),
    artifactAttestationUrl:input.artifactAttestationUrl,
  };
  if(identity.mergeSha!==identity.sourceRevision) throw new Error("RELEASE_IDENTITY_MERGE_SHA_MISMATCH");
  if(typeof identity.releaseId!=="string"||!new RegExp(`^${identity.sourceRevision}-[1-9][0-9]*$`).test(identity.releaseId)) throw new Error("RELEASE_IDENTITY_RELEASE_ID_INVALID");
  if(typeof identity.containerId!=="string"||!/^[a-f0-9]{64}$/.test(identity.containerId)) throw new Error("RELEASE_IDENTITY_CONTAINER_ID_INVALID");
  if(!/^[1-9][0-9]*$/.test(identity.artifactAttestationId)) throw new Error("RELEASE_IDENTITY_ATTESTATION_ID_INVALID");
  if(typeof identity.artifactAttestationUrl!=="string"||!/^https:\/\/github\.com\//.test(identity.artifactAttestationUrl)) throw new Error("RELEASE_IDENTITY_ATTESTATION_URL_INVALID");
  rejectSecrets(identity);
  return Object.freeze(identity);
}

export function scanReleaseMetadataForSecrets(value){rejectSecrets(value);return true;}
