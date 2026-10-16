export type AurionShutdownDependencies = Readonly<{
  closeZoneGateway: () => void;
  stopObservers: readonly (() => void)[];
  flushCausalPersistence: () => Promise<void>;
  closeHttpServer: () => Promise<void>;
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
  dependencies.closeZoneGateway();
  for (const stop of dependencies.stopObservers) stop();
  await dependencies.flushCausalPersistence();
  await dependencies.closeHttpServer();
}
