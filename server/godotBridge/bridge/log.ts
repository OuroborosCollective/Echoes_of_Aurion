export type Logger = (level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) => void;

/** JSON-Lines auf stdout/stderr – passt zu journald. */
export const defaultLogger: Logger = (level, msg, extra) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
};

export const silentLogger: Logger = () => undefined;
