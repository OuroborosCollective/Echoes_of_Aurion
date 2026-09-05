import {once} from "node:events";
import type {AddressInfo} from "node:net";
import express from "express";
import {createExpressMiddleware} from "@trpc/server/adapters/express";
import {createTRPCClient,httpBatchLink} from "@trpc/client";
import {QueryClient} from "@tanstack/react-query";
import superjson from "superjson";
import {describe,expect,it,vi} from "vitest";
import type {TrpcContext} from "./_core/context";
const database=vi.hoisted(()=>({getActiveGuildForUser:vi.fn()}));
vi.mock("./db",async original=>({...await original<typeof import("./db")>(),...database}));
import {appRouter,type AppRouter} from "./routers";
it("transmits no guild as explicit null through HTTP, superjson and the query cache",async()=>{
 const app=express();app.use(express.json());
 app.use("/api/trpc",createExpressMiddleware({router:appRouter,createContext:({req,res})=>({req,res,user:{id:7,openId:"guild-transport-fixture",role:"user"}} as TrpcContext)}));
 const server=app.listen(0,"127.0.0.1");await once(server,"listening");
 const client=createTRPCClient<AppRouter>({links:[httpBatchLink({url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/trpc`,transformer:superjson})]});
 const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 try{
  database.getActiveGuildForUser.mockResolvedValue(undefined);
  expect(await cache.fetchQuery({queryKey:["guild-mine",7],queryFn:()=>client.guild.mine.query()})).toBeNull();
  expect(database.getActiveGuildForUser).toHaveBeenCalledWith(7);
  database.getActiveGuildForUser.mockRejectedValue(new Error("GUILD_MEMBERSHIP_READBACK_MISSING"));
  await expect(cache.fetchQuery({queryKey:["guild-mine",7],queryFn:()=>client.guild.mine.query()})).rejects.toThrow("GUILD_MEMBERSHIP_READBACK_MISSING");
 }finally{cache.clear();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
