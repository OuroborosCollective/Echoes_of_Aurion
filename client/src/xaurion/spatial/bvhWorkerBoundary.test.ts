import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('BVH worker shipping boundary', () => {
  it('uses only locally bundled module dependencies and no runtime CDN imports', () => {
    const helper = read('client/src/xaurion/spatial/bvhWorkerHelper.ts');
    const worker = read('client/src/xaurion/spatial/bvhBuildWorker.ts');

    expect(helper).toContain("new URL('./bvhBuildWorker.ts', import.meta.url)");
    expect(helper).toContain("type: 'module'");
    expect(worker).toContain("import * as THREE from 'three'");
    expect(worker).toContain("import { MeshBVH } from 'three-mesh-bvh'");
    expect(helper).not.toMatch(/https?:\/\//);
    expect(worker).not.toMatch(/https?:\/\//);
    expect(helper).not.toContain('importScripts(');
    expect(worker).not.toContain('importScripts(');
  });

  it('rejects pending worker work on worker/message failure so main-thread fallback can run', () => {
    const helper = read('client/src/xaurion/spatial/bvhWorkerHelper.ts');
    expect(helper).toContain('private failWorker(message: string): void');
    expect(helper).toContain('callback.reject(error)');
    expect(helper).toContain('this.pendingCallbacks.clear()');
    expect(helper).toContain('this.worker.onerror');
    expect(helper).toContain('this.worker.onmessageerror');
    expect(helper).toContain('(geometry as any).computeBoundsTree(options)');
  });
});
