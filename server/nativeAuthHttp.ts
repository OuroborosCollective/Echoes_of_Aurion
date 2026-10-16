import type { Express } from "express";
import { NATIVE_AUTH_CONTRACT_VERSION, type NativeAuthExchangeRequest, type NativeAuthTokenPair } from "@shared/nativeAuthContract";
export interface NativeAuthHttpDependencies {
 ready: () => Promise<boolean>;
 exchange: (request: NativeAuthExchangeRequest) => Promise<NativeAuthTokenPair>;
 refresh: (token: string) => Promise<NativeAuthTokenPair>;
 revoke: (token: string) => Promise<boolean>;
}
export function registerNativeAuthHttpRoutes(app: Express, _deps: Partial<NativeAuthHttpDependencies> = {}): void {
 app.use("/api/native-auth", (_req,res) => res.status(503).set("Cache-Control","no-store").json({version:NATIVE_AUTH_CONTRACT_VERSION,error:"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"}));
}
