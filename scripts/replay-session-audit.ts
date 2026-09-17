import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Replay Session Audit CLI
 * usage: tsx scripts/replay-session-audit.ts [logfile.log]
 */
async function run() {
  const args = process.argv.slice(2);
  const logFile = args[0] || "sessionReplay.log";
  const logPath = path.join(process.cwd(), ".manus-logs", logFile);

  if (!existsSync(logPath)) {
    console.error(`[REPLAY ERROR] Log file not found: ${logPath}`);
    console.log("Check if .manus-logs/ directory exists and contains log files.");
    process.exit(1);
  }

  console.log(`\x1b[36m[AURION REPLAY]\x1b[0m Replaying session audit from \x1b[33m${logFile}\x1b[0m...`);
  
  const content = readFileSync(logPath, "utf-8");
  const lines = content.split("\n").filter(line => line.trim());
  
  let eventCount = 0;
  for (const line of lines) {
    const match = line.match(/^\[(.*?)\] (.*)$/);
    if (!match) continue;
    
    const timestamp = match[1];
    let event;
    try {
      event = JSON.parse(match[2]!);
    } catch (e) {
      continue;
    }
    
    eventCount++;
    const ts = timestamp ? new Date(timestamp).toLocaleTimeString() : "??:??:??";
    
    if (event.kind === "click") {
      console.log(`[\x1b[90m${ts}\x1b[0m] \x1b[32mCLICK\x1b[0m: ${event.payload.target?.selectorHint || "unknown element"}`);
    } else if (event.kind === "navigate") {
      console.log(`[\x1b[90m${ts}\x1b[0m] \x1b[35mNAVIGATE\x1b[0m: ${event.payload.reason} -> ${event.url}`);
    } else if (event.type === "fetch" || event.type === "xhr") {
      const statusColor = (event.response?.status || 0) >= 400 ? "\x1b[31m" : "\x1b[32m";
      console.log(`[\x1b[90m${ts}\x1b[0m] \x1b[34mNETWORK\x1b[0m: ${event.method} ${event.url} [${statusColor}${event.response?.status || '???'}\x1b[0m]`);
    } else if (event.level) {
      const levelColor = event.level === "ERROR" ? "\x1b[31m" : event.level === "WARN" ? "\x1b[33m" : "\x1b[37m";
      console.log(`[\x1b[90m${ts}\x1b[0m] ${levelColor}CONSOLE.${event.level}\x1b[0m: ${JSON.stringify(event.args)}`);
    } else if (event.kind === "change") {
      console.log(`[\x1b[90m${ts}\x1b[0m] \x1b[33mCHANGE\x1b[0m: ${event.payload.target?.name || "unnamed input"} value captured`);
    }
  }

  console.log(`\n\x1b[36m[AURION REPLAY]\x1b[0m Processed ${eventCount} events.`);
  console.log("\x1b[32mDeterministic replay analysis complete.\x1b[0m");
}

run().catch(err => {
  console.error("Fatal error during replay:", err);
  process.exit(1);
});
