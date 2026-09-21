import { globalEconomicInvariantService } from "../server/economy/economicInvariantService";

async function main() {
  const args = process.argv.slice(2);
  let worldId = "echoes-of-aurion-global";
  let fromEpoch = 0;
  let toEpoch = 100000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--world" && args[i + 1]) {
      worldId = args[++i];
    } else if (args[i] === "--from-epoch" && args[i + 1]) {
      fromEpoch = parseInt(args[++i], 10);
    } else if (args[i] === "--to-epoch" && args[i + 1]) {
      toEpoch = parseInt(args[++i], 10);
    }
  }

  const report = await globalEconomicInvariantService.auditEconomy({
    worldId,
    fromEpoch,
    toEpoch,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
