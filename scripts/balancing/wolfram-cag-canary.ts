import { runAurionWolframCagCanary, wolframCagConfigurationStatus } from "../../server/wolframCag";

const status = wolframCagConfigurationStatus();
if (!status.configured) {
  process.stderr.write(`${JSON.stringify(status)}\n`);
  process.exitCode = 2;
} else {
  const result = await runAurionWolframCagCanary();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
