import { HttpError } from "@shared/_core/errors";

/** Only the native-auth availability boundary can request retryable 503. */
export function isNativeAuthUnavailable(error: unknown): boolean {
  return error instanceof HttpError &&
    error.statusCode === 503 &&
    error.message === "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE";
}
