import express from "express";
import { createServer } from "node:http";
import { describe, it, expect } from "vitest";
import { authBodyLimit } from "./authBodyLimit";

describe("HTTP authentication body limits", () => {
  it("caps standalone auth bodies while preserving regular auth, batches and upload payloads", async () => {
    const app = express();
    app.use(authBodyLimit());
    app.use(express.json({limit:"50mb"}));
    app.use(express.urlencoded({limit:"50mb", extended:true}));
    app.use((req,res)=>res.json({ body:req.body }));
    const server=createServer(app); await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address();if(!address||typeof address==="string")throw new Error("ADDRESS_REQUIRED");
    const origin=`http://127.0.0.1:${address.port}`;
    const post=(path:string, body:string, type="application/json")=>fetch(origin+path,{method:"POST",headers:{"content-type":type},body});
    try {
      const small=JSON.stringify({json:{handle:"alice",password:"local-fixture"}});
      const request=await post("/api/trpc/auth.loginLocal?batch=1",small);
      expect(request.status).toBe(200);expect(await request.json()).toEqual({body:JSON.parse(small)});
      const big=JSON.stringify({data:"x".repeat(17*1024)});
      for(const path of ["/api/trpc/auth.loginLocal", "/API/TRPC/auth.loginLocal/", "/api/trpc/auth.registerLocal", "/api/native-auth/start", "/API/NATIVE-AUTH/START/", "/api/native-auth/exchange", "/api/native-auth/refresh", "/api/native-auth/revoke"])
        expect((await post(path,big)).status).toBe(413);
      expect((await post("/api/native-auth/start", "data="+"x".repeat(17*1024),"application/x-www-form-urlencoded")).status).toBe(413);
      expect((await post("/api/trpc/auth.loginLocal,admin.upload",big)).status).toBe(200);
      expect((await post("/api/game/glb-upload",big)).status).toBe(200);
    } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
  });
});
