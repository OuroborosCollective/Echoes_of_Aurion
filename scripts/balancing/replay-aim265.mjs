import { writeFileSync } from "node:fs";
import { buildBalancingV2Report } from "./aim265-v2.ts";

const json = JSON.stringify(buildBalancingV2Report(), null, 2) + "\n";
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
