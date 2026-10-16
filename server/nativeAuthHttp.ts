import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import {
 NATIVE_AUTH_CONTRACT_VERSION as VERSION,
 nativeAuthExchangeRequestSchema, nativeAuthRefreshRequestSchema, nativeAuthRevokeRequestSchema,
 nativeAuthTokenPairSchema, nativeAuthErrorCodes,
 type NativeAuthExchangeRequest, type NativeAuthTokenPair,
} from "@shared/nativeAuthContract";
import {
 exchangeNativeAuthHandoff, refreshNativeAuthSession, revokeNativeAuthSession,
} from "./nativeAuthPersistence";

export interface NativeAuthHttpDependencies {
 ready: () => Promise<boolean>;
 exchange: (request: NativeAuthExchangeRequest) => Promise<NativeAuthTokenPair>;
 refresh: (token: string) => Promise<NativeAuthTokenPair>;
 revoke: (token: string) => Promise<boolean>;
}
const DEFAULTS: NativeAuthHttpDependencies = {
 // Not deployable without a separately approved native schema and verified browser handoff.
 ready: async () => false,
 exchange: exchangeNativeAuthHandoff,
 refresh: refreshNativeAuthSession,
 revoke: revokeNativeAuthSession,
};
const response = (res: Response, status: number, error: string) =>
 res.status(status).json({ version: VERSION, error });
const errors = new Set<string>(nativeAuthErrorCodes);
function fail(res: Response, value: unknown) {
 const code = value instanceof Error && errors.has(value.message) ? value.message : "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE";
 const status = code === "NATIVE_AUTH_CODE_CONSUMED" || code === "NATIVE_AUTH_REFRESH_REUSED" ? 409 :
 code === "NATIVE_AUTH_RATE_LIMITED" ? 429 :
 code === "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE" ? 503 : 401;
 return response(res,status,code);
}
function hostile(req: Request): boolean {
 return Boolean(req.headers.cookie || req.headers.authorization || req.headers.origin ||
  req.headers.referer || req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "none");
}
export function registerNativeAuthHttpRoutes(app: Express, options: Partial<NativeAuthHttpDependencies> = {}): void {
 const deps = { ...DEFAULTS, ...options };
 const path = "/api/native-auth";
 app.use(path, rateLimit({windowMs:60_000,limit:20,standardHeaders:"draft-7",legacyHeaders:false}));
 app.use(path, (_req,res,next) => {res.setHeader("Cache-Control","no-store");res.setHeader("Pragma","no-cache");next();});
 app.use(path, (_req,res,next) => {
  // The app's global json parser handles malformed JSON, so Express errors should never reveal a stack.
  next();
 });
 app.post(path+"/exchange",async(req,res)=>{
  try {
   if(!await deps.ready())return response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
   if(hostile(req))return response(res,403,"NATIVE_AUTH_REQUEST_INVALID");
   const parsed=nativeAuthExchangeRequestSchema.safeParse(req.body);
   if(!parsed.success)return response(res,400,"NATIVE_AUTH_REQUEST_INVALID");
   const tokens=await deps.exchange(parsed.data);
   const valid=nativeAuthTokenPairSchema.safeParse(tokens);
   if(!valid.success)return response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
   return res.status(200).json(valid.data);
  }catch(e){return fail(res,e)}
 });
 app.post(path+"/refresh",async(req,res)=>{
  try{
   if(!await deps.ready())return response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
   if(hostile(req))return response(res,403,"NATIVE_AUTH_REQUEST_INVALID");
   const parsed=nativeAuthRefreshRequestSchema.safeParse(req.body);
   if(!parsed.success)return response(res,400,"NATIVE_AUTH_REQUEST_INVALID");
   const tokens=await deps.refresh(parsed.data.refreshToken);
   const valid=nativeAuthTokenPairSchema.safeParse(tokens);
   if(!valid.success)return response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
   return res.status(200).json(valid.data);
  }catch(e){return fail(res,e)}
 });
 app.post(path+"/revoke",async(req,res)=>{
  try{
   if(!await deps.ready())return response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
   if(hostile(req))return response(res,403,"NATIVE_AUTH_REQUEST_INVALID");
   const parsed=nativeAuthRevokeRequestSchema.safeParse(req.body);
   if(!parsed.success)return response(res,400,"NATIVE_AUTH_REQUEST_INVALID");
   if(parsed.data.scope!=="session")return response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
   await deps.revoke(parsed.data.refreshToken);
   return res.status(204).end();
  }catch(e){return fail(res,e)}
 });
 app.post(path+"/start",(_req,res)=>response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"));
 app.get(path+"/browser/:transactionId",(_req,res)=>response(res,503,"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"));
}
