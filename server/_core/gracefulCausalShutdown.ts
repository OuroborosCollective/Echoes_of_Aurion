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
  console.info("[Aurion] shutdown stage: zone-gateway-close");
  dependencies.closeZoneGateway();
  console.info("[Aurion] shutdown stage: observer-stop");
  for (const stop of dependencies.stopObservers) stop();
  console.info("[Aurion] shutdown stage: persistence-flush");
  await dependencies.flushCausalPersistence();
  console.info("[Aurion] shutdown stage: http-close");
  await dependencies.closeHttpServer();
  console.info("[Aurion] shutdown stage: complete");
}
