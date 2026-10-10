import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { AurionProductionProbeStore } from "./aurionProductionProbeStore";
import { hashLocalPassword } from "./localAuth";
const enabled=process.env.AURION_PROBE_E2E==='1';
const suite=enabled?describe:describe.skip;
const run={repository:'OuroborosCollective/Echoes_of_Aurion',workflow:'.github/workflows/deploy-aurion-zone-runtime.yml',ref:'refs/heads/main',revision:'a'.repeat(40),runId:'123456789',runAttempt:1,environment:'production',audience:'aurion-production-probe'};
const scope='aurion.probe.admin-readback', password='disposable-probe-test-password';
suite('real MariaDB one-shot transaction and role/reauth proof (isolated DB only)',()=>{
 let pool:Pool,store:AurionProductionProbeStore,userId:number; let sequence=0;
 const identity=()=>({...run,runId:String(900000000+(++sequence))});
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'');
  if(!/^aurion_.*test/.test(url.pathname.slice(1))||!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('ISOLATED_TEST_DB_REQUIRED');
  pool=createPool({uri:url.href,connectionLimit:8}); store=new AurionProductionProbeStore(pool);
  const [insert]:any=await pool.execute("INSERT INTO users (openId,name,role) VALUES (?,?,'admin')",[`probe-test:${Date.now()}`,'isolated probe test']);userId=insert.insertId;
  await pool.execute('INSERT INTO localCredentials (userId,handle,passwordHash) VALUES (?,?,?)',[userId,`probe_${userId}`,await hashLocalPassword(password)]);
 },30000);
 afterAll(async()=>{if(pool){await pool.execute('DELETE FROM aurionProductionProbeApprovals WHERE approvedByUserId=?',[userId]);await pool.execute('DELETE FROM localCredentials WHERE userId=?',[userId]);await pool.execute('DELETE FROM users WHERE id=?',[userId]);await pool.end();}});
 it('commits one winner under 12 simultaneous consumers and permanently rejects replay',async()=>{
  const r=identity();await store.approve(userId,password,r,scope,'isolated concurrency proof');
  const results=await Promise.allSettled(Array.from({length:12},()=>store.consume(r,scope)));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  await expect(store.consume(r,scope)).rejects.toThrow();
  await expect(store.approve(userId,password,r,scope,'reapproval must fail')).rejects.toThrow();
  const [rows]=await pool.execute<RowDataPacket[]>('SELECT consumedAtMs FROM aurionProductionProbeApprovals WHERE runJson=?',[JSON.stringify(r)]);expect(Number(rows[0].consumedAtMs)).toBeGreaterThan(0);
 });
 it('serializes the separately approved effectful gameplay session across database connections',async()=>{
  let release!:()=>void, entered!:()=>void;
  const enteredPromise=new Promise<void>(resolve=>{entered=resolve;});
  const first=store.withExclusiveGameplayProbeSession(async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});});
  await enteredPromise;
  await expect(store.withExclusiveGameplayProbeSession(async()=>undefined)).rejects.toThrow('PROBE_GAMEPLAY_SESSION_BUSY');
  release();await first;
 });
 it('rejects stale revision, run ID, attempt and wrong scope without spending valid approval',async()=>{
  const r=identity();await store.approve(userId,password,r,scope,'isolated identity proof');
  for(const changed of [{...r,revision:'b'.repeat(40)},{...r,runId:'99'},{...r,runAttempt:2}]) await expect(store.consume(changed,scope)).rejects.toThrow();
  await expect(store.consume(r,'aurion.probe.gameplay-readback')).rejects.toThrow();await expect(store.consume(r,'schema.write')).rejects.toThrow();
  expect((await store.consume(r,scope)).mutationAuthority).toBe('none');
 });
 it('uses independently consumable read-only and effectful scopes',async()=>{
  const r=identity();for(const s of [scope,'aurion.probe.gameplay-readback','aurion.probe.gameplay-session-readback'])await store.approve(userId,password,r,s,'separate probe consumers');
  await store.consume(r,scope);await store.consume(r,'aurion.probe.gameplay-readback');await store.consume(r,'aurion.probe.gameplay-session-readback');
 });
 it('rejects revoked and expired approvals',async()=>{
  const revoked=identity(),expired=identity();const a=await store.approve(userId,password,revoked,scope,'revocation proof');await store.revoke(userId,a.approvalId);await expect(store.consume(revoked,scope)).rejects.toThrow();
  const b=await store.approve(userId,password,expired,scope,'expiry proof');await pool.execute('UPDATE aurionProductionProbeApprovals SET expiresAtMs=approvedAtMs WHERE approvalId=?',[b.approvalId]);await expect(store.consume(expired,scope)).rejects.toThrow();
 });
 it('rechecks current role after approval',async()=>{
  const r=identity();await store.approve(userId,password,r,scope,'role demotion proof');await pool.execute("UPDATE users SET role='user' WHERE id=?",[userId]);
  try{await expect(store.consume(r,scope)).rejects.toThrow();await expect(store.approve(userId,password,identity(),scope,'non-admin approval')).rejects.toThrow();}finally{await pool.execute("UPDATE users SET role='admin' WHERE id=?",[userId]);}
 });
 it('commits failed-password lockout and rejects even correct password while locked',async()=>{
  for(let n=0;n<5;n++)await expect(store.approve(userId,'wrong',identity(),scope,'reauth failure proof')).rejects.toThrow();
  const [rows]=await pool.execute<RowDataPacket[]>('SELECT failedAttempts,lockedUntil FROM localCredentials WHERE userId=?',[userId]);expect(Number(rows[0].failedAttempts)).toBe(5);expect(rows[0].lockedUntil).not.toBeNull();
  await expect(store.approve(userId,password,identity(),scope,'locked reauth proof')).rejects.toThrow();
 });
});
