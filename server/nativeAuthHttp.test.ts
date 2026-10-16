import express from "express";
import { describe, expect, it, vi } from "vitest";
import { NATIVE_AUTH_CONTRACT_VERSION as VERSION, NATIVE_AUTH_ACCESS_TTL_SECONDS, NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS } from "../shared/nativeAuthContract";
import { registerNativeAuthHttpRoutes } from "./nativeAuthHttp";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
const secret=(x:string)=>x.repeat(43);
const request={version:VERSION,transactionId:secret("t"),code:secret("c"),codeVerifier:secret("v"),appBuild:"godot-android.1"};
const token={version:VERSION,tokenType:"Bearer" as const,accessToken:secret("a"),refreshToken:secret("r"),accessExpiresInSeconds:NATIVE_AUTH_ACCESS_TTL_SECONDS,refreshAbsoluteRemainingSeconds:3600,refreshIdleExpiresInSeconds:NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS};
async function setup(deps: Parameters<typeof registerNativeAuthHttpRoutes>[1]={}) {
 const app=express();app.use(express.json({limit:"8kb"}));registerNativeAuthHttpRoutes(app,deps);
 const srv=await new Promise<Server>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
 return {url:"http://127.0.0.1:"+(srv.address() as AddressInfo).port+"/api/native-auth", close:()=>new Promise<void>(r=>srv.close(()=>r()))};
}
const post=(url:string,body:unknown,headers:Record<string,string>={})=>fetch(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
describe("native HTTP session boundary",()=>{
 it("stays disabled without approval",async()=>{const x=await setup();try{const r=await post(x.url+"/exchange",request);expect(r.status).toBe(503);expect(r.headers.get("cache-control")).toContain("no-store");}finally{await x.close()}});
 it("exchanges only strict versioned payload and does not set cookies",async()=>{const exchange=vi.fn(async()=>token);const x=await setup({ready:async()=>true,exchange});try{
 const r=await post(x.url+"/exchange",request);expect(r.status).toBe(200);expect(await r.json()).toEqual(token);expect(r.headers.get("set-cookie")).toBeNull();expect(exchange).toHaveBeenCalledWith(request);
 for(const [body,headers] of [[{...request,extra:1},{}],[request,{Cookie:"session=1"}],[request,{Authorization:"Bearer preview"}],[request,{Origin:"https://arelogic.space"}]] as const){const bad=await post(x.url+"/exchange",body,headers);expect([400,403]).toContain(bad.status);}
 expect(exchange).toHaveBeenCalledTimes(1);
 }finally{await x.close()}});
 it("rotates refresh and revokes only one session",async()=>{const refresh=vi.fn(async()=>token),revoke=vi.fn(async()=>true);const x=await setup({ready:async()=>true,refresh,revoke});try{
 const body={version:VERSION,refreshToken:secret("r")};expect((await post(x.url+"/refresh",body)).status).toBe(200);expect(refresh).toHaveBeenCalledWith(body.refreshToken);
 expect((await post(x.url+"/revoke",{...body,scope:"session"})).status).toBe(204);expect(revoke).toHaveBeenCalledWith(body.refreshToken);
 expect((await post(x.url+"/revoke",{...body,scope:"all_sessions"})).status).toBe(503);
 }finally{await x.close()}});
 it("fails closed on consumed handoff without returning input secrets",async()=>{const x=await setup({ready:async()=>true,exchange:async()=>{throw Error("NATIVE_AUTH_CODE_CONSUMED")}});try{
 const r=await post(x.url+"/exchange",request);expect(r.status).toBe(409);const txt=await r.text();expect(txt).not.toContain(request.code);expect(txt).not.toContain(request.codeVerifier);expect(JSON.parse(txt).error).toBe("NATIVE_AUTH_CODE_CONSUMED");
 }finally{await x.close()}});
 it("does not enable browser handoff before trusted login integration",async()=>{const x=await setup({ready:async()=>true});try{
 expect((await post(x.url+"/start",{version:VERSION})).status).toBe(503);
 expect((await fetch(x.url+"/browser/"+request.transactionId)).status).toBe(503);
 }finally{await x.close()}});
});
