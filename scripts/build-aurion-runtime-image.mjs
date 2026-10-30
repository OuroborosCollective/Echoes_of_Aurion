import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

/** Build only on a hosted Actions runner. The VPS receives the saved image. */
export async function buildAurionRuntimeImage(directory, revision) {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("RUNTIME_IMAGE_REQUIRES_HOSTED_ACTIONS");
  }
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("RUNTIME_IMAGE_REVISION_INVALID");
  const tag = `echoes-of-aurion:${revision}`;
  // A derived compatibility archive must not send its old image as build context.
  await rm(path.join(directory, "runtime-image.tar"), { force: true });
  execFileSync("docker", ["build", "--pull=false", "--platform=linux/amd64", "--build-arg", `AURION_RELEASE_SHA=${revision}`, "--tag", tag, directory], { stdio: "inherit" });
  const [image] = JSON.parse(execFileSync("docker", ["image", "inspect", tag], { encoding: "utf8" }));
  if (!/^sha256:[a-f0-9]{64}$/.test(image?.Id ?? "") || image.Os !== "linux" || image.Architecture !== "amd64"
      || image.Config?.Labels?.["org.opencontainers.image.revision"] !== revision || image.Config?.User !== "node") {
    throw new Error("RUNTIME_IMAGE_IDENTITY_INVALID");
  }
  const build = JSON.parse(await readFile(path.join(directory, "dist/.aurion-runtime-build.json"), "utf8"));
  if (build.revision !== revision) throw new Error("RUNTIME_IMAGE_BUILD_IDENTITY_MISMATCH");
  execFileSync("docker", ["image", "save", "--output", path.join(directory, "runtime-image.tar"), tag], { stdio: "inherit" });
  return { schema: "aurion.hosted-runtime-image.v1", sourceRevision: revision, archive: "runtime-image.tar", id: image.Id, platform: "linux/amd64", builtBy: "github-hosted-actions" };
}
