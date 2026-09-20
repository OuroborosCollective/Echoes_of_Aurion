import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";

function usage(): never {
  process.stderr.write("Usage: --world echoes-of-aurion-global\n");
  process.exit(64);
}
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--world" || args[1] !== GLOBAL_WORLD_ID) usage();
const rawOrigin = (process.env.AURION_READBACK_ORIGIN ?? "http://127.0.0.1:3000").trim();
const session = process.env.AURION_READBACK_SESSION?.trim();
if (!session || !/^[A-Za-z0-9._~-]{20,8192}$/.test(session)) {
  process.stdout.write(JSON.stringify({ mode: "authenticated-live-assurance", status: "UNVERIFIED", reason: "AUTHENTICATED_SESSION_UNAVAILABLE", mutationAuthority: "none" }) + "\n");
  process.exit(2);
}
const origin = new URL(rawOrigin);
if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(origin.hostname)))) usage();
const url = new URL("/api/trpc/gameplay.assuranceStatus", origin);
url.searchParams.set("input", JSON.stringify({ json: { worldId: GLOBAL_WORLD_ID } }));
try {
  const response = await fetch(url, { headers: { accept: "application/json", cookie: `app_session_id=${session}` },
    redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Error("HTTP_READBACK_FAILED");
  const body = await response.json() as any;
  const result = body?.result?.data?.json;
  if (!result?.snapshot || result.snapshot.worldId !== GLOBAL_WORLD_ID || result.mutationAuthority !== "none") throw Error("READBACK_CONTRACT_INVALID");
  process.stdout.write(JSON.stringify({ mode: "authenticated-live-assurance", ...result }) + "\n");
  process.exit(0);
} catch {
  process.stdout.write(JSON.stringify({ mode: "authenticated-live-assurance", status: "UNVERIFIED", reason: "LIVE_READBACK_UNAVAILABLE", mutationAuthority: "none" }) + "\n");
  process.exit(2);
}
