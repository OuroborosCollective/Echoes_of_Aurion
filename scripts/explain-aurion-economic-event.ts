import { globalOwnershipLedger } from "../server/economy/ownershipLedger";
import { globalEconomicLedger } from "../server/economy/aurionEconomicLedger";

async function main() {
  const args = process.argv.slice(2);
  let assetId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--asset" && args[i + 1]) {
      assetId = args[++i];
    }
  }

  if (!assetId) {
    console.error("Usage: pnpm exec tsx scripts/explain-aurion-economic-event.ts --asset <assetId>");
    process.exit(1);
  }

  const lineage = await globalOwnershipLedger.getAssetLineage(assetId);
  const events = await globalEconomicLedger.getEventsForAsset(assetId);

  console.log(JSON.stringify({ assetId, lineage, rawEvents: events }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
