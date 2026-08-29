import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Aurion full container cutover", () => {
  const workflow = read(".github/workflows/deploy-aurion-zone-runtime.yml");
  const rootPromoter = read("deploy/promote-aurion-zone-runtime.sh");
  const containerPromoter = read("deploy/promote-aurion-container-runtime.sh");
  const compose = read("docker-compose.traefik.yml");
  const dockerfile = read("Dockerfile");
  const server = read("server/_core/index.ts");
  const sdk = read("server/_core/sdk.ts");

  it("builds one revision-labelled full runtime image from the prebuilt artifact", () => {
    expect(workflow).toContain("pnpm build:runtime-artifact");
    expect(workflow).toContain('image="echoes-of-aurion:sha-${GITHUB_SHA}"');
    expect(workflow).toContain('org.opencontainers.image.revision=${GITHUB_SHA}');
    expect(workflow).toContain("docker save \"$image\" | gzip -1");
    expect(workflow).toContain("aurion-full-runtime-image.tar.gz.sha256");
    expect(dockerfile).toContain("node:22.13.0-bookworm-slim@sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff");
    expect(dockerfile).toContain('org.opencontainers.image.revision="$AURION_RELEASE_SHA"');
  });

  it("keeps Docker authority inside the existing allowlisted root promoter", () => {
    expect(workflow).not.toContain("sudo docker");
    expect(workflow).not.toContain("docker compose --project-name");
    expect(rootPromoter).toContain("promote-aurion-container-runtime");
    expect(rootPromoter).not.toContain("systemctl reload nginx");
    expect(rootPromoter).not.toContain("nginx -t");
    expect(containerPromoter).toContain('gzip -dc "$image_archive" | docker load');
    expect(containerPromoter).toContain('docker compose --project-name "$project"');
  });

  it("routes one container through Traefik while keeping the database private", () => {
    expect(compose).toContain("traefik.docker.network=${TRAEFIK_NETWORK:-areloria_arelorian-network}");
    expect(compose).toContain("AURION_PRIVATE_NETWORK:-echoes-of-aurion-internal");
    expect(compose).toContain("- traefik-proxy");
    expect(compose).toContain("- aurion-private");
    expect(compose).not.toMatch(/3306:|5432:/);
    expect(containerPromoter).toContain('docker network inspect "$public_network"');
    expect(containerPromoter).toContain('docker network inspect "$private_network"');
  });

  it("binds server health, image and public readback to the exact SHA", () => {
    expect(compose).toContain("AURION_RUNTIME_REVISION: ${AURION_RUNTIME_REVISION:?");
    expect(server).toContain("AURION_RUNTIME_REVISION is required in production");
    expect(server).toContain("revision,");
    expect(containerPromoter).toContain('actual_revision="$(docker image inspect');
    expect(containerPromoter).toContain("body.revision!==process.env.EXPECTED_SHA");
    expect(workflow).toContain("https://arelogic.space/healthz");
    expect(workflow).not.toContain("https://arelogic.space/_runtime/healthz");
  });

  it("preserves local companion memory and a bounded rollback without mutating the database", () => {
    expect(compose).toContain("/app/data/companion-memory");
    expect(containerPromoter).toContain("rollback_public_service");
    expect(containerPromoter).toContain("databaseMutationPerformed:false");
    expect(containerPromoter).not.toMatch(/drizzle-kit\s+migrate/);
    expect(containerPromoter).not.toMatch(/mysql\s+-|mariadb\s+-|psql\s+-/);
  });

  it("requires protected environment permissions and exactly one complete authentication mode", () => {
    expect(containerPromoter).toContain("root:root:600");
    expect(containerPromoter).toContain("DATABASE_URL JWT_SECRET VITE_APP_ID");
    expect(containerPromoter).toContain("OIDC_ISSUER_URL OIDC_CLIENT_ID OIDC_CLIENT_SECRET OIDC_REDIRECT_URI");
    expect(containerPromoter).toContain("OAUTH_SERVER_URL");
    expect(containerPromoter).toContain("auth_mode=oidc");
    expect(containerPromoter).toContain("auth_mode=legacy_oauth");
    expect(containerPromoter).not.toContain('cat "$env_file"');
    expect(sdk).toContain("OIDC provider configured");
  });

  it("publishes the release pointer only after public revision readback", () => {
    expect(containerPromoter.indexOf('body.revision!==process.env.EXPECTED_SHA')).toBeLessThan(
      containerPromoter.indexOf('ln -sTfn "$release" "${base}/current.next"'),
    );
    expect(containerPromoter).toContain("authMode:process.env.AUTH_MODE");
  });

  it("bootstraps the exact new root promoter without accepting an arbitrary failed predecessor", () => {
    expect(workflow).toContain("LEGACY_PROMOTER_REPLACED");
    expect(workflow).toContain('cmp -s "${artifact}/deploy/promote-aurion-zone-runtime.sh" /usr/local/sbin/promote-aurion-zone-runtime');
    expect(workflow).toContain('},null,2)+"\\n");');
  });
});
