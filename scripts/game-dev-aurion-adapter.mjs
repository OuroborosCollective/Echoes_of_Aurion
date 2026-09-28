#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const argv = process.argv.slice(2);
const args = new Set(argv);
const sceneIndex = argv.indexOf("--scene");
const outputIndex = argv.indexOf("--output");
const scene = sceneIndex >= 0 ? argv[sceneIndex + 1] : null;
const outputArg = outputIndex >= 0 ? argv[outputIndex + 1] : null;

const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function requireAurionInputs() {
  const [catalog, returnStoneSource] = await Promise.all([
    readJson("shared/worldAssetCatalog.json"),
    readFile(path.join(root, "shared/aurionReturnStoneContract.ts"), "utf8"),
  ]);
  if (typeof catalog.version !== "string" || !Array.isArray(catalog.assets) || catalog.assets.length === 0) {
    throw new Error("AURION_GDS_WORLD_ASSET_CATALOG_INVALID");
  }
  return Object.freeze({
    catalogVersion: catalog.version,
    catalogHash: sha256(JSON.stringify(catalog)),
    catalogAssetCount: catalog.assets.length,
    returnStoneContractHash: sha256(returnStoneSource),
  });
}

function requireScene() {
  if (scene !== "starting-village") throw new Error("AURION_GDS_SCENE_REQUIRED: starting-village");
}

function buildStartingVillagePlan(contract) {
  const gates = ["north", "east", "south", "west"];
  const businesses = [
    {
      id: "forge",
      parcel: "north-west",
      role: "blacksmith",
      assetRole: "approved-world-environment-building"
    },
    {
      id: "equipment-merchant",
      parcel: "north-east",
      role: "equipment-merchant",
      assetRole: "approved-world-environment-building"
    },
    {
      id: "general-merchant",
      parcel: "south-east",
      role: "general-merchant",
      assetRole: "approved-world-environment-building"
    },
    {
      id: "carpenter",
      parcel: "south-west",
      role: "carpenter",
      assetRole: "approved-world-environment-building"
    }
  ];

  return {
    schema: "aurion.gds.starting-village.v1",
    sceneId: "starting-village",
    deterministicSeed: "aurion-starter-village-v1",
    authority: {
      gameplay: "aurion",
      worldPersistence: "aurion",
      quests: "aurion.questCompiler",
      rendering: "client",
      gds: "visual-authoring-and-evidence"
    },
    contract,
    layout: {
      centralSpawn: {
        id: "starter-spawn",
        xMm: 0,
        zMm: 0,
        preserveExistingSpawn: true,
        preserveExistingCenterTeleporter: true
      },
      roads: {
        circular: { radiusMm: 48_000, widthMm: 10_000, segments: 64 },
        radial: gates.map(direction => ({
          direction,
          from: { xMm: 0, zMm: 0 },
          toGateDistanceMm: 72_000
        }))
      },
      cityWall: {
        shape: "circle",
        radiusMm: 84_000,
        gates: gates.map(direction => ({ direction, count: 1 }))
      }
    },
    north: {
      afterGate: {
        cottage: { id: "north-farmer-cottage", distanceMm: 108_000 },
        wheatField: {
          id: "north-wheat-field",
          distanceMm: 126_000,
          interaction: { kind: "water", deterministic: true }
        }
      },
      guard: {
        id: "guard-north",
        quest: {
          id: "starter-wolves-6",
          objective: { target: "wolf", count: 6 },
          reward: "starter-sword-or-equivalent",
          turnIn: "guard-north"
        }
      },
      farmer: {
        id: "farmer-north",
        quest: {
          id: "starter-water-field",
          objective: {
            kind: "interact",
            action: "water",
            target: "maize-or-field-plants"
          },
          reward: "starter-farming-resource-or-food",
          turnIn: "farmer-north"
        }
      }
    },
    south: {
      meadow: { left: true, right: true },
      river: { distanceMm: 132_000, bridge: true },
      treeNpc: {
        id: "tree-npc-south",
        quest: {
          id: "starter-apple-trees-10",
          objective: { target: "wasp", count: 10 },
          reward: "starter-harvest-reward",
          turnIn: "tree-npc-south"
        }
      }
    },
    innerParcels: businesses,
    guards: gates.map(direction => ({
      id: "guard-" + direction,
      gate: direction,
      placement: { at: "gate-entrance-and-end", sideSymmetric: true }
    })),
    gameplayHandoff: {
      questDraftsAreNotPublishedByGds: true,
      worldDesignRequiresAurionPlanConfirm: true,
      noRawWorldDeltaWrites: true,
      assetIdsAreResolvedOnlyAgainstApprovedAurionCatalog: true
    }
  };
}

async function main() {
  if (args.has("--contract")) {
    console.log(JSON.stringify({
      schema: "aurion.gds.adapter-contract.v1",
      adapterId: "aurion",
      adapterVersion: "1.0.0",
      ...await requireAurionInputs()
    }, null, 2));
    return;
  }

  requireScene();
  const contract = await requireAurionInputs();
  const plan = buildStartingVillagePlan(contract);

  if (!args.has("--author")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (!outputArg) throw new Error("AURION_GDS_OUTPUT_REQUIRED");
  const destination = path.resolve(root, outputArg);
  await mkdir(destination, { recursive: true });
  const manifest = JSON.stringify(plan, null, 2) + "\n";
  const target = path.join(destination, "starting-village.gds.json");
  await writeFile(target, manifest, "utf8");
  console.log(JSON.stringify({
    schema: "aurion.gds.authoring-receipt.v1",
    written: path.relative(root, target),
    planSha256: sha256(manifest),
    gameplayMutation: "none",
    aurionHandoffRequired: true
  }, null, 2));
}

await main();
