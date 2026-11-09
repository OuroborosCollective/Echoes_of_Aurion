import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  addSanctumSurfaceDetails,
  disposeWorldSurfaceAtlas,
  getWorldSurfaceAtlasEvidence,
  mapWorldGround,
  subscribeWorldSurfaceAtlasEvidence,
  worldSurfaceMaterial,
  WORLD_SURFACE_ATLAS_SHA256,
} from "./WorldSurfaceAtlas";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function digestBuffer(hex: string): ArrayBuffer {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], pair =>
    Number.parseInt(pair, 16)
  ).buffer;
}
function imageHarness(
  options: {
    width?: number;
    height?: number;
    digest?: string;
    networkError?: boolean;
    httpOk?: boolean;
    decodeError?: boolean;
    fetchPromise?: Promise<Response>;
  } = {}
) {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const bitmapClose = vi.fn();
  const bitmap = {
    width: options.width ?? 1024,
    height: options.height ?? 1024,
    close: bitmapClose,
  };
  const response = {
    ok: options.httpOk ?? true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  } as unknown as Response;
  const fetchMock = vi.fn(
    () =>
      options.fetchPromise ??
      (options.networkError
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(response))
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", {
    subtle: {
      digest: vi
        .fn()
        .mockResolvedValue(
          digestBuffer(options.digest ?? WORLD_SURFACE_ATLAS_SHA256)
        ),
    },
  });
  const bitmapMock = vi.fn(
    options.decodeError
      ? () => Promise.reject(new Error("decode failed"))
      : async () => bitmap
  );
  vi.stubGlobal("createImageBitmap", bitmapMock);
  return { drawImage, bitmapClose, bitmapMock, fetchMock };
}
async function finishAtlasLoad(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe("Aurion surface atlas verification and lifetime", () => {
  it("pins the shipped WebP bytes to the reviewed digest", () => {
    const bytes = readFileSync(
      resolve(
        process.cwd(),
        "client/src/xaurion/world/assets/aurion-surface-atlas.webp"
      )
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      WORLD_SURFACE_ATLAS_SHA256
    );
  });

  it("shares one verified fetch, extracts four exact tiles and exposes map bindings", async () => {
    const harness = imageHarness();
    const scene = new THREE.Scene();
    const woodA = worldSurfaceMaterial(scene, "wood");
    const woodB = worldSurfaceMaterial(scene, "wood");
    const rock = worldSurfaceMaterial(scene, "rock");
    expect(woodA.map).toBe(woodB.map);
    expect(woodA.map).not.toBe(rock.map);
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    await finishAtlasLoad();

    const evidence = getWorldSurfaceAtlasEvidence(scene);
    expect(evidence).toMatchObject({
      status: "ready",
      expectedSha256: WORLD_SURFACE_ATLAS_SHA256,
      actualSha256: WORLD_SURFACE_ATLAS_SHA256,
      imageWidth: 1024,
      imageHeight: 1024,
      tileCount: 4,
      tileWidth: 512,
      tileHeight: 512,
      materialBindings: { wood: 2, rock: 1, paving: 0, forest: 0 },
    });
    expect(harness.drawImage.mock.calls.map(call => call.slice(1, 5))).toEqual([
      [0, 0, 512, 512],
      [512, 0, 512, 512],
      [0, 512, 512, 512],
      [512, 512, 512, 512],
    ]);
    expect(woodA.map!.image.width).toBe(512);
    expect(woodA.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(harness.bitmapClose).toHaveBeenCalledTimes(1);

    const release = vi.fn();
    woodA.map!.addEventListener("dispose", release);
    disposeWorldSurfaceAtlas(scene);
    disposeWorldSurfaceAtlas(scene);
    expect(release).toHaveBeenCalledTimes(1);
    expect(getWorldSurfaceAtlasEvidence(scene).status).toBe("not_initialized");
    expect(worldSurfaceMaterial(scene, "wood").map).not.toBe(woodA.map);
    disposeWorldSurfaceAtlas(scene);
  });

  it("publishes loading and completion evidence to an active runtime subscriber", async () => {
    imageHarness();
    const scene = new THREE.Scene();
    worldSurfaceMaterial(scene, "paving");
    const listener = vi.fn();
    const unsubscribe = subscribeWorldSurfaceAtlasEvidence(scene, listener);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "loading",
        materialBindings: expect.objectContaining({ paving: 1 }),
      })
    );
    await finishAtlasLoad();
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "ready",
        actualSha256: WORLD_SURFACE_ATLAS_SHA256,
      })
    );
    unsubscribe();
    disposeWorldSurfaceAtlas(scene);
  });

  it("reports network failure while preserving the neutral fallback", async () => {
    imageHarness({ networkError: true });
    const scene = new THREE.Scene();
    const material = worldSurfaceMaterial(scene, "paving");
    const placeholder = material.map!.image;
    await finishAtlasLoad();
    expect(getWorldSurfaceAtlasEvidence(scene)).toMatchObject({
      status: "failed",
      failureCode: "NETWORK_ERROR",
    });
    expect(material.map!.image).toBe(placeholder);
    disposeWorldSurfaceAtlas(scene);
  });

  it("reports non-OK HTTP and decode errors explicitly", async () => {
    imageHarness({ httpOk: false });
    const httpScene = new THREE.Scene();
    worldSurfaceMaterial(httpScene, "paving");
    await finishAtlasLoad();
    expect(getWorldSurfaceAtlasEvidence(httpScene).failureCode).toBe(
      "HTTP_STATUS"
    );
    disposeWorldSurfaceAtlas(httpScene);

    imageHarness({ decodeError: true });
    const decodeScene = new THREE.Scene();
    worldSurfaceMaterial(decodeScene, "paving");
    await finishAtlasLoad();
    expect(getWorldSurfaceAtlasEvidence(decodeScene).failureCode).toBe(
      "IMAGE_DECODE_FAILED"
    );
    disposeWorldSurfaceAtlas(decodeScene);
  });

  it("rejects unexpected bytes and dimensions before changing texture maps", async () => {
    imageHarness({ digest: "0".repeat(64) });
    const hashScene = new THREE.Scene();
    const hashMaterial = worldSurfaceMaterial(hashScene, "paving");
    const hashPlaceholder = hashMaterial.map!.image;
    await finishAtlasLoad();
    expect(getWorldSurfaceAtlasEvidence(hashScene)).toMatchObject({
      status: "failed",
      failureCode: "SHA256_MISMATCH",
    });
    expect(hashMaterial.map!.image).toBe(hashPlaceholder);
    disposeWorldSurfaceAtlas(hashScene);

    imageHarness({ width: 768, height: 1024 });
    const dimensionsScene = new THREE.Scene();
    const dimensionsMaterial = worldSurfaceMaterial(dimensionsScene, "paving");
    const dimensionsPlaceholder = dimensionsMaterial.map!.image;
    await finishAtlasLoad();
    expect(getWorldSurfaceAtlasEvidence(dimensionsScene)).toMatchObject({
      status: "failed",
      failureCode: "DIMENSIONS_MISMATCH",
      imageWidth: 768,
      imageHeight: 1024,
    });
    expect(dimensionsMaterial.map!.image).toBe(dimensionsPlaceholder);
    disposeWorldSurfaceAtlas(dimensionsScene);
  });

  it("does not resurrect an atlas after scene disposal while a fetch is pending", async () => {
    let resolveFetch!: (response: Response) => void;
    const pendingResponse = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
    const harness = imageHarness({ fetchPromise: pendingResponse });
    const scene = new THREE.Scene();
    const material = worldSurfaceMaterial(scene, "forest");
    const placeholder = material.map!.image;
    disposeWorldSurfaceAtlas(scene);
    resolveFetch({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    } as unknown as Response);
    await finishAtlasLoad();
    expect(material.map!.image).toBe(placeholder);
    expect(harness.bitmapMock).not.toHaveBeenCalled();
  });

  it("keeps world positions intact and adjoining chunk border UVs identical", () => {
    const a = new THREE.PlaneGeometry(80, 80, 2, 2).rotateX(-Math.PI / 2);
    const b = a.clone();
    const positions = Array.from(a.attributes.position.array);
    mapWorldGround(a);
    mapWorldGround(b, 80, 0);
    expect(Array.from(a.attributes.position.array)).toEqual(positions);
    expect(a.attributes.uv.getX(2)).toBe(b.attributes.uv.getX(0));
    expect(a.attributes.uv.getY(2)).toBe(b.attributes.uv.getY(0));
  });

  it("bounds decorative geometry to one instanced draw and 960 triangles", () => {
    imageHarness();
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    addSanctumSurfaceDetails(scene, group);
    expect(group.children).toHaveLength(1);
    const mesh = group.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(48);
    expect((mesh.geometry.attributes.position.count / 3) * mesh.count).toBe(
      960
    );
    disposeWorldSurfaceAtlas(scene);
  });
});
