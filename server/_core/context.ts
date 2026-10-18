import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { HttpError } from "@shared/_core/errors";
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
    if (error instanceof HttpError && error.statusCode === 503 && error.message === "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE") {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE" });
    }
    // Authentication is optional for public procedures, but infrastructure failure is not invalid credentials.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
