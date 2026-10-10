import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createPool, type Pool } from 'mysql2/promise';
import { createServer, type Server } from 'node:http';
import express from 'express';
import { hashLocalPassword } from './localAuth';
const suite=process.env.AURION_PROBE_E2E==='1'?describe:describe.skip;
suite('isolated real HTTP + MariaDB + existing signed Aurion session (not production evidence)',()=>{
 let pool:Pool,server:Server,base:string,cookie:string,userId:number;
 const password='disposable-http-probe-password';
 const run={repository:'OuroborosCollective/Echoes_of_Aurion',workflow:'.github/workflows/deploy-aurion-zone-runtime.yml',ref:'refs/heads/main',revision:'c'.repeat(40),runId:'987654321',runAttempt:1,environment:'production',audience:'aurion-production-probe'};
 const headers={'origin':'https://arelogic.space','content-type':'application/json','x-requested-with':'AurionOps'};
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'');
  if(!/^aurion_.*test/.test(url.pathname.slice(1))||!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('ISOLATED_TEST_DB_REQUIRED');
  pool=createPool(url.href);const openId=`local:probe_http_${Date.now()}`;
  const [insert]:any=await pool.execute("INSERT INTO users (openId,name,role) VALUES (?,?,'admin')",[openId,'isolated HTTP test']);userId=insert.insertId;
  await pool.execute('INSERT INTO localCredentials (userId,handle,passwordHash) VALUES (?,?,?)',[userId,`http_${userId}`,await hashLocalPassword(password)]);
  const {sdk}=await import('./_core/sdk');cookie=`app_session_id=${await sdk.createSessionToken(openId,{name:'isolated HTTP test',expiresInMs:300000})}`;
  const {registerProductionProbeRoutes}=await import('./aurionProductionProbeHttp');
  const app=express();app.use(express.json());registerProductionProbeRoutes(app,()=>({revision:run.revision}));
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/production-probe`;
 },30000);
 const post=(path:string,body:unknown,extra:Record<string,string>={})=>fetch(`${base}/${path}`,{method:'POST',headers:{...headers,cookie,...extra},body:JSON.stringify(body)});
 afterAll(async()=>{
  if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  if(pool){await pool.execute('DELETE FROM aurionProductionProbeApprovals WHERE approvedByUserId=?',[userId]);await pool.execute('DELETE FROM localCredentials WHERE userId=?',[userId]);await pool.execute('DELETE FROM users WHERE id=?',[userId]);await pool.end();}
 });
 it('rejects no session, wrong role and every ambient-cookie CSRF surface',async()=>{
  expect((await post('list',{}, {cookie:''})).status).toBe(403);
  for(const changes of [{origin:'https://attacker.test'},{origin:'null'},{'x-requested-with':''},{'content-type':'text/plain'},{'sec-fetch-site':'cross-site'}])expect((await post('list',{},changes)).status).toBe(403);
  await pool.execute("UPDATE users SET role='user' WHERE id=?",[userId]);
  try{expect((await post('list',{})).status).toBe(403);}finally{await pool.execute("UPDATE users SET role='admin' WHERE id=?",[userId]);}
 });
 it('requires explicit confirmation and fresh password, reads persisted receipt, then revokes it',async()=>{
  const body={run,scope:'aurion.probe.admin-readback',purpose:'isolated HTTP approval proof',password,confirmed:true};
  expect((await post('approve',{...body,confirmed:false})).status).toBe(403);
  expect((await post('approve',{...body,password:'wrong'})).status).toBe(403);
  const approved=await post('approve',body);expect(approved.status).toBe(200);const receipt=await approved.json();
  expect(receipt.expiresAtMs-receipt.approvedAtMs).toBe(300000);
  expect((await (await post('list',{})).json()).some((a:any)=>a.approvalId===receipt.approvalId)).toBe(true);
  expect((await post('revoke',{approvalId:receipt.approvalId})).status).toBe(200);
  const rows=await (await post('list',{})).json();expect(rows.find((a:any)=>a.approvalId===receipt.approvalId).revokedAtMs).toBeGreaterThan(0);
 });
 it('never accepts browser cookies or fabricated runner JWTs for consumption',async()=>{
  expect((await post('execute',{scope:'aurion.probe.admin-readback'})).status).toBe(403);
  expect((await post('execute',{scope:'aurion.probe.admin-readback'},{cookie:'',authorization:'Bearer invalid-test-token'})).status).toBe(403);
 });
});
