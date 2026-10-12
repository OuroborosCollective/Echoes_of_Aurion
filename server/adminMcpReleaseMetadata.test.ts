import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { protectedResourceMetadata, readAurionAdminMcpSettings } from "./adminMcpProtocol";

const root = path.resolve(import.meta.dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy-aurion-zone-runtime.yml"), "utf8");
const step = workflow.split("- name: Verify public Aurion Admin MCP protected-resource metadata")[1]?.split("\n  verify-release-attestations:")[0];
const verifier = step?.match(/node --input-type=module -e '\n([\s\S]*?)\n\s*'/)?.[1];
const clientId = "91097c69-cf11-42ae-8be2-1d0a821e7758";
const environment = { AURION_ADMIN_MCP_RESOURCE_URL: "https://arelogic.space/admin-mcp", OIDC_ISSUER_URL: "https://id.arelogic.space" };

function verify(body: unknown, compose: string) {
  if (!verifier) throw new Error("Actual release metadata verifier not found");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-admin-release-"));
  try {
    fs.writeFileSync(path.join(directory, "docker-compose.traefik.yml"), compose);
    return spawnSync(process.execPath, ["--input-type=module", "-e", verifier], {
      cwd: directory, input: JSON.stringify(body), encoding: "utf8",
    }).status;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("actual release admin OAuth metadata gate", () => {
  const compose = fs.readFileSync(path.join(root, "docker-compose.traefik.yml"), "utf8");
  const metadata = protectedResourceMetadata(readAurionAdminMcpSettings({ ...environment,
    AURION_ADMIN_MCP_AUTH_MODE: "application_roles", AURION_ADMIN_MCP_CLIENT_ID: clientId,
  }));

  it("accepts the configured free application and rejects another application with valid standard scopes", () => {
    expect(verify(metadata, compose)).toBe(0);
    expect(verify({ ...metadata, aurion_admin_authorization: {
      ...metadata.aurion_admin_authorization, client_id: "cdb22c5e-57f2-4008-bf88-3197e8b98389",
    } }, compose)).toBe(25);
    expect(verify({ ...metadata, aurion_admin_authorization: undefined }, compose)).toBe(25);
  });

  it("requires the read and separate write roles to be advertised", () => {
    expect(verify({ ...metadata, aurion_admin_authorization: {
      ...metadata.aurion_admin_authorization, roles_supported: ["aurion_admin_read"],
    } }, compose)).toBe(26);
    expect(verify({ ...metadata, scopes_supported: ["openid"] }, compose)).toBe(24);
  });

  it("preserves the scoped OAuth verification profile", () => {
    const legacyCompose = compose.replace('      AURION_ADMIN_MCP_AUTH_MODE: application_roles\n', "");
    const legacyMetadata = protectedResourceMetadata(readAurionAdminMcpSettings(environment));
    expect(verify(legacyMetadata, legacyCompose)).toBe(0);
    expect(verify(metadata, legacyCompose)).toBe(24);
  });
});
