import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { insertVerifiedLink } from './android-app-link.mjs';

/** Called on Godot's extracted pinned android/build/app/src/main/AndroidManifest.xml. */
export function prepareGradleLinkManifest(xml) {
 return insertVerifiedLink(xml);
}
/** Never create an ephemeral signer for native login. */
export function requireLoginSigner(env) {
 const required=['AURION_LOGIN_KEYSTORE_PATH','AURION_LOGIN_KEY_ALIAS','AURION_LOGIN_KEYSTORE_PASSWORD','AURION_LOGIN_KEY_PASSWORD','AURION_LOGIN_SIGNER_SHA256'];
 for(const key of required)assert.ok(typeof env[key]==='string' && env[key].length>0, key+' required');
 assert.ok(isAbsolute(env.AURION_LOGIN_KEYSTORE_PATH),'absolute operator keystore path required');
 assert.match(env.AURION_LOGIN_KEY_ALIAS,/^[A-Za-z0-9_.-]{2,80}$/);
 assert.match(env.AURION_LOGIN_SIGNER_SHA256,/^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/);
 return {keystorePath:env.AURION_LOGIN_KEYSTORE_PATH,alias:env.AURION_LOGIN_KEY_ALIAS,expectedFingerprint:env.AURION_LOGIN_SIGNER_SHA256};
}
