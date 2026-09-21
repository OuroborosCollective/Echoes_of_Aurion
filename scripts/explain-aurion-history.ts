import { globalCausalHistoryExplainService } from "../server/history/causalHistoryExplainService";

async function main() {
  const args = process.argv.slice(2);
  let worldId = "echoes-of-aurion-global";
  let epoch = 0;
  let fact = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--world" && args[i + 1]) {
      worldId = args[++i];
    } else if (args[i] === "--epoch" && args[i + 1]) {
      epoch = parseInt(args[++i], 10);
    } else if (args[i] === "--fact" && args[i + 1]) {
      fact = args[++i];
    }
  }

  if (!fact) {
    console.error("Usage: pnpm exec tsx scripts/explain-aurion-history.ts --fact <factOrEventId> [--world <worldId>] [--epoch <epoch>]");
    process.exit(1);
  }

  const result = await globalCausalHistoryExplainService.explainFactAtEpoch({
    worldId,
    targetFactOrEventId: fact,
    epoch,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
