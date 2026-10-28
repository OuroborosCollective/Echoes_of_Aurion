import assert from 'node:assert/strict';
import { createLoginOverride } from './login-release-gates.mjs';
const REVISION = /^[a-f0-9]{40}$/;
/** Explicitly offline Preview, not an Android Login release. */
export function createPreviewOverride(revision) {
  assert.match(revision, REVISION, 'exact Git revision required');
  return createLoginOverride(revision).replace('native_auth_start_enabled=true', 'native_auth_start_enabled=false');
}
/** Read back the exact packaged APK bytes, never merely the staged source. */
export function assertPackagedPreviewOverride(packed, revision) {
  assert.equal(packed, createPreviewOverride(revision), 'Preview APK must not impersonate signed Login');
  return revision;
}
