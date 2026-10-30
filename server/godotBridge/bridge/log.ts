import { operationalDate, type OperationalClock, hostOperationalClock } from '../../../shared/operationalClock.js';

export type Logger = (level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) => void;

/** JSON-Lines auf stdout/stderr – passt zu journald. */
export function createLogger(clock: OperationalClock = hostOperationalClock): Logger {
  return (level, msg, extra) => {
    const line = JSON.stringify({ ts: operationalDate(clock).toISOString(), level, msg, ...extra });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
}

export const defaultLogger = createLogger();

export const silentLogger: Logger = () => undefined;
