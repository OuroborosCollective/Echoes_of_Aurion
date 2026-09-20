import {
  buildProgressionCagProbe,
  buildWorldAssetScaleCagProbe,
  buildWorldChunkTerrainCagProbe,
  type ModelBounds,
} from "../../shared/aurionCagDesignProtocol";
import { generateBaseWorldChunk } from "../../shared/worldChunkProtocol";
import { worldAssetCatalog } from "../../shared/worldAssetProtocol";
import {
  requireWolframCagClient,
  wolframCagConfigurationStatus,
} from "../../server/wolframCag";
import { verifyAurionCagDesignSuite } from "../../server/aurionCagDesignOracle";

const status = wolframCagConfigurationStatus();
if (!status.configured) {
  process.stderr.write(`${JSON.stringify(status)}\n`);
  process.exitCode = 2;
} else {
  const client = requireWolframCagClient();
  const terrainChunk = generateBaseWorldChunk({
    worldId: "echoes-of-aurion-global",
    worldSeed: "echoes-of-aurion-v1",
    coordinate: { x: 0, z: 0 },
  });
  const representativeAsset = worldAssetCatalog.assets.find(asset => asset.id === "city-barrel01")
    ?? worldAssetCatalog.assets[0];
  if (!representativeAsset) throw new Error("WORLD_ASSET_CATALOG_EMPTY");

  const probes = [
    buildProgressionCagProbe("1"),
    buildProgressionCagProbe("1000"),
    buildProgressionCagProbe("1000000"),
    buildWorldChunkTerrainCagProbe(terrainChunk),
    buildWorldAssetScaleCagProbe(representativeAsset.category, representativeAsset.bounds as ModelBounds),
  ] as const;

  const receipts = await verifyAurionCagDesignSuite(probes, client);
  const allSupported = receipts.every(receipt => receipt.verdict === "SUPPORTED");
  process.stdout.write(`${JSON.stringify({
    protocol: "aurion.cag-design-ci.v1",
    status: allSupported ? "DESIGN_ORACLE_VERIFIED" : "DESIGN_ORACLE_NOT_VERIFIED",
    source: {
      progression: "server/wasdAurionSkillProgressionProtocol.ts",
      terrain: "shared/worldChunkProtocol.ts",
      modelScale: "shared/worldAssetCatalog.json",
    },
    receipts: receipts.map(receipt => ({
      kind: receipt.kind,
      verdict: receipt.verdict,
      expectedExact: receipt.expectedExact,
      observedExact: receipt.observedExact,
      requestSha256: receipt.requestSha256,
      responseSha256: receipt.responseSha256,
      providerUuidSha256: receipt.providerUuidSha256,
      providerCode: receipt.providerCode,
      failureFamily: receipt.failureFamily,
      mutationPerformed: receipt.mutationPerformed,
      secretValuesReturned: receipt.secretValuesReturned,
    })),
    mutationAuthority: "none",
  })}\n`);
  if (!allSupported) process.exitCode = 1;
}
