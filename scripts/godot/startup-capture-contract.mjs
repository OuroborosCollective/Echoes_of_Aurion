import { cp, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHmac, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function readStartupRuntimeIdentity(url, failure) {
  const response = await fetch(url, {signal:AbortSignal.timeout(10_000)});
  if (!response.ok) throw Error(failure);
  const value = await response.json();
  return Object.fromEntries(['status','revision','runtimeImageDigest'].map(key => [key, value[key]]));
}

export function assertDistinctCaptureUsers(web, native) {
  if (![web?.id,native?.id].every(id => Number.isSafeInteger(id) && id > 0)) throw Error('CAPTURE_IDENTITIES_UNVERIFIED');
  if (web.id === native.id) throw Error('CAPTURE_IDENTITIES_SUPERSEDE');
}

export async function verifyEditorExecutable(binary, engine) {
  try {
    const receipt = JSON.parse(await readFile(join(dirname(binary), '..', 'editor-receipt.json'), 'utf8'));
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(binary)) hash.update(bytes);
    const binarySha256 = hash.digest('hex');
    if (basename(binary) !== engine.file || receipt.archiveSha256 !== engine.sha256 || receipt.version !== engine.version || receipt.binarySha256 !== binarySha256) throw Error();
    return {archiveSha256:receipt.archiveSha256,binarySha256,version:receipt.version};
  } catch { throw Error('GODOT_EXECUTABLE_UNVERIFIED'); }
}

export async function awaitDurableTick(read, tick, {timeoutMs=10_000, pollMs=100, now=Date.now, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  const deadline = now() + timeoutMs;
  do {
    const entry = await read();
    if (entry !== null) {
      if (!entry?.receipt || entry.receipt.tick !== tick) throw Error('CANONICAL_READBACK_INVALID');
      return entry;
    }
    if (now() >= deadline) throw Error('CANONICAL_RECEIPT_PERSISTENCE_TIMEOUT');
    await sleep(pollMs);
  } while (true);
}

export async function prepareCaptureProject(source, destination) {
  // The capture-only editor setting is applied to a private source copy.
  // Assets/game scripts stay byte-identical; neither the working tree nor the
  // owner's existing editor cache/settings are changed.
  await cp(source, destination, { recursive: true, filter: path => basename(path) !== '.godot' });
  const path = join(destination, 'project.godot');
  const sourceSettings = await readFile(path, 'utf8');
  let changed = false;
  const settings = sourceSettings.replace(/(\[editor_plugins\]\r?\n)([\s\S]*?)(?=\n\[|$)/, (_all, section, content) => {
    const next = content.replace(/^enabled=PackedStringArray\(([^)]*)\)$/m, (_line, plugins) => {
      changed = true;
      const plugin = '"res://addons/aurion_bridge/plugin.cfg"';
      return `enabled=PackedStringArray(${plugins}${plugins.includes(plugin) ? '' : (plugins.trim() ? ', ' : '') + plugin})`;
    });
    return section + next;
  });
  if (!changed) throw Error('EDITOR_PLUGIN_CONFIGURATION_UNRECOGNIZED');
  await writeFile(path, settings);
  return destination;
}

const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}' : JSON.stringify(value);

function publicCamera(camera, privateRunKey) {
  if (!camera || !['positionMm','targetMm'].every(field => Array.isArray(camera[field]) && camera[field].length === 3 &&
    camera[field].every(n => Number.isSafeInteger(n) && Math.abs(n) <= 10**10)) ||
    !Number.isSafeInteger(camera.fovMilliDeg) || camera.fovMilliDeg < 10000 || camera.fovMilliDeg > 150000) {
    throw Error('CAPTURE_CAMERA_INVALID');
  }
  // Following cameras reveal player locations too. Keep exact absolute equality
  // through run-private, domain-separated digests; publish only viewing geometry.
  const digest = field => createHmac('sha256', privateRunKey).update('camera:' + field + ':').update(stable(camera[field])).digest('hex');
  return {positionDigest:digest('positionMm'),targetDigest:digest('targetMm'),
    offsetMm:camera.positionMm.map((n,i)=>n-camera.targetMm[i]),fovMilliDeg:camera.fovMilliDeg};
}

export function publicObservation(raw, privateRunKey) {
  const snapshot = raw.snapshot;
  if (!snapshot || !Number.isSafeInteger(snapshot.tick) || typeof snapshot.zoneId !== 'string') throw Error('CAPTURE_SNAPSHOT_INVALID');
  const canonical = { zoneId: snapshot.zoneId, tick: snapshot.tick };
  for (const field of ['presences', 'mobs', 'combatants']) {
    if (!Array.isArray(snapshot[field])) throw Error('CAPTURE_SNAPSHOT_INVALID');
    canonical[field] = snapshot[field].map(stable).sort();
  }
  if (!snapshot.resources || !Number.isSafeInteger(snapshot.resources.revision) || !Array.isArray(snapshot.resources.nodes)) throw Error('CAPTURE_RESOURCES_INVALID');
  canonical.resources = {...snapshot.resources,nodes:snapshot.resources.nodes.map(stable).sort()};
  // Compare the real canonical payload in memory, without publishing live user
  // IDs/positions/combat state. The ephemeral HMAC key never leaves this run.
  const projectionDigest = createHmac('sha256', privateRunKey).update(stable(canonical)).digest('hex');
  const keep = ['schema','source','nonce','documentId','minimumTick','captureIndex','startedAtUtc','capturedAtUtc','frame','pid',
    'connected','worldVisible','worldId','stale','viewportPx','chunks','assets','actorCache','worldAssets','environmentPresent','timeOfDay'];
  const result = Object.fromEntries(keep.filter(k => Object.hasOwn(raw, k)).map(k => [k, raw[k]]));
  if (Object.hasOwn(raw, 'camera')) result.camera = publicCamera(raw.camera, privateRunKey);
  for (const key of ['player','npcs']) {
    const actor = raw[key];
    result[key] = actor ? Object.fromEntries(['visible','heightMeters','renderedHeightMeters','boneCount','animationDeferred'].filter(k=>Object.hasOwn(actor,k)).map(k=>[k,actor[k]])) : null;
  }
  if (Array.isArray(raw.actors)) result.actors = raw.actors.map(actor => ({ assetId: actor.assetId }));
  result.snapshot = { tick: snapshot.tick, zoneId: snapshot.zoneId, projectionDigest,
    presenceCount: snapshot.presences.length, mobCount: snapshot.mobs.length };
  return result;
}
