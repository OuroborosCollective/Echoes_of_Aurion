#!/usr/bin/env tsx
import { clientObservationIdentifier, clientVerificationReadbackSchema } from "../shared/aurionClientVerificationContract";
import { COOKIE_NAME } from "../shared/const";

// Reads the live process through the authenticated API. A fresh local singleton
// would contain no observations and is deliberately not imported here.
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--connection" || args[2] !== "--session") {
  console.error("Usage: read-aurion-client-verification.ts --connection <id> --session <id>"); process.exit(64);
}
try {
  const connectionId = clientObservationIdentifier.parse(args[1]), clientSessionId = clientObservationIdentifier.parse(args[3]);
  const origin = new URL(process.env.AURION_READBACK_ORIGIN ?? "http://127.0.0.1:3000");
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname)))) throw Error("ORIGIN_INVALID");
  const cookie = process.env.AURION_READBACK_SESSION;
  if (!cookie || !/^[A-Za-z0-9._~-]{1,4096}$/.test(cookie)) throw Error("AUTHENTICATION_REQUIRED");
  const url = new URL("/api/trpc/gameplay.clientVerificationStatus", origin);
  url.searchParams.set("input", JSON.stringify({ json: { connectionId, clientSessionId } }));
  const response = await fetch(url, { headers: { Cookie: `${COOKIE_NAME}=${cookie}` }, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw Error("READBACK_UNAVAILABLE");
  const body = await response.json();
  const status = clientVerificationReadbackSchema.parse(body.result?.data?.json);
  console.log(JSON.stringify({ mode: "authenticated-live-client-observation", ...status }));
  process.exitCode = 0; // Successful observation read; never an authority verdict.
} catch {
  console.error(JSON.stringify({ status: "CLIENT_UNOBSERVABLE", reason: "AUTHENTICATED_READBACK_UNAVAILABLE", trust: "untrusted-client-observation", mutationAuthority: "none" }));
  process.exitCode = 2;
}
