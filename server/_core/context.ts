import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { isNativeAuthSessionExpired, isNativeAuthUnavailable } from "./nativeAuthHttpError";
import { TRPCError } from "@trpc/server";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (isNativeAuthUnavailable(error)) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE" });
    }
    if (isNativeAuthSessionExpired(error)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "NATIVE_AUTH_SESSION_EXPIRED" });
    }
    // Authentication is optional for public procedures, but typed native failures must remain actionable.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
