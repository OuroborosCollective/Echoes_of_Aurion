import { globalHistoricalWorldStateService } from "../server/history/historicalWorldStateService";

async function main() {
  const args = process.argv.slice(2);
  let worldId = "echoes-of-aurion-global";
  let epoch = 0;
  let subjectId: string | undefined;
  let domain: any = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--world" && args[i + 1]) {
      worldId = args[++i];
    } else if (args[i] === "--epoch" && args[i + 1]) {
      epoch = parseInt(args[++i], 10);
    } else if (args[i] === "--subject" && args[i + 1]) {
      subjectId = args[++i];
    } else if (args[i] === "--domain" && args[i + 1]) {
      domain = args[++i];
    }
  }

  const result = await globalHistoricalWorldStateService.reconstructStateAtEpoch({
    worldId,
    epoch,
    subjectId,
    domain,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
