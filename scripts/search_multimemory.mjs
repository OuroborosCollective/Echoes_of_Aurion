import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const targetDtsSha = "2e4c05121d89f31f465eafc3a4281537fd13176fd0bc8c503684a2fb9d2655f8";
const targetSourceSha = "525dc371152c04ed8a220b5df469089a774c629a06c2458e9db0a1cf293bb1fd";

console.log("targetDtsSha:", targetDtsSha);
console.log("targetSourceSha:", targetSourceSha);
