import { cp, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHmac } from 'node:crypto';

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

export function publicObservation(raw, privateRunKey) {
  const snapshot = raw.snapshot;
  if (!snapshot || !Number.isSafeInteger(snapshot.tick) || typeof snapshot.zoneId !== 'string') throw Error('CAPTURE_SNAPSHOT_INVALID');
  const canonical = { zoneId: snapshot.zoneId, tick: snapshot.tick };
  for (const field of ['presences', 'mobs', 'combatants']) {
    if (!Array.isArray(snapshot[field])) throw Error('CAPTURE_SNAPSHOT_INVALID');
    canonical[field] = snapshot[field].map(stable).sort();
  }
  // Compare the real canonical payload in memory, without publishing live user
  // IDs/positions/combat state. The ephemeral HMAC key never leaves this run.
  const projectionDigest = createHmac('sha256', privateRunKey).update(stable(canonical)).digest('hex');
  const keep = ['schema','source','nonce','documentId','captureIndex','startedAtUtc','capturedAtUtc','frame','pid',
    'connected','worldVisible','worldId','stale','viewportPx','camera','chunks','assets','actorCache','worldAssets','environmentPresent','timeOfDay'];
  const result = Object.fromEntries(keep.filter(k => Object.hasOwn(raw, k)).map(k => [k, raw[k]]));
  if (Array.isArray(raw.actors)) result.actors = raw.actors.map(actor => ({ assetId: actor.assetId }));
  result.snapshot = { tick: snapshot.tick, zoneId: snapshot.zoneId, projectionDigest,
    presenceCount: snapshot.presences.length, mobCount: snapshot.mobs.length };
  return result;
}
