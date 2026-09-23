import { timingSafeEqual } from "node:crypto";

export const AURION_DEV_CONTROL_PATH = "/dev/admin-mcp" as const;
export const AURION_DEV_CONTROL_METADATA_PATH = "/.well-known/aurion-dev-control" as const;
export const AURION_DEV_CONTROL_SCOPE = "aurion.dev.control" as const;

const DEV_TOKEN_MIN_LENGTH = 32;

export function isLocalDevHostname(host: string | undefined): boolean {
  if (!host || typeof host !== "string") return false;
  const values = host.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (values.length === 0) return false;
  return values.every(value =>
    value === "localhost" ||
    value.startsWith("localhost:") ||
    value === "127.0.0.1" ||
    value.startsWith("127.0.0.1:") ||
    value === "::1" ||
    value === "[::1]" ||
    value.startsWith("[::1]:")
  );
}

export function isAllowedDevControlHost(host: string | undefined, forwardedHost: string | undefined): boolean {
  if (!isLocalDevHostname(host)) return false;
  if (forwardedHost && !isLocalDevHostname(forwardedHost)) return false;
  return true;
}

export function isDevControlChannelEnabled(environment: NodeJS.ProcessEnv): boolean {
  if (environment.NODE_ENV === "production") return false;
  const flag = environment.AURION_DEV_CONTROL_CHANNEL ?? environment.AURION_DEV_CONTROL_ENABLED;
  if (flag === "false" || flag === "0") return false;
  if (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") return true;
  return flag === "true" || flag === "1";
}

export function resolveDevAdminToken(environment: NodeJS.ProcessEnv): string | null {
  const custom = environment.AURION_DEV_ADMIN_TOKEN?.trim() || environment.AURION_DEV_ADMIN_SECRET?.trim();
  return custom && custom.length >= DEV_TOKEN_MIN_LENGTH ? custom : null;
}

export function verifyDevControlAuthorization(
  authorizationHeader: string | undefined,
  devTokenHeader: string | undefined,
  environment: NodeJS.ProcessEnv,
): { authorized: boolean; reason?: "missing_dev_authorization" | "invalid_dev_token" | "dev_token_not_configured" } {
  const expected = resolveDevAdminToken(environment);
  if (!expected) return { authorized: false, reason: "dev_token_not_configured" };

  let candidate: string | null = null;
  if (authorizationHeader?.startsWith("Bearer ")) candidate = authorizationHeader.slice(7).trim();
  else if (devTokenHeader) candidate = devTokenHeader.trim();

  if (!candidate) return { authorized: false, reason: "missing_dev_authorization" };

  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { authorized: false, reason: "invalid_dev_token" };
  return { authorized: true };
}

export function devControlCapabilities() {
  return Object.freeze({
    protocol: "aurion.dev-control.v1",
    channel: "dev/prealpha",
    environment: "isolated_local_development",
    boundary: Object.freeze({
      productionIsolated: true,
      productionRouteOAuthGuarded: true,
      requiresLocalLoopback: true,
      requiresDevToken: true,
      productionEnabled: false,
    }),
    tools: Object.freeze([
      { name: "aurion_dev_inspect_environment", mode: "read" },
      { name: "aurion_dev_test_zone_reset", mode: "write" },
      { name: "aurion_dev_seed_test_encounter", mode: "write" },
    ]),
    unavailable: Object.freeze([
      "raw_sql_execution",
      "raw_shell_execution",
      "git_mutation",
      "vps_access",
      "untyped_state_injection",
      "unauthenticated_production_admin",
      "raw_world_delta_write",
      "npc_reward_mutation",
      "production_asset_write",
      "production_authoring_write",
      "quest_publish",
    ]),
    truthBoundary: "Development fixture operations execute only against an isolated AuthoritativeMovementZone instance and never the global live ZoneRegistry.",
  });
}
