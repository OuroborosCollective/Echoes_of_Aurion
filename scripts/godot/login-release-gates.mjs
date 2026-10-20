import assert from 'node:assert/strict';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateDomainAssociation } from './android-app-link.mjs';

export const LIVE_ASSETLINKS_URL = 'https://arelogic.space/.well-known/assetlinks.json';
export const LOGIN_APK_FILENAME = 'Aurion-Login.apk';
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED = ['AURION_LOGIN_GRADLE_SDK_ROOT','AURION_LOGIN_APK_OUTPUT','AURION_EXPECTED_REVISION'];

/** No implicit release exports, no fallback to the Preview SDK or debug signer. */
export function requireLoginReleaseInputs(env) {
 assert.equal(env.AURION_LOGIN_ALLOW_SIGNED_EXPORT, '1', 'explicit signed login export authorization required');
 for (const key of REQUIRED) {
  assert.ok(typeof env[key] === 'string' && env[key].length > 0, key + ' required');
  assert.ok(key === 'AURION_EXPECTED_REVISION' || isAbsolute(env[key]), key + ' must be absolute');
 }
 assert.match(env.AURION_EXPECTED_REVISION, SHA, 'exact lowercase 40-digit git revision required');
 assert.notEqual(resolve(env.AURION_LOGIN_APK_OUTPUT),resolve(env.AURION_LOGIN_GRADLE_SDK_ROOT), 'APK output must differ from SDK');
 return Object.freeze({sdkRoot:env.AURION_LOGIN_GRADLE_SDK_ROOT,outputDirectory:env.AURION_LOGIN_APK_OUTPUT,revision:env.AURION_EXPECTED_REVISION});
}

export function assertPackagedBuildRevision(override, expectedRevision) {
 assert.match(expectedRevision,SHA);
 assert.equal(override, `[aurion]\nclient_build="${expectedRevision}"\nnative_auth_start_enabled=true\n`,'packaged Login config must bind exact source and enable native auth');
 return expectedRevision;
}

/** Validate HTTPS endpoint response bytes; fixtures are contract tests, not live proof. */
export function checkAssetlinksDocument({url,status,redirected,contentType,body}, packageName, fingerprint) {
 assert.equal(url,LIVE_ASSETLINKS_URL,'assetlinks endpoint must be canonical HTTPS URL');
 assert.equal(redirected,false,'DAL redirects are forbidden');
 assert.equal(status,200,'DAL endpoint did not return HTTP 200');
 assert.match(contentType ?? '',/^application\/json(?:\s*;|\s*$)/i,'DAL content type must be JSON');
 assert.ok(typeof body === 'string' && Buffer.byteLength(body,'utf8') <= 65536,'DAL body exceeds limit');
 let statements;
 try { statements=JSON.parse(body); } catch { throw new Error('DAL invalid JSON'); }
 assert.ok(validateDomainAssociation(statements,packageName,fingerprint),'DAL exact package and certificate missing');
 return Object.freeze({status:'verified',sha256:createHash('sha256').update(body,'utf8').digest('hex'),source:LIVE_ASSETLINKS_URL});
}

export async function verifyLiveAssetlinks({packageName,fingerprint,fetcher=fetch}) {
 const controller=new AbortController();
 const deadline=AbortSignal.timeout(15000);
 const combined=AbortSignal.any([deadline,controller.signal]);
 const response=await fetcher(LIVE_ASSETLINKS_URL,{method:'GET',redirect:'error',cache:'no-store',signal:combined,headers:{Accept:'application/json'}});
 assert.ok(response.body,'DAL response body absent');
 const chunks=[];
 let size=0;
 for await(const chunk of response.body){
  size+=chunk.byteLength;
  if(size>65536){controller.abort();throw new Error('DAL response exceeds 64 KiB');}
  chunks.push(chunk);
 }
 return checkAssetlinksDocument({url:response.url,status:response.status,redirected:response.redirected,contentType:response.headers.get('content-type'),body:Buffer.concat(chunks).toString('utf8')},packageName,fingerprint);
}
