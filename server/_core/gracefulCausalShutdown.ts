export type AurionShutdownDependencies = Readonly<{
  closeZoneGateway: () => void | Promise<void>;
  stopObservers: readonly (() => void)[];
  flushCausalPersistence: () => Promise<void>;
  closeHttpServer: () => Promise<void>;
  /** Causal persistence queue status; failed or pending writes fail the shutdown. */
  persistenceStatus?: () => Readonly<{ pending: number; failures: number }>;
}>;

/**
 * Drain order for process shutdown.
 *
 * Gameplay production is stopped before durable evidence is flushed so no new
 * 10 Hz receipt can be enqueued after the flush boundary. Observer services are
 * stopped next because they are never mutation authority. Only after causal
 * persistence is durable do we close the HTTP listener.
 */
export async function drainAurionRuntimeForShutdown(
  dependencies: AurionShutdownDependencies,
): Promise<void> {
  const before = dependencies.persistenceStatus?.();
  console.info("[Aurion] shutdown stage: zone-gateway-close");
  // A failed final presence-leave tick must fail the shutdown, but only after every
  // already-enqueued causal write has been flushed.
  let gatewayError: unknown;
  try { await dependencies.closeZoneGateway(); }
  catch (error) { gatewayError = error; console.error("[Aurion] shutdown zone-gateway-close failed", error); }
  console.info("[Aurion] shutdown stage: observer-stop");
  for (const stop of dependencies.stopObservers) stop();
  console.info("[Aurion] shutdown stage: persistence-flush");
  await dependencies.flushCausalPersistence();
  const after = dependencies.persistenceStatus?.();
  // The recorder counts failed writes instead of rejecting the flush, and a later
  // successful write does not repair an earlier one: any failed receipt leaves a gap
  // in the durable chain. Fail closed whenever this process has unresolved failures.
  if (after && (after.failures > 0 || after.pending > 0)) {
    throw new Error(`CAUSAL_SHUTDOWN_PERSISTENCE_INCOMPLETE:failures=${after.failures}${before ? `(+${after.failures - before.failures} during shutdown)` : ""},pending=${after.pending}`);
  }
  if (gatewayError !== undefined) throw new Error("CAUSAL_SHUTDOWN_ZONE_CLOSE_FAILED", { cause: gatewayError });
  console.info("[Aurion] shutdown stage: http-close");
  await dependencies.closeHttpServer();
  console.info("[Aurion] shutdown stage: complete");
}

/**
 * Docker sends SIGKILL after the container's stop_grace_period (30 s). A drain that
 * outlives it ends without any receipt, and the next process must recover a crash.
 * Fail explicitly before that point so the outcome is always logged.
 */
export const SHUTDOWN_DRAIN_DEADLINE_MS = 25_000;

export function withShutdownDeadline<T>(work: Promise<T>, deadlineMs: number = SHUTDOWN_DRAIN_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Referenced on purpose: it keeps the process alive until the drain settles or the deadline fires.
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`CAUSAL_SHUTDOWN_DEADLINE_EXCEEDED:${deadlineMs}ms`)), deadlineMs);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
