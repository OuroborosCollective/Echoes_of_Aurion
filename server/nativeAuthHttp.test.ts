import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NATIVE_AUTH_CONTRACT_VERSION as VERSION, NATIVE_AUTH_ACCESS_TTL_SECONDS, NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS } from "../shared/nativeAuthContract";
import { registerNativeAuthHttpRoutes } from "./nativeAuthHttp";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
const secret=(x:string)=>x.repeat(43);
const request={version:VERSION,transactionId:secret("t"),code:secret("c"),codeVerifier:secret("v"),appBuild:"godot-android.1"};
const token={version:VERSION,tokenType:"Bearer" as const,accessToken:secret("a"),refreshToken:secret("r"),accessExpiresInSeconds:NATIVE_AUTH_ACCESS_TTL_SECONDS,refreshAbsoluteRemainingSeconds:3600,refreshIdleExpiresInSeconds:NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS};
async function setup(deps: Parameters<typeof registerNativeAuthHttpRoutes>[1]={}) {
 const app=express();app.use(express.json({limit:"8kb"}));app.use(express.urlencoded({extended:false,limit:"2kb"}));registerNativeAuthHttpRoutes(app,deps);
 const srv=await new Promise<Server>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
 return {url:"http://127.0.0.1:"+(srv.address() as AddressInfo).port+"/api/native-auth", close:()=>new Promise<void>(r=>srv.close(()=>r()))};
}
const post=(url:string,body:unknown,headers:Record<string,string>={})=>fetch(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
describe("native HTTP session boundary",()=>{
 const previousSealKey=process.env.NATIVE_AUTH_STATE_SEAL_KEY;
 beforeAll(()=>{process.env.NATIVE_AUTH_STATE_SEAL_KEY=Buffer.alloc(32,23).toString("base64url")});
 afterAll(()=>{if(previousSealKey===undefined)delete process.env.NATIVE_AUTH_STATE_SEAL_KEY;else process.env.NATIVE_AUTH_STATE_SEAL_KEY=previousSealKey});
 it("stays disabled without approval",async()=>{const x=await setup();try{const r=await post(x.url+"/exchange",request);expect(r.status).toBe(503);expect(r.headers.get("cache-control")).toContain("no-store");}finally{await x.close()}});
 it("exchanges only strict versioned payload and does not set cookies",async()=>{const exchange=vi.fn(async()=>token);const x=await setup({ready:async()=>true,exchange});try{
 const r=await post(x.url+"/exchange",request);expect(r.status).toBe(200);expect(await r.json()).toEqual(token);expect(r.headers.get("set-cookie")).toBeNull();expect(exchange).toHaveBeenCalledWith(request);
 for(const [body,headers] of [[{...request,extra:1},{}],[request,{Cookie:"session=1"}],[request,{Authorization:"Bearer preview"}],[request,{Origin:"https://arelogic.space"}]] as const){const bad=await post(x.url+"/exchange",body,headers);expect([400,403]).toContain(bad.status);}
 expect(exchange).toHaveBeenCalledTimes(1);
 }finally{await x.close()}});
 it("rotates refresh and revokes only one session",async()=>{const refresh=vi.fn(async()=>token),revoke=vi.fn(async()=>true);const x=await setup({ready:async()=>true,refresh,revoke});try{
 const body={version:VERSION,refreshToken:secret("r")};expect((await post(x.url+"/refresh",body)).status).toBe(200);expect(refresh).toHaveBeenCalledWith(body.refreshToken);
 expect((await post(x.url+"/revoke",{...body,scope:"session"})).status).toBe(204);expect(revoke).toHaveBeenCalledWith(body.refreshToken,"session");
 expect((await post(x.url+"/revoke",{...body,scope:"all_sessions"})).status).toBe(204);expect(revoke).toHaveBeenLastCalledWith(body.refreshToken,"all_sessions");
 }finally{await x.close()}});
 it("returns the typed no-store contract when the native auth limiter rejects a request",async()=>{
  const exchange=vi.fn(async()=>token);const x=await setup({ready:async()=>true,exchange});
  try {
   for(let i=0;i<20;i++) expect((await post(x.url+"/exchange",request)).status).toBe(200);
   const limited=await post(x.url+"/exchange",request);
   expect(limited.status).toBe(429);
   expect(limited.headers.get("content-type")).toContain("application/json");
   expect(limited.headers.get("cache-control")).toContain("no-store");
   expect(await limited.json()).toEqual({version:VERSION,error:"NATIVE_AUTH_RATE_LIMITED"});
   expect(exchange).toHaveBeenCalledTimes(20);
  }finally{await x.close()}
 });
 it("fails closed on consumed handoff without returning input secrets",async()=>{const x=await setup({ready:async()=>true,exchange:async()=>{throw Error("NATIVE_AUTH_CODE_CONSUMED")}});try{
 const r=await post(x.url+"/exchange",request);expect(r.status).toBe(409);const txt=await r.text();expect(txt).not.toContain(request.code);expect(txt).not.toContain(request.codeVerifier);expect(JSON.parse(txt).error).toBe("NATIVE_AUTH_CODE_CONSUMED");
 }finally{await x.close()}});
 it("creates a PKCE-bound start response only for the existing strict contract",async()=>{
 const startRequest={version:VERSION,codeChallenge:"c".repeat(43),codeChallengeMethod:"S256",requestState:secret("s"),appBuild:"godot-android.1",platform:"android",returnId:"aurion.android.app-link.v1"};
 const start=vi.fn(async()=>({transactionId:secret("t"),expiresAtMs:Date.now()+600_000}));
 const browserTransaction=vi.fn(async()=>true);
 const x=await setup({ready:async()=>true,start,browserTransaction});
 try {
  const ok=await post(x.url+"/start",startRequest);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({version:VERSION,transactionId:secret("t"),browserUrl:"https://arelogic.space/api/native-auth/browser/"+secret("t"),expiresInSeconds:600});
  expect(ok.headers.get("set-cookie")).toBeNull();
  expect(start).toHaveBeenCalledWith(startRequest);
  for(const bad of [{...startRequest,returnId:"https://evil.example/callback"},{...startRequest,codeChallengeMethod:"plain"},{...startRequest,extra:"inject"},{...startRequest,codeChallenge:"short"},{...startRequest,appBuild:"untrusted/app"}]){
   const result=await post(x.url+"/start",bad);
   expect(result.status).toBe(400);
   expect(await result.json()).toEqual({version:VERSION,error:"NATIVE_AUTH_REQUEST_INVALID"});
  }
  expect(start).toHaveBeenCalledTimes(1);
  const browser=await fetch(x.url+"/browser/"+secret("t"));
  expect(browser.status).toBe(200);
  expect(browser.headers.get("content-type")).toContain("text/html");
  const page=await browser.text();
  expect(page).not.toContain(startRequest.requestState);
  expect(page).not.toContain("accessToken");
  expect(page).not.toContain("refreshToken");
  expect(browserTransaction).toHaveBeenCalledWith(secret("t"));
  const absent=await fetch(x.url+"/browser/"+"invalid");
  expect(absent.status).toBe(401);
 }finally{await x.close()}
 });
 it("fails closed for all browser-start surfaces without release configuration",async()=>{const x=await setup();try{
  expect((await post(x.url+"/start",{version:VERSION})).status).toBe(503);
  expect((await fetch(x.url+"/browser/"+request.transactionId)).status).toBe(503);
 }finally{await x.close()}});
});
