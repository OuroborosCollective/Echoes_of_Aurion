const approvedHosts = new Set([
  "arelogic.space",
  "aurion3d-6hpapr2g.manus.space",
  "vchd74l3bk-on7gpcjxhq-ue.a.run.app",
  "localhost",
  "localhost:3000",
  "127.0.0.1",
  "127.0.0.1:3000",
]);

function firstHost(value: string | undefined): string {
  return (value ?? "").split(",", 1)[0]?.trim().toLowerCase() ?? "";
}

/** Accept only explicitly known public, platform, or local development hosts. */
export function resolveApprovedGatewayHost(host: string | undefined, forwardedHost: string | undefined): string | null {
  const direct = firstHost(host);
  const forwarded = firstHost(forwardedHost);
  if (!approvedHosts.has(direct)) return null;
  if (forwarded && approvedHosts.has(forwarded)) return forwarded;
  return direct;
}
