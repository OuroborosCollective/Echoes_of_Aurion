/** tRPC finalizes response headers after resolvers. Set actor cache policy at
 * that boundary, preserving tRPC's content-negotiation Vary dimensions. Mixed
 * batches containing personal discovery data receive the same private policy.
 */
export function discoveryResponseMeta({ paths }: { paths?: readonly string[] }) {
  return paths?.includes("gameplay.discoveryRegion") ? {
    headers: { "cache-control": "private, no-store", vary: "trpc-accept, accept, Authorization, Cookie" },
  } : {};
}
