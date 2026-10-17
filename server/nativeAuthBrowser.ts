import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { COOKIE_NAME } from "@shared/const";
import { NATIVE_AUTH_TRANSACTION_TTL_SECONDS } from "@shared/nativeAuthContract";
import { getUserByOpenId } from "./db";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { readNativeBrowserBinding } from "./nativeAuthStateSeal";

export const NATIVE_BROWSER_PENDING_COOKIE = "__Host-aurion_native_browser";

export function nativeBrowserCookieOptions() {
  return {
    path: "/" as const,
    secure: true,
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: NATIVE_AUTH_TRANSACTION_TTL_SECONDS * 1000,
  };
}

/**
 * A fixed same-origin continuation, never an arbitrary caller-provided URL.
 * The destination's own database gate is responsible for checking live status.
 */
export function nativeBrowserContinuePath(cookieHeader: string | undefined): string {
  const raw = parseCookieHeader(cookieHeader ?? "")[NATIVE_BROWSER_PENDING_COOKIE];
  try {
    const binding = readNativeBrowserBinding(raw);
    if (!binding) return "/";
    return "/api/native-auth/browser/" + binding.transactionId;
  } catch {
    return "/";
  }
}

/** Only a verified first-party WEB SESSION COOKIE can authorize browser confirmation. */
export async function authenticatedNativeBrowserUser(req: Request): Promise<number | null> {
  if (req.headers.authorization || !ENV.appId || ENV.cookieSecret.length < 32) return null;
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const verified = await sdk.verifySession(cookies[COOKIE_NAME]);
  if (!verified || verified.appId !== ENV.appId ||
      verified.openId.startsWith("cron_")) return null;
  const user = await getUserByOpenId(verified.openId);
  return user && Number.isSafeInteger(user.id) && user.id > 0 ? user.id : null;
}
