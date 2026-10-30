import { startBridge } from './app.js';
import { loadConfig } from './config.js';
import { defaultLogger } from './log.js';

try {
  const cfg = loadConfig();
  const bridge = await startBridge(cfg);
  const shutdown = (sig: string): void => {
    defaultLogger('info', `${sig} – fahre herunter`);
    void bridge.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
} catch (err) {
  defaultLogger('error', `start fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
