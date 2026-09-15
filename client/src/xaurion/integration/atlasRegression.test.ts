import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Atlas Manifest Regression', () => {
    const manifestDir = path.resolve(__dirname, '../../../assets/textures/aurion/manifests');
    const files = fs.readdirSync(manifestDir).filter(f => f.endsWith('.json'));

    files.forEach(file => {
        it(`should have valid UV bounds and structure for ${file}`, () => {
            const content = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf-8'));
            
            // Validate UV Bounds
            content.regions.forEach((region: any) => {
                expect(region.u0).toBeGreaterThanOrEqual(0);
                expect(region.u1).toBeLessThanOrEqual(1);
                expect(region.u0).toBeLessThan(region.u1);
                expect(region.v0).toBeGreaterThanOrEqual(0);
                expect(region.v1).toBeLessThanOrEqual(1);
                expect(region.v0).toBeLessThan(region.v1);
            });

            // Validate Manifest ID existence
            expect(content.manifestHash).toBeDefined();
            expect(typeof content.manifestHash).toBe('string');
        });
    });
});
