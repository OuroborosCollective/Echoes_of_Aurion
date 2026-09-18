import { spawnSync } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const forbiddenPathPatterns = [
  /(^|\/)\.env(?:$|\.)/i,
  /(^|\/)(?:id_rsa|id_ed25519|credentials|credentials\.json|service-account\.json)$/i,
  /(^|\/).*private[-_.]?key(?:\.|$)/i,
  /(^|\/).*\.pem$/i,
  /(^|\/).*\.p12$/i,
  /(^|\/).*\.pfx$/i,
];
const secretPatterns = [
  { kind: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { kind: "github_pat", pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { kind: "github_token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { kind: "openai_key", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { kind: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/ },
];
const textExtensions = new Set([
  ".js", ".mjs", ".cjs", ".json", ".html", ".css", ".txt", ".md", ".sh",
  ".py", ".conf", ".template", ".yml", ".yaml", ".toml", ".xml", ".sql",
]);

function safeRelative(relative) {
  return !path.isAbsolute(relative) && !relative.split(/[\\/]+/).includes("..");
}
function forbiddenPath(relative) {
  return forbiddenPathPatterns.some(pattern => pattern.test(relative.replaceAll("\\", "/")));
}
function listArchiveEntries(file) {
  const result=spawnSync("tar",["-tzf",file],{
    encoding:"utf8",
    maxBuffer:128*1024*1024,
  });
  if(result.error) {
    throw new Error(`RELEASE_SECRET_SCAN_ARCHIVE_READ_FAILED:${path.basename(file)}:${result.error.code ?? result.error.message}`);
  }
  if(result.status!==0) {
    throw new Error(`RELEASE_SECRET_SCAN_ARCHIVE_READ_FAILED:${path.basename(file)}:exit_${result.status}`);
  }
  return result.stdout.split("\n").map(item=>item.trim()).filter(Boolean);
}

export async function scanReleaseSecrets({ root, output }) {
  const base=path.resolve(root);
  const findings=[];
  let scannedTextFiles=0;
  let scannedArchives=0;
  const files=[];

  async function walk(directory, relative="") {
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const rel=path.posix.join(relative,entry.name);
      const absolute=path.join(directory,entry.name);
      if(entry.isDirectory()){await walk(absolute,rel);continue;}
      if(!entry.isFile()) throw new Error(`RELEASE_SECRET_SCAN_NON_FILE:${rel}`);
      files.push({rel,absolute});
    }
  }
  await walk(base);

  for(const {rel,absolute} of files.sort((a,b)=>a.rel.localeCompare(b.rel))){
    if(!safeRelative(rel)) findings.push({kind:"unsafe_path",path:rel});
    if(forbiddenPath(rel)) findings.push({kind:"forbidden_secret_path",path:rel});

    if(rel.endsWith(".tgz")||rel.endsWith(".tar.gz")){
      scannedArchives+=1;
      for(const entry of listArchiveEntries(absolute)){
        if(!safeRelative(entry)) findings.push({kind:"unsafe_archive_path",path:`${rel}:${entry}`});
        if(forbiddenPath(entry)) findings.push({kind:"forbidden_archive_secret_path",path:`${rel}:${entry}`});
      }
      continue;
    }

    const metadata=await stat(absolute);
    const ext=path.extname(rel).toLowerCase();
    const textCandidate=textExtensions.has(ext)||!ext;
    if(!textCandidate||metadata.size>2_000_000) continue;
    const raw=await readFile(absolute,"utf8");
    scannedTextFiles+=1;
    for(const {kind,pattern} of secretPatterns){
      if(pattern.test(raw)) findings.push({kind,path:rel});
    }
  }

  const receipt={
    schemaVersion:"aurion.release-secret-scan.v1",
    recordType:"aurion_release_secret_scan",
    root:path.basename(base),
    scannedFiles:files.length,
    scannedTextFiles,
    scannedArchives,
    forbiddenPathPatternCount:forbiddenPathPatterns.length,
    secretPatternCount:secretPatterns.length,
    secretValuesReturned:false,
    findings,
    status:findings.length===0?"PASS":"FAIL",
  };
  if(output) await writeFile(output,JSON.stringify(receipt,null,2)+"\n","utf8");
  if(findings.length) throw new Error(`AURION_RELEASE_SECRET_SCAN_FAILED:${findings.map(item=>item.kind+":"+item.path).join(",")}`);
  return receipt;
}

async function main(){
  const [, , root, output]=process.argv;
  if(!root||!output){console.error("usage: node scripts/scan-aurion-release-secrets.mjs <root> <receipt.json>");process.exit(64);}
  await scanReleaseSecrets({root,output});
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch(error=>{console.error(error);process.exit(1);});
