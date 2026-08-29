import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion labelled Traefik runtime deployment", () => {
  const dockerfile = read("Dockerfile");
  const compose = read("docker-compose.traefik.yml");
  const promoter = read("deploy/promote-aurion-zone-runtime.sh");
  const workflow = read(".github/workflows/deploy-aurion-zone-runtime.yml");
  const artifactBuilder = read("scripts/build-aurion-traefik-runtime-artifact.mjs");

  it("binds the public health response and image metadata to one source revision", () => {
    expect(dockerfile).toContain("node:22.13.0-bookworm-slim@sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff");
    expect(dockerfile).toContain("AURION_RELEASE_SHA=${AURION_RELEASE_SHA}");
    expect(dockerfile).toContain("org.opencontainers.image.revision=${AURION_RELEASE_SHA}");
    expect(artifactBuilder).toContain('recordType: "aurion_traefik_runtime_artifact"');
    expect(artifactBuilder).toContain('const directoriesToCopy = ["dist", "patches"]');
    expect(workflow).toContain("https://arelogic.space/healthz");
    expect(workflow).toContain('health.revision!==process.argv[1]');
  });

  it("uses Traefik labels and a root-managed secret environment file", () => {
    expect(compose).toContain("${AURION_ENV_FILE:?AURION_ENV_FILE must point to the root-managed production environment}");
    expect(compose).toContain("traefik.enable=true");
    expect(compose).toContain("traefik.docker.network=${TRAEFIK_NETWORK:-areloria_arelorian-network}");
    expect(compose).toContain("traefik.http.routers.aurion.rule=Host(`${AURION_DOMAIN:-arelogic.space}`)");
    expect(compose).toContain("traefik.http.services.aurion.loadbalancer.server.port=3000");
    expect(compose).toContain("org.opencontainers.image.revision=${AURION_RELEASE_SHA:?AURION_RELEASE_SHA must match the verified image revision}");
  });

  it("allows the existing fixed root entrypoint to bootstrap only a byte-identical Traefik promoter", () => {
    expect(workflow).toContain('cmp -s "${artifact}/deploy/promote-aurion-zone-runtime.sh" "$installed"');
    expect(workflow).toContain("Bootstrap and promote labelled Traefik container");
    expect(workflow).not.toContain("sudo docker");
    expect(promoter).toContain("docker compose --project-name echoes-of-aurion");
    expect(promoter).toContain("docker build --pull=false");
    expect(promoter).toContain("traefik.enable");
    expect(promoter).toContain("traefik.docker.network");
    expect(promoter).toContain("traefik.http.services.aurion.loadbalancer.server.port");
    expect(promoter).toContain("^[A-Za-z0-9@._/:-]+$");
    expect(promoter).toContain("aurion-traefik-promoter failed phase=");
    expect(promoter).toContain('image_id="$(docker image inspect --format \'{{.Id}}\' "$pinned_image")"');
    expect(promoter).not.toContain("{{range .RepoDigests}}");
    expect(workflow).toContain("one-time promoter bootstrap artifact");
    expect(workflow).toContain("runtime-bootstrap-artifact");
    expect(workflow).toContain('bootstrap_release_id="${bootstrap_expected_sha}-0"');
    expect(workflow).toContain("bootstrap-identity.json.sha256");
    expect(workflow).toContain("bootstrap runtime archive contains a legacy-incompatible path");
    expect(workflow).toContain("./patches/wouter-3.7.1.patch");
    expect(workflow).toContain("legacy_promoter_sha256=4e0a5f6d8829397923a37edaf36d52b0c0fc479e0e9b7e55e5c44f8366de69ad");
    expect(workflow).toContain("refusing to invoke an unrecognized promoter");
    expect(workflow).toContain("promoter_needs_readback_replay=0");
    expect(workflow).toContain('if [[ "$promoter_needs_readback_replay" -eq 1 ]]; then');
    expect(promoter).toContain("# aurion-traefik-promoter-protocol: 2");
    expect(promoter).toContain("public_readback_dir=/var/lib/aurion-traefik-runtime-readback");
    expect(promoter).toContain('"recordType":"aurion_traefik_runtime_readback"');
    expect(promoter).toContain('chmod 0644 "$public_readback_tmp"');
    expect(workflow).toContain("/var/lib/aurion-traefik-runtime-readback/current.json");
    expect(workflow).not.toContain("test -L /opt/aurion-traefik-runtime/current");
    expect(promoter).not.toContain("systemctl reload nginx");
    expect(promoter).not.toContain("nginx -t");
  });

  it("does not accept a local container unless the public labelled route reports its revision", () => {
    expect(promoter).toContain('"https://${aurion_domain}/healthz"');
    expect(promoter).toContain('body.revision !== process.argv[1]');
    expect(promoter).toContain('body.revision !== process.env.EXPECTED_SHA');
    expect(promoter).toContain('"mode":"traefik-labelled"');
    expect(promoter).toContain('systemctl disable --now "$legacy_service"');
  });
});
