import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const sceneIndex = process.argv.indexOf("--scene");
const outputIndex = process.argv.indexOf("--output");
const scene = sceneIndex >= 0 ? process.argv[sceneIndex + 1] : null;
const outputArg = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;

const hash = value => createHash("sha256").update(value).digest("hex");
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));

function requireScene() {
  if (scene !== "starting-village") throw new Error("AURION_GDS_SCENE_REQUIRED: starting-village");
}

async function loadContract() {
  const catalog = await readJson("shared/worldAssetCatalog.json");
  let returnStoneContractPresent = false;
  try {
    await readFile(path.join(root, "shared/aurionReturnStoneContract.ts"), "utf8");
    returnStoneContractPresent = true;
  } catch {}
  if (!Array.isArray(catalog.assets) || catalog.assets.length === 0) {
    throw new Error("AURION_GDS_WORLD_CATALOG_EMPTY");
  }
  return {
    adapter: "aurion",
    adapterVersion: "1.0.0",
    worldAssetCatalogVersion: catalog.version,
    worldAssetCatalogHash: hash(JSON.stringify(catalog)),
    returnStoneContractPresent,
    authority: {
      gameplay: "aurion",
      worldPersistence: "aurion",
      renderer: "client",
      gds: "visual-authoring-and-evidence"
    }
  };
}

function placements() {
  const radius = 48;
  const roadHalfWidth = 5;
  const gateOffset = 72;
  const innerParcels = [
    { id: "forge", x: -24, z: -24, role: "blacksmith" },
    { id: "equipment-merchant", x: 24, z: -24, role: "equipment-merchant" },
    { id: "general-merchant", x: 24, z: 24, role: "general-merchant" },
    { id: "carpenter", x: -24, z: 24, role: "carpenter" }
  ];
  return {
    spawn: { id: "starter-spawn", x: 0, z: 0, preserveExisting: true },
    ringRoad: { radius, width: roadHalfWidth * 2, segments: 64 },
    radialRoads: ["north", "east", "south", "west"].map(direction => ({ direction, from: 0, to: gateOffset })),
    gates: ["north", "east", "south", "west"].map(direction => ({ direction, count: 1, guard: `guard-${direction}` })),
    north: {
      cottage: { id: "north-farmer-cottage", distance: 108 },
      wheatField: { id: "north-wheat-field", distance: 126, interaction: "water" },
      wolves: { count: 6, questId: "starter-wolves-6" }
    },
    south: {
      meadow: true,
      river: { distance: 132, bridge: true },
      appleTreeQuest: { count: 10, target: "wasp", questId: "starter-apple-trees-10" }
    },
    innerParcels
  };
}

async function main() {
  if (args.has("--contract")) {
    console.log(JSON.stringify(await loadContract(), null, 2));
    return;
  }
  requireScene();
  const contract = await loadContract();
  const plan = {
    schema: "aurion.gds.starting-village.v1",
    sceneId: "starting-village",
    deterministicSeed: "aurion-starter-village-v1",
    contract,
    placement: placements(),
    gameplayHandoff: {
      questAuthority: "aurion.questCompiler",
      worldAuthority: "aurion",
      gdsDoesNotPublishGameplay: true,
      questDrafts: [
        { id: "starter-wolves-6", giver: "guard-north", objective: { target: "wolf", count: 6 }, reward: "starter-sword-or-equivalent" },
        { id: "starter-water-field", giver: "farmer-north", objective: { action: "water", target: "maize-or-field-plants" }, reward: "starter-farming-resource-or-food" },
        { id: "starter-apple-trees-10", giver: "tree-npc-south", objective: { target: "wasp", count: 10 }, reward: "starter-harvest-reward" }
      ]
    }
  };
  if (!args.has("--author")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (!outputArg) throw new Error("AURION_GDS_OUTPUT_REQUIRED");
  const dir = path.resolve(root, outputArg);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, "starting-village.world.json");
  const serialized = JSON.stringify(plan, null, 2) + "\n";
  await writeFile(target, serialized, "utf8");
  console.log(JSON.stringify({ written: path.relative(root, target), sha256: hash(serialized) }));
}

await main();
