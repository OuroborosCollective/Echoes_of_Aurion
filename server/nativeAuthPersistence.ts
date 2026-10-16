import type { NativeAuthExchangeRequest, NativeAuthStartRequest, NativeAuthTokenResponse } from "@shared/nativeAuthContract";
/** RED phase: these fail closed until verified transactional storage is implemented. */
const pending = (): never => { throw new Error("NATIVE_AUTH_STORAGE_NOT_IMPLEMENTED"); };
export async function startNativeAuthTransaction(_request: NativeAuthStartRequest, _nowMs?: number): Promise<{ transactionId: string; expiresAtMs: number }> { return pending(); }
export async function issueNativeAuthHandoffAfterVerifiedBrowserLogin(_id: string, _userId: number, _nowMs?: number): Promise<{ handoffCode: string; expiresAtMs: number }> { return pending(); }
export async function exchangeNativeAuthHandoff(_request: NativeAuthExchangeRequest, _nowMs?: number): Promise<NativeAuthTokenResponse> { return pending(); }
export async function refreshNativeAuthSession(_token: string, _nowMs?: number): Promise<NativeAuthTokenResponse> { return pending(); }
export async function authenticateNativeAuthAccess(_token: string, _nowMs?: number): Promise<{ userId: number; sessionId: string } | null> { return pending(); }
export async function revokeNativeAuthSession(_token: string, _nowMs?: number): Promise<boolean> { return pending(); }
