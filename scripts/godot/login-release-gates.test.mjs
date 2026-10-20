import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLoginReleaseInputs, createLoginOverride, assertPackagedBuildRevision, checkAssetlinksDocument, LIVE_ASSETLINKS_URL } from './login-release-gates.mjs';
const sha='a'.repeat(40);
const fp='FA:'.repeat(31)+'FA';
const pkg='org.ouroboroscollective.aurion.godot.login';
const env={AURION_LOGIN_ALLOW_SIGNED_EXPORT:'1',AURION_LOGIN_GRADLE_SDK_ROOT:'/opt/login-sdk',AURION_LOGIN_APK_OUTPUT:'/tmp/login-results',AURION_EXPECTED_REVISION:sha};
const good=JSON.stringify([{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:pkg,sha256_cert_fingerprints:[fp]}}]);
const response={url:LIVE_ASSETLINKS_URL,status:200,redirected:false,contentType:'application/json; charset=utf-8',body:good};
test('explicit opt-in, separate absolute SDK and revision-bound destination required',()=>{
 assert.equal(requireLoginReleaseInputs(env).revision,sha);
 for (const key of Object.keys(env)) assert.throws(()=>requireLoginReleaseInputs({...env,[key]:undefined}));
 assert.throws(()=>requireLoginReleaseInputs({...env,AURION_LOGIN_GRADLE_SDK_ROOT:'/tmp/login-results'}),/must differ/);
 assert.throws(()=>requireLoginReleaseInputs({...env,AURION_EXPECTED_REVISION:'ABC'}),/exact lowercase/);
});
test('packaged Login config binds the exact build and enables native auth',()=>{
 const enabled=`[aurion]\nclient_build="${sha}"\nnative_auth_start_enabled=true\n`;
 assert.equal(createLoginOverride(sha),enabled);
 assert.throws(()=>createLoginOverride('ABC'),/lowercase/);
 assert.equal(assertPackagedBuildRevision(enabled,sha),sha);
 assert.throws(()=>assertPackagedBuildRevision(`[aurion]\nclient_build="${'b'.repeat(40)}"\nnative_auth_start_enabled=true\n`,sha));
 assert.throws(()=>assertPackagedBuildRevision(`[aurion]\nclient_build="${sha}"\n`,sha),/enable native auth/);
 assert.throws(()=>assertPackagedBuildRevision(`[aurion]\nclient_build="${sha}"\nnative_auth_start_enabled=false\n`,sha),/enable native auth/);
 assert.throws(()=>assertPackagedBuildRevision(enabled+'login_token="secret"\n',sha));
});
test('DAL accepts only the intended package plus persistent certificate',()=>{
 assert.match(checkAssetlinksDocument(response,pkg,fp).sha256,/^[a-f0-9]{64}$/);
 for(const broken of [{...response,status:302},{...response,url:'http://arelogic.space/.well-known/assetlinks.json'},{...response,redirected:true},{...response,contentType:'text/html'},{...response,body:'{invalid'},{...response,body:JSON.stringify([{...JSON.parse(good)[0],target:{...JSON.parse(good)[0].target,package_name:'org.fake'}}])},{...response,body:JSON.stringify([{...JSON.parse(good)[0],relation:['wrong']}])},{...response,body:' '.repeat(65537)}]) assert.throws(()=>checkAssetlinksDocument(broken,pkg,fp));
 assert.throws(()=>checkAssetlinksDocument(response,pkg,'00:'.repeat(31)+'00'));
});

test('streaming DAL fetch uses exact HTTPS endpoint and rejects oversized responses',async()=>{
 const {verifyLiveAssetlinks}=await import('./login-release-gates.mjs');
 let requested;
 const fetcher=async (url,opts)=>{
  requested={url,method:opts.method,redirect:opts.redirect,cache:opts.cache};
  return {url,status:200,redirected:false,headers:{get:()=> 'application/json'},body:(async function*(){yield Buffer.from(good)})()};
 };
 assert.equal((await verifyLiveAssetlinks({packageName:pkg,fingerprint:fp,fetcher})).status,'verified');
 assert.deepEqual(requested,{url:LIVE_ASSETLINKS_URL,method:'GET',redirect:'error',cache:'no-store'});
 const big=async url=>({url,status:200,redirected:false,headers:{get:()=> 'application/json'},body:(async function*(){yield Buffer.alloc(65537)})()});
 await assert.rejects(()=>verifyLiveAssetlinks({packageName:pkg,fingerprint:fp,fetcher:big}),/exceeds 64 KiB/);
});
