#!/usr/bin/env tsx
import { globalHeadlessCausalOracle } from "../server/causality/headlessCausalOracle";

function valueAfter(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1]! : null;
}

async function main() {
  const args = process.argv.slice(2);
  const zoneId = valueAfter(args, "--zone");
  const fromRaw = valueAfter(args, "--from-tick");
  const toRaw = valueAfter(args, "--to-tick");
  const fromTick = fromRaw === null ? NaN : Number(fromRaw);
  const toTick = toRaw === null ? NaN : Number(toRaw);

  if (
    !zoneId ||
    !Number.isSafeInteger(fromTick) ||
    !Number.isSafeInteger(toTick) ||
    fromTick < 1 ||
    toTick < fromTick
  ) {
    console.error("Usage: pnpm exec tsx scripts/oracle-aurion-zone.ts --zone <zoneId> --from-tick <n> --to-tick <n>");
    process.exit(64);
  }

  try {
    const result = await globalHeadlessCausalOracle.replayRange({ zoneId, fromTick, toTick });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.status === "MATCH" ? 0 : result.status === "FIRST_DIVERGENCE" ? 1 : 2);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

void main();
