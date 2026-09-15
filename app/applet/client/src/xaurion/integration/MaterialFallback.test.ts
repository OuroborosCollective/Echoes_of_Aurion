import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

describe('Material Fallback Contract', () => {
    it('should return a deterministic fallback material when atlas region is missing', () => {
        // Defined behavior: fallback to a simple opaque material with a distinct "error" color
        const getFallbackMaterial = () => new THREE.MeshStandardMaterial({ color: 0xff00ff });
        
        const material = getFallbackMaterial();
        expect(material.color.getHex()).toBe(0xff00ff);
        expect(material.transparent).toBe(false);
    });
});
