import * as THREE from 'three';

export interface TextureSubRegion {
  tileId: string;
  index: number;
  offsetX: number;
  offsetY: number;
  repeatX: number;
  repeatY: number;
}

export interface TextureAtlasDescriptor {
  id: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  subRegions: Map<string, TextureSubRegion>;
}

/**
 * AIM-276: Build-time / Init-time Texture Atlas Pipeline.
 * Enables PBR batching and UV sub-region mapping to eliminate runtime canvas churn
 * and reduce texture bindings across terrain and world meshes.
 */
export class TextureAtlasPipeline {
  private static atlasRegistry = new Map<string, TextureAtlasDescriptor>();

  /**
   * Registers a grid-based texture atlas layout deterministically.
   */
  public static registerAtlas(
    id: string,
    cols: number,
    rows: number,
    tileNames: string[],
    width = 1024,
    height = 1024
  ): TextureAtlasDescriptor {
    const subRegions = new Map<string, TextureSubRegion>();
    const repeatX = 1 / cols;
    const repeatY = 1 / rows;

    tileNames.forEach((name, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const offsetX = col * repeatX;
      // In UV space, Y=0 is bottom, so row 0 is top (1 - repeatY)
      const offsetY = 1 - (row + 1) * repeatY;

      subRegions.set(name, {
        tileId: name,
        index,
        offsetX,
        offsetY,
        repeatX,
        repeatY,
      });
    });

    const descriptor: TextureAtlasDescriptor = {
      id,
      cols,
      rows,
      width,
      height,
      subRegions,
    };

    this.atlasRegistry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Returns a registered atlas descriptor.
   */
  public static getAtlas(id: string): TextureAtlasDescriptor | undefined {
    return this.atlasRegistry.get(id);
  }

  /**
   * Remaps a BufferGeometry's UV attribute directly to target a specific tile within an atlas.
   * Modifies UVs in-place without altering vertex positions or collision geometry.
   */
  public static remapGeometryUVs(
    geometry: THREE.BufferGeometry,
    tileName: string,
    atlasId: string
  ): boolean {
    const atlas = this.atlasRegistry.get(atlasId);
    if (!atlas) return false;

    const subRegion = atlas.subRegions.get(tileName);
    if (!subRegion) return false;

    const uvAttr = geometry.getAttribute('uv');
    if (!uvAttr) return false;

    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);

      // Remap unit UV [0..1] into sub-region [offsetX .. offsetX + repeatX]
      const atlasU = subRegion.offsetX + (u % 1.0) * subRegion.repeatX;
      const atlasV = subRegion.offsetY + (v % 1.0) * subRegion.repeatY;

      uvAttr.setXY(i, atlasU, atlasV);
    }

    uvAttr.needsUpdate = true;
    return true;
  }

  /**
   * Configures a THREE.Texture instance's offset and repeat to map directly to an atlas sub-region
   * without requiring dynamic canvas cropping or extra DOM image allocation.
   */
  public static applyTextureSubRegion(
    texture: THREE.Texture,
    subRegion: TextureSubRegion
  ): THREE.Texture {
    texture.matrixAutoUpdate = false;
    texture.offset.set(subRegion.offsetX, subRegion.offsetY);
    texture.repeat.set(subRegion.repeatX, subRegion.repeatY);
    texture.updateMatrix();
    return texture;
  }
}
