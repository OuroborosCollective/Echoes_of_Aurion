export type StarterGlbBuildAsset = Readonly<{
  id: string;
  sourcePrefix: string;
  partCount: number;
  publicPath: string;
  publicUrl: string;
  compressedBytes: number;
  glbBytes: number;
  compressedSha256: string;
  glbSha256: string;
}>;

export const STARTER_GLB_BUILD_ASSETS = Object.freeze({
  player: Object.freeze({
    id: "aurion_humanoid_v1",
    sourcePrefix: "assets/starter-glb-payloads/characters/aurion_humanoid_v1.glb.gz.b64.part",
    partCount: 9,
    publicPath: "client/public/game-assets/characters/aurion_humanoid_v1.glb.gz",
    publicUrl: "/game-assets/characters/aurion_humanoid_v1.glb.gz",
    compressedBytes: 98113,
    glbBytes: 353240,
    compressedSha256: "2c7e62445d9ba9ce42e70818effe2a2598ae60c33db304ec5a33a70b69e820bd",
    glbSha256: "a8c9753dfecd5e1b3d3d3abf63322c90a507918572437108c108928be31b0806",
  }),
  spider: Object.freeze({
    id: "starter_spider",
    sourcePrefix: "assets/starter-glb-payloads/monsters/spider.glb.gz.b64.part",
    partCount: 58,
    publicPath: "client/public/game-assets/monsters/spider.glb.gz",
    publicUrl: "/game-assets/monsters/spider.glb.gz",
    compressedBytes: 685147,
    glbBytes: 1076716,
    compressedSha256: "ad625b0d0b58d9be51f5ee3fef7f3bb4497ab95beece9d4c2046b819935506f5",
    glbSha256: "f0637ee2d3895b2f2766b23d882f2d67091558ec264cf63d88dfeb0761fd549e",
  }),
  beastLod0: Object.freeze({
    id: "starter_beast_lod0",
    sourcePrefix: "assets/starter-glb-payloads/monsters/starter_beast_lod0.glb.gz.b64.part",
    partCount: 5,
    publicPath: "client/public/game-assets/monsters/starter_beast_lod0.glb.gz",
    publicUrl: "/game-assets/monsters/starter_beast_lod0.glb.gz",
    compressedBytes: 54953,
    glbBytes: 190220,
    compressedSha256: "a3e3d3d68cfcb746aa8f8adb4edfbe7de6649d26825816155b775802c5cf486b",
    glbSha256: "21ce04d1333ee442dcc035b72f4378d45acabf90c80139a32657a514c9a1a750",
  }),
  beastLod1: Object.freeze({
    id: "starter_beast_lod1",
    sourcePrefix: "assets/starter-glb-payloads/monsters/starter_beast_lod1.glb.gz.b64.part",
    partCount: 4,
    publicPath: "client/public/game-assets/monsters/starter_beast_lod1.glb.gz",
    publicUrl: "/game-assets/monsters/starter_beast_lod1.glb.gz",
    compressedBytes: 46153,
    glbBytes: 144944,
    compressedSha256: "a1ecdc268e01f8b0f2385e2f9a0e0800a6a7d5c0c06d35a74045e41abcbf5f1d",
    glbSha256: "3e7ae45067de509fd96324d16011c41d0a44ca3556a9941481e45ff5ba4dd83a",
  }),
  beastLod2: Object.freeze({
    id: "starter_beast_lod2",
    sourcePrefix: "assets/starter-glb-payloads/monsters/starter_beast_lod2.glb.gz.b64.part",
    partCount: 4,
    publicPath: "client/public/game-assets/monsters/starter_beast_lod2.glb.gz",
    publicUrl: "/game-assets/monsters/starter_beast_lod2.glb.gz",
    compressedBytes: 37774,
    glbBytes: 110396,
    compressedSha256: "69869b090ab1631b5214664c6444ab5041f86a24ad2b13e6d0a4973338b680ee",
    glbSha256: "28666bdc1bc76953d3acb3372936cf68fa690d835085a5ca2d4b5b3443f5e861",
  }),
  beastLod3: Object.freeze({
    id: "starter_beast_lod3",
    sourcePrefix: "assets/starter-glb-payloads/monsters/starter_beast_lod3.glb.gz.b64.part",
    partCount: 3,
    publicPath: "client/public/game-assets/monsters/starter_beast_lod3.glb.gz",
    publicUrl: "/game-assets/monsters/starter_beast_lod3.glb.gz",
    compressedBytes: 30165,
    glbBytes: 90584,
    compressedSha256: "aa6478f8d2cb5e442d39c0e62302e02ab970f91c017cc0c84b0bbf3ea0ee042e",
    glbSha256: "19af716bd1df24b855e98d600e78812e92d98e397d0e65412d54d9ca5bfe0d4a",
  }),
} satisfies Record<string, StarterGlbBuildAsset>);

export const STARTER_GLB_BUILD_ASSET_LIST = Object.freeze(Object.values(STARTER_GLB_BUILD_ASSETS));
