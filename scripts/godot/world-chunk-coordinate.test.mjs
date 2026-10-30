import test from 'node:test';
import assert from 'node:assert/strict';
import { joinWorldChunkPositionMm, WORLD_CHUNK_SIZE_MM } from '../../shared/worldChunkCoordinates.ts';

test('centered Aurion chunk-local placements map to their exact world millimeters', () => {
  assert.equal(WORLD_CHUNK_SIZE_MM, 64_000);
  for (const [coordinate, localPositionMm, expected] of [
    [{ x: 0, z: 0 }, { x: 32_000, z: 32_000 }, { x: 0, z: 0 }],
    [{ x: 0, z: 0 }, { x: 0, z: 63_999 }, { x: -32_000, z: 31_999 }],
    [{ x: -1, z: 1 }, { x: 63_999, z: 0 }, { x: -32_001, z: 32_000 }],
    [{ x: 1_000_000, z: -1_000_000 }, { x: 63_999, z: 0 }, { x: 64_000_031_999, z: -64_000_032_000 }],
  ]) assert.deepEqual(joinWorldChunkPositionMm({ coordinate, localPositionMm }), expected);
});

test('non-integer or out-of-range chunk and local values are rejected', () => {
  for (const x of [NaN, Infinity, 1.5, -1, 64_000]) {
    assert.throws(() => joinWorldChunkPositionMm({ coordinate: { x: 0, z: 0 }, localPositionMm: { x, z: 0 } }));
  }
  for (const x of [NaN, Infinity, 0.5, -1_000_001, 1_000_001]) {
    assert.throws(() => joinWorldChunkPositionMm({ coordinate: { x, z: 0 }, localPositionMm: { x: 0, z: 0 } }));
  }
});
